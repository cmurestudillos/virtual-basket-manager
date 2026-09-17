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
import { homeGamesPerSeason } from '@shared/domain/schedule';
import { MAX_ROSTER } from '@shared/domain/youth';
import { UNHAPPY_MORALE, refusesToRenew, renewalWageFactor } from '@shared/domain/morale';
import {
  canSignUnderCap,
  luxuryTaxCents,
  luxuryTaxLineCents,
  minimumSalaryCents,
  salaryCapCents
} from '@shared/domain/nba';
import { createRng, seedFromString } from '@shared/engine/basketball/rng';
import type { SaveDatabase } from '../../database/save-database';
import type { PlayerRow } from '../../database/schema/save';
import { ClubService } from '../club/club.service';
import { toPlayerSummary } from '../players/players.mapper';
import { scoutPlayer, scoutingErrorFor } from '../players/scouting';
import { StaffService } from '../staff/staff.service';
import { SeasonRepository } from '../season/season.repository';
import { MarketRepository } from './market.repository';

/** Plantilla mínima de un club: por debajo, no se vende ni se rescinde. */
export const MIN_ROSTER = 10;
/** Y la que la IA considera corta y sale a cubrir en el mercado. */
const AI_TARGET_ROSTER = 12;

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

export class RenewalRefusedError extends Error {
  constructor(playerName: string) {
    super(`${playerName} no quiere renovar: está enfadado con su situación en el club`);
    this.name = 'RenewalRefusedError';
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
      minHomegrown: MIN_HOMEGROWN,
      salaryCap: this.salaryCapStatus(repository, teamId)
    };
  }

  /** El tope salarial de la liga NBA, si el club juega en ella. */
  private salaryCapStatus(repository: MarketRepository, teamId: string): MarketStatus['salaryCap'] {
    const cap = this.nbaCap(teamId);
    if (cap === null) {
      return null;
    }
    const taxLine = luxuryTaxLineCents(cap);
    return {
      capCents: cap,
      taxLineCents: taxLine,
      minimumCents: minimumSalaryCents(cap),
      projectedTaxCents: luxuryTaxCents(repository.seasonWagesCents(teamId), taxLine)
    };
  }

  /**
   * El tope de la liga de formato NBA en la que juega el club: la nómina media
   * de sus equipos. `null` si el club juega cualquier otra liga.
   */
  private nbaCap(teamId: string): number | null {
    const db = this.resolveDb();
    const seasons = new SeasonRepository(db);
    const team = seasons.findTeam(teamId);
    const competition = team ? seasons.findCompetition(team.competitionId) : null;
    if (!competition?.nbaFormat) {
      return null;
    }
    const market = new MarketRepository(db);
    const teamIds = seasons.teamIdsInCompetition(competition.id);
    const total = teamIds.reduce((sum, id) => sum + market.seasonWagesCents(id), 0);
    return salaryCapCents(teamIds.length > 0 ? total / teamIds.length : 0);
  }

  /**
   * Las reglas de inscripción de un fichaje: en la liga NBA, el tope blando;
   * en las demás, el cupo de formación y el tope del consejo.
   */
  private signingRules(
    repository: MarketRepository,
    teamId: string,
    player: PlayerRow,
    wageOfferedCents: number
  ): { ok: boolean; reason: string } {
    const cap = this.nbaCap(teamId);
    if (cap !== null) {
      if (repository.countRoster(teamId) >= MAX_ROSTER) {
        return { ok: false, reason: `La plantilla ya tiene ${MAX_ROSTER} jugadores` };
      }
      return canSignUnderCap({
        payrollCents: repository.seasonWagesCents(teamId),
        wageOfferedCents,
        salaryCapCents: cap
      });
    }
    return canSign({
      homegrownInSquad: this.homegrownCount(repository, teamId),
      squadSize: repository.countRoster(teamId),
      maxSquadSize: MAX_ROSTER,
      signingIsHomegrown: player.nationality === repository.findTeam(teamId)?.country,
      wageBillCents: repository.seasonWagesCents(teamId),
      wageOfferedCents,
      wageCeilingCents: this.wageCeiling(repository, teamId)
    });
  }

  /**
   * El impuesto de lujo del club del usuario, al cerrar la temporada: uno y
   * medio por cada euro de nómina por encima del umbral.
   */
  chargeLuxuryTax(seasonId: string, date: Date): void {
    const repository = new MarketRepository(this.resolveDb());
    const teamId = repository.managedTeamId();
    if (!teamId) {
      return;
    }
    const cap = this.nbaCap(teamId);
    if (cap === null) {
      return;
    }
    const tax = luxuryTaxCents(repository.seasonWagesCents(teamId), luxuryTaxLineCents(cap));
    if (tax <= 0) {
      return;
    }
    new ClubService(this.resolveDb).recordEntry({
      teamId,
      seasonId,
      happenedOn: date,
      type: 'luxuryTax',
      description: 'Impuesto de lujo por pasar del umbral de nómina',
      amountCents: -tax
    });
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
    // Los partidos en casa dependen del tamaño de la liga: dieciocho equipos
    // juegan 17, y una de diecisiete, con sus dos descansos, 16.
    const gate =
      gateRevenueCents(attendance, team.seasonTicketHolders, team.ticketPriceCents) *
      homeGamesPerSeason(repository.countTeamsInCompetition(team.competitionId));

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
    const rules = this.signingRules(repository, teamId, row, validated.wageCents);
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
          nationality: row.nationality,
          position: row.position as Position,
          age: summary.age,
          overall: summary.overall,
          wageCents: row.wageCents,
          contractUntil: row.contractUntil?.getTime() ?? null,
          contractYearsLeft: years,
          isHomegrown: row.nationality === country,
          isOnLoan: row.loanFromTeamId !== null,
          renewalWageCents: renewalDemand(row),
          morale: row.morale,
          refusesRenewal: refusesToRenew(row.morale),
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
    if (refusesToRenew(row.morale)) {
      throw new RenewalRefusedError(`${row.firstName} ${row.lastName}`);
    }
    const demand = renewalDemand(row);
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
        nationality: row.nationality,
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

    const rules = this.signingRules(repository, teamId, row, row.wageCents);
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

    // El tope se calcula una vez por club: con cientos de contratos que vencen,
    // recalcular la nómina de toda la liga en cada uno sería lentísimo.
    const caps = new Map<string, number | null>();
    const capOf = (teamId: string): number | null => {
      if (!caps.has(teamId)) {
        caps.set(teamId, this.nbaCap(teamId));
      }
      return caps.get(teamId) ?? null;
    };

    for (const row of repository.listExpiring(date)) {
      if (row.teamId === managedTeamId) {
        // Al usuario no se le renueva solo: si no lo ha hecho él, se va.
        repository.release(row.id);
        continue;
      }

      const rng = createRng(seedFromString(`${row.id}-renovacion-${date.getUTCFullYear()}`));
      // En la IA también: al descontento cuesta retenerlo y el contento se queda.
      const stays = refusesToRenew(row.morale)
        ? 0
        : row.morale < UNHAPPY_MORALE
          ? 0.4
          : row.morale >= 85
            ? 0.9
            : 0.75;
      // Y en la liga NBA, un club por encima del umbral del impuesto no renueva
      // a quien cobra de más para lo que juega: es la primera forma de bajar.
      const cap = row.teamId ? capOf(row.teamId) : null;
      const taxedAndOverpaid =
        cap !== null &&
        repository.seasonWagesCents(row.teamId as string) > luxuryTaxLineCents(cap) &&
        row.wageCents > marketWage(row, date);
      if (!taxedAndOverpaid && rng.chance(stays)) {
        repository.renew(row.id, row.wageCents, contractEnd(date, rng.int(1, 3)), row.valueCents);
      } else {
        repository.release(row.id);
      }
    }

    this.shedLuxuryTax(date);
    this.runAiMarket(date);
  }

  /**
   * Los clubes de la IA de la liga NBA que siguen por encima del umbral del
   * impuesto se deshacen de los contratos peor pagados para lo que rinden, sin
   * bajar de la plantilla mínima. Es lo que hace cualquier gerente antes de
   * pagar uno y medio por cada euro de más.
   */
  private shedLuxuryTax(date: Date): void {
    const repository = new MarketRepository(this.resolveDb());
    const managedTeamId = repository.managedTeamId();

    for (const team of repository.listTeams()) {
      if (team.id === managedTeamId) {
        continue;
      }
      const cap = this.nbaCap(team.id);
      if (cap === null) {
        continue;
      }
      const line = luxuryTaxLineCents(cap);
      const byOverpay = repository
        .listRoster(team.id)
        .filter((row) => !row.loanFromTeamId)
        .map((row) => ({ row, overpay: row.wageCents - marketWage(row, date) }))
        .filter((entry) => entry.overpay > 0)
        .sort((a, b) => b.overpay - a.overpay);

      for (const { row } of byOverpay) {
        if (
          repository.seasonWagesCents(team.id) <= line ||
          repository.countRoster(team.id) <= MIN_ROSTER
        ) {
          break;
        }
        repository.release(row.id);
      }
    }
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

      // En la liga NBA la IA no se mete en impuesto de lujo por un agente libre:
      // por encima del umbral, sólo mínimos.
      const cap = this.nbaCap(team.id);
      const skipped: PlayerRow[] = [];
      let size = repository.countRoster(team.id);
      while (size < AI_TARGET_ROSTER && free.length > 0) {
        const row = free.shift() as PlayerRow;
        const summary = toPlayerSummary(row, date);
        const rng = createRng(seedFromString(`${team.id}-${row.id}-ficha`));
        if (cap !== null) {
          const wage = wageDemandCents({
            valueCents: row.valueCents,
            currentWageCents: row.wageCents
          });
          if (
            repository.seasonWagesCents(team.id) + wage > luxuryTaxLineCents(cap) &&
            wage > minimumSalaryCents(cap)
          ) {
            skipped.push(row);
            continue;
          }
        }

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
      // Los que este club no podía pagar siguen libres para los demás.
      free.unshift(...skipped);
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
      nationality: row.nationality,
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
/** Lo que vale en el mercado la ficha de un jugador hoy, sin contar su ánimo. */
function marketWage(row: PlayerRow, today: Date): number {
  const summary = toPlayerSummary(row, today);
  return wageDemandCents({
    valueCents: marketValueCents({
      overall: summary.overall,
      potential: row.potential,
      age: summary.age
    }),
    currentWageCents: 0
  });
}

/** Lo que pide un jugador para renovar, con su ánimo encima. */
function renewalDemand(row: PlayerRow): number {
  return Math.round(
    wageDemandCents({ valueCents: row.valueCents, currentWageCents: row.wageCents }) *
      renewalWageFactor(row.morale)
  );
}

function contractEnd(today: Date, years: number): Date {
  const year =
    today.getUTCMonth() >= 6 ? today.getUTCFullYear() + years : today.getUTCFullYear() + years - 1;
  return new Date(Date.UTC(year, 5, 30));
}
