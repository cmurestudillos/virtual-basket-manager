import {
  loanInRequestSchema,
  loanOutRequestSchema,
  marketSearchRequestSchema,
  offerRequestSchema,
  playerIdRequestSchema,
  renewRequestSchema,
  type ContractEntry,
  type LoanEntry,
  type LoanRequest,
  type MarketOfferResult,
  type MarketPlayer,
  type MarketSearchRequest,
  type MarketStatus,
  type OfferRequest,
  type RenewRequest
} from '@shared/contracts/market.contract';
import type { PlayerSummary } from '@shared/contracts/players.contract';
import {
  TRANSFER_WINDOW_LABELS,
  acceptsLoan,
  askingPriceCents,
  contractYearsLeft,
  isWindowOpen,
  loanEndDate,
  marketValueCents,
  releaseCostCents,
  respondToOffer,
  wageDemandCents,
  windowFor
} from '@shared/domain/market';
import { MIN_HOMEGROWN, canLeave, canSign, wageCeilingCents } from '@shared/domain/squad-rules';
import { seasonSponsorshipCents, seasonTvRightsCents } from '@shared/domain/finance';
import {
  expectedAttendance,
  gateRevenueCents,
  seasonTicketPriceCents
} from '@shared/domain/attendance';
import type { Position } from '@shared/domain/positions';
import { MAX_ROSTER } from '@shared/domain/youth';
import { createRng, seedFromString } from '@shared/engine/basketball/rng';
import type { SaveDatabase } from '../../database/save-database';
import type { PlayerRow } from '../../database/schema/save';
import { ClubService } from '../club/club.service';
import { toPlayerSummary } from '../players/players.mapper';
import { scoutPlayer, scoutingErrorFor } from '../players/scouting';
import { StaffService } from '../staff/staff.service';
import { MarketRepository } from './market.repository';

/** Plantilla mínima de un club: por debajo, no se vende ni se rescinde. */
export const MIN_ROSTER = 10;
/** Y la que la IA considera corta y sale a cubrir en el mercado. */
const AI_TARGET_ROSTER = 12;
/** Partidos en casa de una liga de 18 equipos: la mitad de las 34 jornadas. */
const HOME_GAMES_PER_SEASON = 17;

export class NoManagedTeamError extends Error {
  constructor() {
    super('La partida no tiene equipo asignado');
    this.name = 'NoManagedTeamError';
  }
}

export class WindowClosedError extends Error {
  constructor() {
    super('El mercado está cerrado');
    this.name = 'WindowClosedError';
  }
}

export class SquadFullError extends Error {
  constructor() {
    super(`La plantilla ya tiene ${MAX_ROSTER} jugadores`);
    this.name = 'SquadFullError';
  }
}

export class SquadTooSmallError extends Error {
  constructor(reason = `No puedes bajar de ${MIN_ROSTER} jugadores`) {
    super(reason);
    this.name = 'SquadTooSmallError';
  }
}

export class PlayerNotAvailableError extends Error {
  constructor() {
    super('Ese jugador no está en el mercado');
    this.name = 'PlayerNotAvailableError';
  }
}

export class NotYourPlayerError extends Error {
  constructor() {
    super('Ese jugador no es tuyo');
    this.name = 'NotYourPlayerError';
  }
}

/**
 * El mercado.
 *
 * Un fichaje necesita cuadrar tres cosas a la vez: lo que pide el club que lo
 * tiene, lo que pide el jugador de ficha y lo que hay en caja. Por eso la
 * respuesta a una oferta llega con su motivo — «pide más ficha», «el club pide
 * más»— en vez de un no a secas.
 *
 * Lo que ves de un jugador de fuera pasa por el ojeador: la media que enseña
 * esta pantalla lleva su margen de error, así que fichar siempre es apostar.
 */
export class MarketService {
  /** Ver el porqué del resolutor en {@link SeasonService}. */
  constructor(private readonly resolveDb: () => SaveDatabase) {}

  getStatus(): MarketStatus {
    const repository = new MarketRepository(this.resolveDb());
    const teamId = this.requireManagedTeam(repository);
    const today = repository.currentDate();
    const window = windowFor(today);

    return {
      window,
      windowLabel: TRANSFER_WINDOW_LABELS[window],
      isOpen: window !== 'closed',
      balanceCents: repository.findTeam(teamId)?.budgetCents ?? 0,
      rosterSize: repository.countRoster(teamId),
      maxRoster: MAX_ROSTER,
      seasonWagesCents: repository.seasonWagesCents(teamId),
      wageCeilingCents: this.wageCeiling(repository, teamId),
      homegrownInSquad: this.homegrownCount(repository, teamId),
      minHomegrown: MIN_HOMEGROWN
    };
  }

  /**
   * Tope de nómina, medido contra lo que el club ingresa en una temporada:
   * televisión, patrocinio, abonos y la taquilla que cabe esperar.
   *
   * No es un _salary cap_ con sanciones y excepciones como el de la NBA: es un
   * consejo europeo que no firma lo que no se puede pagar. Si algún día entra
   * formato NBA, ese tope es otra pieza distinta.
   */
  private wageCeiling(repository: MarketRepository, teamId: string): number {
    const team = repository.findTeam(teamId);
    if (!team) {
      return 0;
    }

    const attendance = expectedAttendance({
      capacity: team.pavilionCapacity,
      seasonTicketHolders: team.seasonTicketHolders,
      fanSupport: team.fanSupport,
      ticketPriceCents: team.ticketPriceCents,
      opponentReputation: 50
    });
    const gate =
      gateRevenueCents(attendance, team.seasonTicketHolders, team.ticketPriceCents) *
      HOME_GAMES_PER_SEASON;

    const income =
      seasonTvRightsCents(team.reputation) +
      seasonSponsorshipCents(team.reputation, team.pavilionCapacity) +
      team.seasonTicketHolders * seasonTicketPriceCents(team.ticketPriceCents) +
      gate;

    return wageCeilingCents(income);
  }

  /** Cuántos jugadores del país del club hay inscritos. */
  private homegrownCount(repository: MarketRepository, teamId: string): number {
    const country = repository.findTeam(teamId)?.country;
    return repository.listRoster(teamId).filter((row) => row.nationality === country).length;
  }

  /** Quién hay en el mercado, con la media que haya podido ver tu ojeador. */
  search(request: MarketSearchRequest): MarketPlayer[] {
    const validated = marketSearchRequestSchema.parse(request ?? {});
    const repository = new MarketRepository(this.resolveDb());
    const teamId = this.requireManagedTeam(repository);
    const today = repository.currentDate();
    const names = repository.teamNames();
    const country = repository.findTeam(teamId)?.country;
    const error = scoutingErrorFor(new StaffService(this.resolveDb).levels(teamId).scout, false);

    return repository
      .listSignable(teamId)
      .map((row) => this.toMarketPlayer(row, today, names, error, country))
      .filter((player) => {
        if (validated.position && player.position !== validated.position) return false;
        if (validated.freeAgentsOnly && !player.isFreeAgent) return false;
        if (validated.maxAge !== null && player.age > validated.maxAge) return false;
        if (validated.maxFeeCents !== null && player.askingPriceCents > validated.maxFeeCents) {
          return false;
        }
        return true;
      })
      .sort((a, b) => b.overall - a.overall)
      .slice(0, validated.limit);
  }

  /**
   * Oferta por un jugador. Se resuelve al momento: el club contesta sí o no y
   * dice por qué, que es lo único que hace falta para poder volver a probar con
   * otra cifra.
   */
  offer(request: OfferRequest): MarketOfferResult {
    const validated = offerRequestSchema.parse(request);
    const repository = new MarketRepository(this.resolveDb());
    const teamId = this.requireManagedTeam(repository);
    const today = repository.currentDate();

    if (!isWindowOpen(today)) {
      throw new WindowClosedError();
    }
    if (repository.countRoster(teamId) >= MAX_ROSTER) {
      throw new SquadFullError();
    }

    const row = repository.findPlayer(validated.playerId);
    if (!row || row.isYouth || row.teamId === teamId) {
      throw new PlayerNotAvailableError();
    }
    // Un cedido no se ficha: pertenece a un club y juega en otro.
    if (row.loanFromTeamId) {
      throw new PlayerNotAvailableError();
    }

    // Reglamento antes que dinero: el cupo y el tope no se negocian.
    const rules = canSign({
      homegrownInSquad: this.homegrownCount(repository, teamId),
      squadSize: repository.countRoster(teamId),
      maxSquadSize: MAX_ROSTER,
      signingIsHomegrown: row.nationality === repository.findTeam(teamId)?.country,
      wageBillCents: repository.seasonWagesCents(teamId),
      wageOfferedCents: validated.wageCents,
      wageCeilingCents: this.wageCeiling(repository, teamId)
    });
    if (!rules.ok) {
      return { accepted: false, reason: rules.reason, status: this.getStatus() };
    }

    const summary = toPlayerSummary(row, today);
    const years = contractYearsLeft(row.contractUntil, today);
    const asking = row.teamId
      ? askingPriceCents({ valueCents: row.valueCents, contractYearsLeft: years, age: summary.age })
      : 0;
    const demand = wageDemandCents({
      valueCents: row.valueCents,
      currentWageCents: row.wageCents
    });

    const decision = respondToOffer({
      askingPriceCents: asking,
      feeCents: row.teamId ? validated.feeCents : 0,
      wageOfferedCents: validated.wageCents,
      wageDemandCents: demand,
      sellerRosterSize: row.teamId ? repository.countRoster(row.teamId) : Number.MAX_SAFE_INTEGER,
      minimumRosterSize: MIN_ROSTER
    });

    if (!decision.accepted) {
      return {
        accepted: false,
        reason: decision.reason,
        ...(decision.counterOfferCents === undefined
          ? {}
          : { counterOfferCents: decision.counterOfferCents }),
        status: this.getStatus()
      };
    }

    const fee = row.teamId ? validated.feeCents : 0;
    const balance = repository.findTeam(teamId)?.budgetCents ?? 0;
    if (fee > balance) {
      return {
        accepted: false,
        reason: 'No hay dinero en caja para ese traspaso',
        status: this.getStatus()
      };
    }

    this.sign({
      repository,
      row,
      toTeamId: teamId,
      feeCents: fee,
      wageCents: validated.wageCents,
      years: validated.years,
      today,
      summary
    });

    return {
      accepted: true,
      reason: `${summary.firstName} ${summary.lastName} firma por ${validated.years} ${
        validated.years === 1 ? 'temporada' : 'temporadas'
      }`,
      status: this.getStatus()
    };
  }

  /** Los contratos de tu plantilla: qué vence, qué cuesta renovar y qué rescindir. */
  listContracts(): ContractEntry[] {
    const repository = new MarketRepository(this.resolveDb());
    const teamId = this.requireManagedTeam(repository);
    const today = repository.currentDate();
    const country = repository.findTeam(teamId)?.country;

    return repository
      .listRoster(teamId)
      .map((row) => {
        const summary = toPlayerSummary(row, today);
        const years = contractYearsLeft(row.contractUntil, today);

        return {
          playerId: row.id,
          playerName: `${summary.firstName} ${summary.lastName}`,
          position: row.position as Position,
          age: summary.age,
          overall: summary.overall,
          wageCents: row.wageCents,
          contractUntil: row.contractUntil?.getTime() ?? null,
          contractYearsLeft: years,
          isHomegrown: row.nationality === country,
          isOnLoan: row.loanFromTeamId !== null,
          renewalWageCents: wageDemandCents({
            valueCents: row.valueCents,
            currentWageCents: row.wageCents
          }),
          releaseCostCents: releaseCostCents(row.wageCents, years),
          isYouth: row.isYouth
        };
      })
      .sort((a, b) => a.contractYearsLeft - b.contractYearsLeft || b.overall - a.overall);
  }

  renew(request: RenewRequest): ContractEntry[] {
    const validated = renewRequestSchema.parse(request);
    const repository = new MarketRepository(this.resolveDb());
    const teamId = this.requireManagedTeam(repository);
    const row = repository.findPlayer(validated.playerId);
    if (!row || row.teamId !== teamId) {
      throw new NotYourPlayerError();
    }

    const today = repository.currentDate();
    const summary = toPlayerSummary(row, today);
    const demand = wageDemandCents({
      valueCents: row.valueCents,
      currentWageCents: row.wageCents
    });
    if (validated.wageCents < demand) {
      // Renovar no es negociar: o se paga lo que pide o sigue como está.
      return this.listContracts();
    }

    repository.renew(
      row.id,
      validated.wageCents,
      contractEnd(today, validated.years),
      marketValueCents({
        overall: summary.overall,
        potential: row.potential,
        age: summary.age
      })
    );

    return this.listContracts();
  }

  /** Rescindir: cuesta la mitad de lo que quedaba por pagarle. */
  release(request: { playerId: string }): ContractEntry[] {
    const validated = playerIdRequestSchema.parse(request);
    const repository = new MarketRepository(this.resolveDb());
    const teamId = this.requireManagedTeam(repository);
    const row = repository.findPlayer(validated.playerId);
    if (!row || row.teamId !== teamId) {
      throw new NotYourPlayerError();
    }
    if (row.loanFromTeamId) {
      throw new NotYourPlayerError();
    }

    const rules = canLeave({
      homegrownInSquad: this.homegrownCount(repository, teamId),
      leavingIsHomegrown: row.nationality === repository.findTeam(teamId)?.country,
      squadSize: repository.countRoster(teamId),
      minSquadSize: MIN_ROSTER
    });
    if (!rules.ok) {
      throw new SquadTooSmallError(rules.reason);
    }

    const today = repository.currentDate();
    const cost = releaseCostCents(row.wageCents, contractYearsLeft(row.contractUntil, today));

    repository.release(row.id);
    new ClubService(this.resolveDb).recordEntry({
      teamId,
      seasonId: null,
      happenedOn: today,
      type: 'wages',
      description: `Rescisión de ${row.firstName} ${row.lastName}`,
      amountCents: -cost
    });

    return this.listContracts();
  }

  /** Cesiones vivas del club, de ida y de vuelta. */
  listLoans(): LoanEntry[] {
    const repository = new MarketRepository(this.resolveDb());
    const teamId = this.requireManagedTeam(repository);
    const today = repository.currentDate();
    const names = repository.teamNames();

    return repository.listLoans(teamId).map((row) => {
      const summary = toPlayerSummary(row, today);
      const out = row.loanFromTeamId === teamId;
      const otherId = out ? row.teamId : row.loanFromTeamId;

      return {
        playerId: row.id,
        playerName: `${summary.firstName} ${summary.lastName}`,
        position: summary.position,
        overall: summary.overall,
        direction: out ? ('out' as const) : ('in' as const),
        otherTeamName: otherId ? (names.get(otherId) ?? otherId) : 'Sin club',
        until: row.loanUntil?.getTime() ?? null
      };
    });
  }

  /**
   * Cede a uno de los tuyos.
   *
   * El club que se lo lleva lo busca el juego: se lo ofrece a quien tenga sitio
   * y a quien de verdad le sirva, empezando por el que peor anda de plantilla.
   * Pedirle al usuario que elija entre diecisiete clubes sería una pantalla más
   * para una decisión que no es suya.
   */
  loanOut(request: LoanRequest): MarketOfferResult {
    const validated = loanOutRequestSchema.parse(request);
    const repository = new MarketRepository(this.resolveDb());
    const teamId = this.requireManagedTeam(repository);
    const today = repository.currentDate();

    if (!isWindowOpen(today)) {
      throw new WindowClosedError();
    }

    const row = repository.findPlayer(validated.playerId);
    if (!row || row.teamId !== teamId || row.isYouth || row.loanFromTeamId) {
      throw new NotYourPlayerError();
    }

    const rules = canLeave({
      homegrownInSquad: this.homegrownCount(repository, teamId),
      leavingIsHomegrown: row.nationality === repository.findTeam(teamId)?.country,
      squadSize: repository.countRoster(teamId),
      minSquadSize: MIN_ROSTER
    });
    if (!rules.ok) {
      return { accepted: false, reason: rules.reason, status: this.getStatus() };
    }

    const overall = toPlayerSummary(row, today).overall;
    const candidates = repository
      .listTeams()
      .filter((team) => team.id !== teamId)
      .map((team) => ({ team, roster: repository.listRoster(team.id) }))
      .sort((a, b) => a.roster.length - b.roster.length);

    for (const candidate of candidates) {
      const worst = candidate.roster.reduce(
        (min, other) => Math.min(min, toPlayerSummary(other, today).overall),
        99
      );
      const decision = acceptsLoan({
        borrowerRosterSize: candidate.roster.length,
        borrowerMaxRoster: MAX_ROSTER,
        playerOverall: overall,
        borrowerWorstOverall: worst
      });

      if (decision.accepted) {
        repository.loan({
          playerId: row.id,
          ownerTeamId: teamId,
          borrowerTeamId: candidate.team.id,
          until: loanEndDate(today)
        });

        return {
          accepted: true,
          reason: `${row.firstName} ${row.lastName} se va cedido a ${candidate.team.name}`,
          status: this.getStatus()
        };
      }
    }

    return {
      accepted: false,
      reason: 'Nadie lo quiere cedido ahora mismo',
      status: this.getStatus()
    };
  }

  /**
   * Pide cedido a uno de otro club.
   *
   * Te lo prestan si no es de los suyos de verdad —nadie cede a un titular— y
   * si no se quedan cortos de plantilla.
   */
  loanIn(request: LoanRequest): MarketOfferResult {
    const validated = loanInRequestSchema.parse(request);
    const repository = new MarketRepository(this.resolveDb());
    const teamId = this.requireManagedTeam(repository);
    const today = repository.currentDate();

    if (!isWindowOpen(today)) {
      throw new WindowClosedError();
    }

    const row = repository.findPlayer(validated.playerId);
    if (!row || !row.teamId || row.teamId === teamId || row.isYouth || row.loanFromTeamId) {
      throw new PlayerNotAvailableError();
    }

    const rules = canSign({
      homegrownInSquad: this.homegrownCount(repository, teamId),
      squadSize: repository.countRoster(teamId),
      maxSquadSize: MAX_ROSTER,
      signingIsHomegrown: row.nationality === repository.findTeam(teamId)?.country,
      wageBillCents: repository.seasonWagesCents(teamId),
      wageOfferedCents: row.wageCents,
      wageCeilingCents: this.wageCeiling(repository, teamId)
    });
    if (!rules.ok) {
      return { accepted: false, reason: rules.reason, status: this.getStatus() };
    }

    const owner = repository.listRoster(row.teamId);
    if (owner.length <= MIN_ROSTER) {
      return {
        accepted: false,
        reason: 'Su club no puede quedarse con menos plantilla',
        status: this.getStatus()
      };
    }

    // Nadie cede a uno de sus seis mejores.
    const ranking = owner
      .map((other) => ({ id: other.id, overall: toPlayerSummary(other, today).overall }))
      .sort((a, b) => b.overall - a.overall);
    if (ranking.findIndex((entry) => entry.id === row.id) < 6) {
      return {
        accepted: false,
        reason: 'Su club no cede a uno de sus mejores',
        status: this.getStatus()
      };
    }

    repository.loan({
      playerId: row.id,
      ownerTeamId: row.teamId,
      borrowerTeamId: teamId,
      until: loanEndDate(today)
    });

    return {
      accepted: true,
      reason: `${row.firstName} ${row.lastName} llega cedido hasta final de temporada`,
      status: this.getStatus()
    };
  }

  // --- Ganchos del reloj ---------------------------------------------------

  /**
   * Lo que pasa en el mercado entre temporadas, sin que el usuario haga nada.
   *
   * Primero vencen los contratos —la IA renueva a casi todos, y a quien no, se
   * queda libre— y después los clubes cortos de plantilla salen a buscar entre
   * los libres. Sin esto, el mundo se quedaría congelado mientras el usuario es
   * el único que ficha.
   */
  processOffseason(date: Date): void {
    const repository = new MarketRepository(this.resolveDb());
    const managedTeamId = repository.managedTeamId();

    // Lo primero, los cedidos a casa: cuentan como plantilla para todo lo demás.
    for (const row of repository.listExpiredLoans(date)) {
      repository.endLoan(row.id, row.loanFromTeamId as string);
    }

    for (const row of repository.listExpiring(date)) {
      if (row.teamId === managedTeamId) {
        // Al usuario no se le renueva solo: si no lo ha hecho él, se va.
        repository.release(row.id);
        continue;
      }

      const rng = createRng(seedFromString(`${row.id}-renovacion-${date.getUTCFullYear()}`));
      if (rng.chance(0.75)) {
        repository.renew(row.id, row.wageCents, contractEnd(date, rng.int(1, 3)), row.valueCents);
      } else {
        repository.release(row.id);
      }
    }

    this.runAiMarket(date);
  }

  /** Los clubes de la IA cubren huecos con agentes libres. */
  runAiMarket(date: Date): void {
    const repository = new MarketRepository(this.resolveDb());
    const managedTeamId = repository.managedTeamId();
    const free = [...repository.listFreeAgents()].sort((a, b) => b.valueCents - a.valueCents);

    for (const team of repository.listTeams()) {
      if (team.id === managedTeamId) {
        continue;
      }

      let size = repository.countRoster(team.id);
      while (size < AI_TARGET_ROSTER && free.length > 0) {
        const row = free.shift() as PlayerRow;
        const summary = toPlayerSummary(row, date);
        const rng = createRng(seedFromString(`${team.id}-${row.id}-ficha`));

        repository.transfer({
          playerId: row.id,
          fromTeamId: null,
          toTeamId: team.id,
          feeCents: 0,
          wageCents: wageDemandCents({
            valueCents: row.valueCents,
            currentWageCents: row.wageCents
          }),
          contractUntil: contractEnd(date, rng.int(1, 3)),
          valueCents: marketValueCents({
            overall: summary.overall,
            potential: row.potential,
            age: summary.age
          })
        });
        size += 1;
      }
    }
  }

  // ------------------------------------------------------------------------

  private sign(input: {
    repository: MarketRepository;
    row: PlayerRow;
    toTeamId: string;
    feeCents: number;
    wageCents: number;
    years: number;
    today: Date;
    summary: PlayerSummary;
  }): void {
    input.repository.transfer({
      playerId: input.row.id,
      fromTeamId: input.row.teamId,
      toTeamId: input.toTeamId,
      feeCents: input.feeCents,
      wageCents: input.wageCents,
      contractUntil: contractEnd(input.today, input.years),
      valueCents: marketValueCents({
        overall: input.summary.overall,
        potential: input.row.potential,
        age: input.summary.age
      })
    });

    if (input.feeCents > 0) {
      new ClubService(this.resolveDb).recordEntry({
        teamId: input.toTeamId,
        seasonId: null,
        happenedOn: input.today,
        type: 'transfer',
        description: `Traspaso de ${input.row.firstName} ${input.row.lastName}`,
        amountCents: -input.feeCents
      });
    }
  }

  private toMarketPlayer(
    row: PlayerRow,
    today: Date,
    names: ReadonlyMap<string, string>,
    error: number,
    country: string | undefined
  ): MarketPlayer {
    const summary = scoutPlayer(toPlayerSummary(row, today), error);
    const years = contractYearsLeft(row.contractUntil, today);

    return {
      playerId: row.id,
      playerName: `${summary.firstName} ${summary.lastName}`,
      teamId: row.teamId,
      teamName: row.teamId ? (names.get(row.teamId) ?? null) : null,
      position: summary.position,
      age: summary.age,
      overall: summary.overall,
      potential: summary.potential,
      uncertainty: summary.uncertainty,
      askingPriceCents: row.teamId
        ? askingPriceCents({
            valueCents: row.valueCents,
            contractYearsLeft: years,
            age: summary.age
          })
        : 0,
      wageDemandCents: wageDemandCents({
        valueCents: row.valueCents,
        currentWageCents: row.wageCents
      }),
      currentWageCents: row.wageCents,
      contractYearsLeft: years,
      valueCents: row.valueCents,
      isFreeAgent: row.teamId === null,
      isHomegrown: row.nationality === country,
      isOnLoan: row.loanFromTeamId !== null
    };
  }

  private requireManagedTeam(repository: MarketRepository): string {
    const teamId = repository.managedTeamId();
    if (!teamId) {
      throw new NoManagedTeamError();
    }
    return teamId;
  }
}

/** Los contratos acaban el 30 de junio, como en cualquier liga. */
function contractEnd(today: Date, years: number): Date {
  const year =
    today.getUTCMonth() >= 6 ? today.getUTCFullYear() + years : today.getUTCFullYear() + years - 1;
  return new Date(Date.UTC(year, 5, 30));
}
