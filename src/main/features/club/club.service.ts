import {
  expandArenaRequestSchema,
  setTicketPriceRequestSchema,
  type ClubFinances,
  type ExpandArenaRequest,
  type FinanceEntryView,
  type SetTicketPriceRequest
} from '@shared/contracts/club.contract';
import { teamIdRequestSchema } from '@shared/contracts/rotation.contract';
import {
  DEFAULT_SUPPORT,
  expectedAttendance,
  gateRevenueCents,
  renewSeasonTickets,
  seasonTicketPriceCents,
  supportAfterGame,
  supportLabel
} from '@shared/domain/attendance';
import {
  EXPANSION_COST_PER_SEAT_CENTS,
  FINANCE_ENTRY_LABELS,
  MAX_CAPACITY,
  MAX_EXPANSION_SEATS,
  MIN_EXPANSION_SEATS,
  expansionCostCents,
  monthlyMaintenanceCents,
  monthlyWagesCents,
  PROMOTION_PRIZE_CENTS,
  seasonPrizeCents,
  seasonSponsorshipCents,
  seasonTvRightsCents,
  type FinanceEntryType
} from '@shared/domain/finance';
import { youthUpkeepCents } from '@shared/domain/youth';
import type { SaveDatabase } from '../../database/save-database';
import type { FinanceEntryRow, TeamRow } from '../../database/schema/save';
import { StaffService } from '../staff/staff.service';
import { ClubRepository, type NewEntry } from './club.repository';

/** Cuántos movimientos se enseñan en el libro; el resto queda guardado. */
const LEDGER_PAGE = 60;

export class TeamNotFoundError extends Error {
  constructor(teamId: string) {
    super(`No existe el equipo ${teamId}`);
    this.name = 'TeamNotFoundError';
  }
}

export class NotManagedTeamError extends Error {
  constructor(teamId: string) {
    super(`El equipo ${teamId} no lo dirige el usuario`);
    this.name = 'NotManagedTeamError';
  }
}

export class NotEnoughMoneyError extends Error {
  constructor() {
    super('No hay dinero en caja para esa obra');
    this.name = 'NotEnoughMoneyError';
  }
}

export class ArenaTooBigError extends Error {
  constructor() {
    super(`El pabellón no puede pasar de ${MAX_CAPACITY} espectadores`);
    this.name = 'ArenaTooBigError';
  }
}

/**
 * Las cuentas del club y el pabellón.
 *
 * Sólo lleva libros el equipo del usuario: mientras no haya mercado, la
 * contabilidad de los rivales no decide nada y llevarla sería gastar escrituras
 * en números que nadie mira. Los ingresos y los gastos los dispara el reloj de
 * la temporada —pretemporada, cada partido en casa, primero de mes y final de
 * curso—, que es el único sitio donde el tiempo avanza.
 */
export class ClubService {
  /** Ver el porqué del resolutor en {@link SeasonService}. */
  constructor(private readonly resolveDb: () => SaveDatabase) {}

  getFinances(teamId: string, opponentTeamId?: string | null): ClubFinances {
    const validated = teamIdRequestSchema.parse({ teamId });
    const repository = new ClubRepository(this.resolveDb());
    const team = this.requireTeam(repository, validated.teamId);

    const seasonWages = repository.seasonWagesCents(team.id);
    const opponent = opponentTeamId ? repository.findTeam(opponentTeamId) : null;
    const attendance = expectedAttendance({
      capacity: team.pavilionCapacity,
      seasonTicketHolders: team.seasonTicketHolders,
      fanSupport: team.fanSupport,
      ticketPriceCents: team.ticketPriceCents,
      // Sin rival concreto se calcula contra uno medio: es una previsión, no
      // una promesa, y así la pantalla no se queda vacía en pretemporada.
      opponentReputation: opponent?.reputation ?? 50
    });

    const entries = repository.listEntries(team.id, LEDGER_PAGE);
    const season = summarize(entries);

    return {
      teamId: team.id,
      teamName: team.name,
      balanceCents: team.budgetCents,
      seasonWagesCents: seasonWages,
      monthlyWagesCents: monthlyWagesCents(seasonWages),
      monthlyMaintenanceCents: monthlyMaintenanceCents(team.pavilionCapacity),

      pavilionName: team.pavilionName,
      capacity: team.pavilionCapacity,
      ticketPriceCents: team.ticketPriceCents,
      seasonTicketPriceCents: seasonTicketPriceCents(team.ticketPriceCents),
      seasonTicketHolders: team.seasonTicketHolders,
      fanSupport: team.fanSupport,
      fanSupportLabel: supportLabel(team.fanSupport),
      expectedAttendance: attendance,
      expectedGateCents: gateRevenueCents(
        attendance,
        team.seasonTicketHolders,
        team.ticketPriceCents
      ),

      seasonIncomeCents: season.income,
      seasonExpenseCents: season.expense,
      totals: season.totals,
      entries: entries.map(toEntryView),

      expansionCostPerSeatCents: EXPANSION_COST_PER_SEAT_CENTS,
      minExpansionSeats: MIN_EXPANSION_SEATS,
      maxExpansionSeats: MAX_EXPANSION_SEATS,
      maxCapacity: MAX_CAPACITY,

      isManaged: repository.managedTeamId() === team.id
    };
  }

  setTicketPrice(request: SetTicketPriceRequest): ClubFinances {
    const validated = setTicketPriceRequestSchema.parse(request);
    const repository = new ClubRepository(this.resolveDb());
    this.requireManagedTeam(repository, validated.teamId);

    repository.setTicketPrice(validated.teamId, validated.priceCents);
    return this.getFinances(validated.teamId);
  }

  /**
   * Amplía el pabellón. Se paga al momento y los asientos están para el
   * siguiente partido: no hay obras a medias, que serían un estado más que
   * mantener a cambio de muy poco juego.
   */
  expandArena(request: ExpandArenaRequest): ClubFinances {
    const validated = expandArenaRequestSchema.parse(request);
    const repository = new ClubRepository(this.resolveDb());
    const team = this.requireManagedTeam(repository, validated.teamId);

    const capacity = team.pavilionCapacity + validated.seats;
    if (capacity > MAX_CAPACITY) {
      throw new ArenaTooBigError();
    }

    const cost = expansionCostCents(validated.seats);
    if (cost > team.budgetCents) {
      throw new NotEnoughMoneyError();
    }

    repository.setCapacity(team.id, capacity);
    repository.record({
      teamId: team.id,
      seasonId: null,
      happenedOn: repository.currentDate(),
      type: 'facilities',
      description: `Ampliación del pabellón: ${validated.seats} asientos`,
      amountCents: -cost
    });

    return this.getFinances(team.id);
  }

  // --- Ganchos del reloj de la temporada ----------------------------------

  /**
   * Pretemporada: se renuevan los abonos y entran los ingresos fijos del curso.
   *
   * Idempotente por temporada: si ya se cobró, no se vuelve a cobrar aunque
   * alguien pregunte dos veces por la temporada en curso.
   */
  collectPreseason(seasonId: string, date: Date): void {
    const repository = new ClubRepository(this.resolveDb());
    const teamId = repository.managedTeamId();
    if (!teamId || repository.hasEntry(teamId, seasonId, 'tv')) {
      return;
    }

    const team = repository.findTeam(teamId);
    if (!team) {
      return;
    }

    const holders = renewSeasonTickets({
      capacity: team.pavilionCapacity,
      fanSupport: team.fanSupport,
      ticketPriceCents: team.ticketPriceCents
    });
    repository.setSeasonTicketHolders(team.id, holders);

    repository.record({
      teamId: team.id,
      seasonId,
      happenedOn: date,
      type: 'membership',
      description: `${holders} abonados`,
      amountCents: holders * seasonTicketPriceCents(team.ticketPriceCents)
    });
    repository.record({
      teamId: team.id,
      seasonId,
      happenedOn: date,
      type: 'tv',
      description: 'Derechos de televisión',
      amountCents: seasonTvRightsCents(team.reputation)
    });
    repository.record({
      teamId: team.id,
      seasonId,
      happenedOn: date,
      type: 'sponsorship',
      description: 'Patrocinio principal',
      amountCents: seasonSponsorshipCents(team.reputation, team.pavilionCapacity)
    });
  }

  /** Un partido en casa del equipo del usuario: taquilla y ambiente. */
  collectHomeGame(input: {
    seasonId: string;
    date: Date;
    homeTeamId: string;
    awayTeamId: string;
    homeScore: number;
    awayScore: number;
    label: string;
  }): void {
    const repository = new ClubRepository(this.resolveDb());
    if (repository.managedTeamId() !== input.homeTeamId) {
      return;
    }

    const team = repository.findTeam(input.homeTeamId);
    const opponent = repository.findTeam(input.awayTeamId);
    if (!team) {
      return;
    }

    const attendance = expectedAttendance({
      capacity: team.pavilionCapacity,
      seasonTicketHolders: team.seasonTicketHolders,
      fanSupport: team.fanSupport,
      ticketPriceCents: team.ticketPriceCents,
      opponentReputation: opponent?.reputation ?? 50
    });

    repository.record({
      teamId: team.id,
      seasonId: input.seasonId,
      happenedOn: input.date,
      type: 'ticketing',
      description: `${input.label} · ${attendance} espectadores`,
      amountCents: gateRevenueCents(attendance, team.seasonTicketHolders, team.ticketPriceCents)
    });

    repository.setFanSupport(
      team.id,
      supportAfterGame(team.fanSupport, {
        won: input.homeScore > input.awayScore,
        ticketPriceCents: team.ticketPriceCents
      })
    );
  }

  /**
   * Primero de mes: nóminas —plantilla y cuerpo técnico— y mantenimiento del
   * pabellón y de la cantera. Es el gasto que no se ve venir y el que hunde a
   * quien ha fichado por encima de sus posibilidades.
   */
  payMonthly(seasonId: string | null, date: Date): void {
    const repository = new ClubRepository(this.resolveDb());
    const teamId = repository.managedTeamId();
    if (!teamId) {
      return;
    }

    const team = repository.findTeam(teamId);
    if (!team) {
      return;
    }

    const month = date.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
    repository.record({
      teamId: team.id,
      seasonId,
      happenedOn: date,
      type: 'wages',
      description: `Nóminas de ${month}`,
      amountCents: -monthlyWagesCents(
        repository.seasonWagesCents(team.id) +
          new StaffService(this.resolveDb).seasonWagesCents(team.id)
      )
    });
    repository.record({
      teamId: team.id,
      seasonId,
      happenedOn: date,
      type: 'maintenance',
      description: `Mantenimiento de ${team.pavilionName} y de la cantera`,
      amountCents: -(
        monthlyMaintenanceCents(team.pavilionCapacity) +
        monthlyWagesCents(youthUpkeepCents(team.youthLevel))
      )
    });
  }

  /** Fin de curso: premio por la clasificación y, si toca, por el título. */
  payPrizes(
    seasonId: string,
    date: Date,
    result: { position: number; teams: number; champion: boolean; tier?: number }
  ): void {
    const repository = new ClubRepository(this.resolveDb());
    const teamId = repository.managedTeamId();
    if (!teamId || repository.hasEntry(teamId, seasonId, 'prize')) {
      return;
    }

    repository.record({
      teamId,
      seasonId,
      happenedOn: date,
      type: 'prize',
      description: result.champion
        ? `Campeón de liga · ${result.position}º de la fase regular`
        : `${result.position}º de la fase regular`,
      amountCents: seasonPrizeCents(
        result.position,
        result.teams,
        result.champion,
        result.tier ?? 1
      )
    });
  }

  /** El premio por subir de categoría, que se cobra aparte del de la liga. */
  payPromotion(seasonId: string, date: Date): void {
    const repository = new ClubRepository(this.resolveDb());
    const teamId = repository.managedTeamId();
    if (!teamId) {
      return;
    }

    repository.record({
      teamId,
      seasonId,
      happenedOn: date,
      type: 'prize',
      description: 'Ascenso de categoría',
      amountCents: PROMOTION_PRIZE_CENTS
    });
  }

  /**
   * Apunte suelto en el libro del club.
   *
   * Lo usan las obras que no son del pabellón —la cantera, por ejemplo— para
   * que todo el dinero siga saliendo y entrando por el mismo sitio.
   */
  recordEntry(entry: NewEntry): void {
    new ClubRepository(this.resolveDb()).record(entry);
  }

  /** Arranque de una partida: el pabellón empieza con abonados y ambiente normal. */
  initialise(teamId: string): void {
    const repository = new ClubRepository(this.resolveDb());
    const team = repository.findTeam(teamId);
    if (!team) {
      return;
    }

    repository.setFanSupport(team.id, DEFAULT_SUPPORT);
    repository.setSeasonTicketHolders(
      team.id,
      renewSeasonTickets({
        capacity: team.pavilionCapacity,
        fanSupport: DEFAULT_SUPPORT,
        ticketPriceCents: team.ticketPriceCents
      })
    );
  }

  // ------------------------------------------------------------------------

  private requireTeam(repository: ClubRepository, teamId: string): TeamRow {
    const team = repository.findTeam(teamId);
    if (!team) {
      throw new TeamNotFoundError(teamId);
    }
    return team;
  }

  private requireManagedTeam(repository: ClubRepository, teamId: string): TeamRow {
    const team = this.requireTeam(repository, teamId);
    if (repository.managedTeamId() !== team.id) {
      throw new NotManagedTeamError(teamId);
    }
    return team;
  }
}

function toEntryView(row: FinanceEntryRow): FinanceEntryView {
  const type = row.type as FinanceEntryType;

  return {
    id: row.id,
    happenedOn: row.happenedOn.getTime(),
    type,
    typeLabel: FINANCE_ENTRY_LABELS[type] ?? row.type,
    description: row.description,
    amountCents: row.amountCents
  };
}

/** Ingresos, gastos y desglose por concepto de lo que hay en el libro. */
function summarize(entries: readonly FinanceEntryRow[]): {
  income: number;
  expense: number;
  totals: ClubFinances['totals'];
} {
  const byType = new Map<FinanceEntryType, number>();
  let income = 0;
  let expense = 0;

  for (const entry of entries) {
    const type = entry.type as FinanceEntryType;
    byType.set(type, (byType.get(type) ?? 0) + entry.amountCents);
    if (entry.amountCents >= 0) {
      income += entry.amountCents;
    } else {
      expense += entry.amountCents;
    }
  }

  return {
    income,
    expense,
    totals: [...byType.entries()]
      .map(([type, amountCents]) => ({
        type,
        label: FINANCE_ENTRY_LABELS[type] ?? type,
        amountCents
      }))
      .sort((a, b) => b.amountCents - a.amountCents)
  };
}
