import {
  calendarMonthRequestSchema,
  type CalendarGame,
  type CalendarMonth,
  type CalendarMonthRequest,
  type CalendarScope,
  type CalendarTeam
} from '@shared/contracts/calendar.contract';
import { calendarEvents } from '@shared/domain/calendar-events';
import { clampMonth, monthRange, seasonMonths } from '@shared/domain/calendar-month';
import { competitionKind } from '@shared/domain/competition-kind';
import type { SaveDatabase } from '../../database/save-database';
import type { CompetitionRow } from '../../database/schema/save';
import type { MatchRepository } from '../match/match.repository';
import { roundLabel } from '../match/match.service';
import { SeasonService, type UserGame } from '../season/season.service';
import { CalendarRepository, type CalendarTeamRow } from './calendar.repository';

/** Los dos banquillos, en el orden del interruptor «Club / Selección». */
const SCOPE_ORDER: readonly CalendarScope[] = ['club', 'national'];

/**
 * El calendario mensual: los partidos del usuario de un mes y lo que pasa en el
 * club cada día (nóminas, mercado, selecciones).
 *
 * Sólo la temporada en curso: un mes de antes o de después se lleva al más
 * cercano que sí lo es. Los partidos salen de `SeasonService`, que es quien sabe
 * qué competiciones se juegan este curso; los días sin partido, de las reglas
 * de fecha del dominio (`calendarEvents`).
 */
export class CalendarService {
  /** Ver el porqué del resolutor en `SeasonService`. */
  constructor(private readonly resolveDb: () => SaveDatabase) {}

  getMonth(request: CalendarMonthRequest): CalendarMonth {
    const validated = calendarMonthRequestSchema.parse(request);
    const seasonService = new SeasonService(this.resolveDb);
    const current = seasonService.getCurrent();
    const repository = new CalendarRepository(this.resolveDb());
    const today = repository.currentDate();

    const bounds = seasonMonths(current.startYear, today);
    const target = clampMonth(validated, bounds);
    const { from, to } = monthRange(target);

    // La temporada entera, y no sólo el mes: los banquillos que tiene el
    // usuario no dependen de si ese mes juega.
    const seasonGames = seasonService.listUserGamesBetween(
      monthRange(bounds.first).from,
      monthRange(bounds.last).to
    );
    const scopes = SCOPE_ORDER.filter((scope) =>
      seasonGames.some((entry) => entry.scope === scope)
    );
    const monthGames = seasonGames.filter(
      (entry) =>
        entry.game.scheduledOn.getTime() >= from.getTime() &&
        entry.game.scheduledOn.getTime() <= to.getTime()
    );

    // Las nóminas dejan de correr al acabar la liga del club. Se sabe cuándo si
    // ya ha acabado o si no tiene playoffs; con cuadro por sortear, no.
    const leagueEndsOn =
      current.stage === 'finished' || current.playoffTeams < 2
        ? repository.lastGameDate(current.id)
        : null;

    const teams = repository.teams(
      monthGames.flatMap((entry) => [entry.game.homeTeamId, entry.game.awayTeamId])
    );

    return {
      ...target,
      today: today.getTime(),
      first: bounds.first,
      last: bounds.last,
      scopes,
      games: monthGames.map((entry) => toCalendarGame(entry, teams)),
      events: calendarEvents({
        from,
        to,
        seasonStartYear: current.startYear,
        hasClub: scopes.includes('club'),
        leagueEndsOn,
        nationalWindows: repository.hasNationalGames(current.seasonNumber)
      }).map((event) => ({
        on: event.on.getTime(),
        kind: event.kind,
        label: event.label,
        short: event.short,
        scope: event.scope
      }))
    };
  }
}

function toCalendarGame(
  entry: UserGame,
  teams: ReadonlyMap<string, CalendarTeamRow>
): CalendarGame {
  const { game, competition } = entry;
  const side = game.homeTeamId === entry.userTeamId ? 'home' : 'away';
  const rivalId = side === 'home' ? game.awayTeamId : game.homeTeamId;
  const played = game.homeScore !== null && game.awayScore !== null;
  const own = side === 'home' ? game.homeScore : game.awayScore;
  const other = side === 'home' ? game.awayScore : game.homeScore;
  const rival = teams.get(rivalId);

  return {
    gameId: game.id,
    scope: entry.scope,
    scheduledOn: game.scheduledOn.getTime(),
    competitionId: competition?.id ?? '',
    competitionName: competition?.name ?? '',
    kind: competitionKind({
      format: competition?.format,
      seriesId: game.seriesId,
      nationOf: rival?.nationalOf ?? null,
      teamId: entry.userTeamId
    }),
    roundLabel: shortRoundLabel(competition, game),
    side,
    neutralVenue: game.neutralVenue,
    venue: teams.get(game.homeTeamId)?.pavilionName ?? '',
    team: toTeam(entry.userTeamId, teams),
    rival: toTeam(rivalId, teams),
    homeScore: game.homeScore,
    awayScore: game.awayScore,
    overtimes: game.overtimes,
    played,
    won: played && own !== null && other !== null ? own > other : null
  };
}

function toTeam(teamId: string, teams: ReadonlyMap<string, CalendarTeamRow>): CalendarTeam {
  const row = teams.get(teamId);
  return { teamId, name: row?.name ?? teamId, nationOf: row?.nationalOf ?? null };
}

/**
 * La ronda con el mismo texto que la previa y el acta (`roundLabel`), pero sin
 * el nombre de la competición delante: el calendario ya lo pone en su franja.
 *
 * `roundLabel` le pregunta la competición al repositorio del partido, que la lee
 * de la base una vez por partido. Aquí ya está leída para todo el mes, así que
 * se le da un repositorio que sólo sabe contestar eso, sin consultas.
 */
function shortRoundLabel(competition: CompetitionRow | null, game: UserGame['game']): string {
  const known = {
    competitionForGame: () => competition
  } satisfies Pick<MatchRepository, 'competitionForGame'>;
  const label = roundLabel(known as unknown as MatchRepository, game);
  const prefix = competition ? `${competition.name} · ` : '';
  return prefix && label.startsWith(prefix) ? label.slice(prefix.length) : label;
}
