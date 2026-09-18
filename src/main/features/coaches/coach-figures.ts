import {
  competitionStrength,
  stintPoints,
  type CoachGameKind,
  type CoachStintEvents
} from '@shared/domain/coach-ranking';
import { boardPlayoffRound } from '@shared/domain/nba';
import { computeStandings, type StandingRow } from '@shared/domain/standings';
import type { CompetitionRow, SeasonRow, TeamRow } from '../../database/schema/save';
import type { CoachGame } from './coaches.repository';

/** Lo que hizo un club con un entrenador entre dos fechas. */
export interface StintFigures {
  games: number;
  wins: number;
  points: number;
  titleNames: string[];
}

/** Un acontecimiento con su fecha, para repartirlo entre los tramos. */
interface DatedEvent {
  on: number;
  kind: CoachGameKind;
  tier: number;
  strength: number;
}

interface TeamLedger {
  games: { on: number; won: boolean; kind: CoachGameKind; tier: number; strength: number }[];
  rounds: DatedEvent[];
  titles: (DatedEvent & { name: string })[];
}

/**
 * Las cuentas de los entrenadores en un curso, sacadas de los partidos.
 *
 * Se monta una vez por lectura con todos los partidos jugados del curso y
 * reparte cada cosa por fecha: una victoria es del entrenador que estaba en el
 * banquillo el día del partido; una ronda superada, del que estaba el día que
 * se cerró; un título, del que estaba en el último partido del club en esa
 * competición. Así un despido en enero parte la temporada del club en dos sin
 * que nadie se quede con lo del otro.
 */
export class SeasonFigures {
  private readonly ledgers = new Map<string, TeamLedger>();
  private readonly seasonsById: Map<string, SeasonRow>;
  private readonly standingsCache = new Map<string, StandingRow[]>();
  private readonly gamesBySeason = new Map<string, CoachGame[]>();

  constructor(
    seasons: readonly SeasonRow[],
    private readonly competitions: Map<string, CompetitionRow>,
    games: readonly CoachGame[],
    teams: Map<string, TeamRow>
  ) {
    this.seasonsById = new Map(seasons.map((row) => [row.id, row]));

    for (const game of games) {
      const list = this.gamesBySeason.get(game.seasonId) ?? [];
      list.push(game);
      this.gamesBySeason.set(game.seasonId, list);
    }

    // La fuerza de cada competición: la reputación media de quien la juega.
    const strength = new Map<string, number>();
    for (const [seasonId, list] of this.gamesBySeason) {
      const ids = new Set(list.flatMap((game) => [game.homeTeamId, game.awayTeamId]));
      const reputations = [...ids].map((id) => teams.get(id)?.reputation ?? 50);
      const average = reputations.reduce((sum, value) => sum + value, 0) / reputations.length;
      strength.set(seasonId, competitionStrength(average));
    }

    for (const [seasonId, list] of this.gamesBySeason) {
      const season = this.seasonsById.get(seasonId);
      const competition = season ? competitions.get(season.competitionId) : undefined;
      if (!season || !competition) {
        continue;
      }
      const seasonStrength = strength.get(seasonId) ?? 1;
      // Rondas de eliminatoria que jugó cada club, con el día que se cerraron.
      const knockouts = new Map<string, Map<number, number>>();

      for (const game of list) {
        const kind = kindOf(competition, game);
        if (!kind) {
          continue;
        }
        const on = game.scheduledOn.getTime();
        for (const teamId of [game.homeTeamId, game.awayTeamId]) {
          const won =
            teamId === game.homeTeamId
              ? game.homeScore > game.awayScore
              : game.awayScore > game.homeScore;
          this.ledger(teamId).games.push({
            on,
            won,
            kind,
            tier: competition.tier,
            strength: seasonStrength
          });

          if (isKnockout(competition, game)) {
            const rounds = knockouts.get(teamId) ?? new Map<number, number>();
            rounds.set(game.round, Math.max(rounds.get(game.round) ?? 0, on));
            knockouts.set(teamId, rounds);
          }
        }
      }

      for (const [teamId, rounds] of knockouts) {
        const deepest = Math.max(...rounds.keys());
        const champion = season.championTeamId === teamId;
        for (const [round, closedOn] of rounds) {
          // Superada si jugó una ronda posterior o si acabó campeón.
          if (round < deepest || champion) {
            this.ledger(teamId).rounds.push({
              on: closedOn,
              kind: knockoutKind(competition),
              tier: competition.tier,
              strength: seasonStrength
            });
          }
        }
      }

      if (season.championTeamId && ['league', 'cup', 'continental'].includes(competition.format)) {
        const teamId = season.championTeamId;
        const lastGame = Math.max(
          ...list
            .filter((game) => game.homeTeamId === teamId || game.awayTeamId === teamId)
            .map((game) => game.scheduledOn.getTime())
        );
        if (Number.isFinite(lastGame)) {
          this.ledger(teamId).titles.push({
            on: lastGame,
            kind:
              competition.format === 'league' ? 'league' : (competition.format as CoachGameKind),
            tier: competition.tier,
            strength: seasonStrength,
            name: competition.name
          });
        }
      }
    }
  }

  /** Lo de un club entre dos fechas: desde `start` (incluida) hasta `end` (excluida). */
  stint(teamId: string, start: Date, end: Date | null): StintFigures {
    const ledger = this.ledgers.get(teamId);
    if (!ledger) {
      return { games: 0, wins: 0, points: 0, titleNames: [] };
    }
    const from = start.getTime();
    const to = end ? end.getTime() : Infinity;
    const inside = (on: number): boolean => on >= from && on < to;

    const games = ledger.games.filter((game) => inside(game.on));
    const titles = ledger.titles.filter((title) => inside(title.on));
    const events: CoachStintEvents = {
      wins: games.filter((game) => game.won),
      rounds: ledger.rounds.filter((round) => inside(round.on)),
      titles
    };

    return {
      games: games.length,
      wins: events.wins.length,
      points: stintPoints(events),
      titleNames: titles.map((title) => title.name)
    };
  }

  /** La temporada de liga de una competición en este curso. */
  leagueSeason(competitionId: string): SeasonRow | null {
    for (const season of this.seasonsById.values()) {
      if (season.competitionId === competitionId) {
        return season;
      }
    }
    return null;
  }

  /** La liga en la que jugó un club este curso, según sus partidos; `null` si no jugó. */
  leagueOf(teamId: string): string | null {
    for (const [seasonId, list] of this.gamesBySeason) {
      const season = this.seasonsById.get(seasonId);
      const competition = season ? this.competitions.get(season.competitionId) : undefined;
      if (
        competition?.format === 'league' &&
        list.some((game) => game.homeTeamId === teamId || game.awayTeamId === teamId)
      ) {
        return competition.id;
      }
    }
    return null;
  }

  /** La clasificación de la liga regular de una competición, con sus partidos jugados. */
  standings(competitionId: string, teamIds: readonly string[]): StandingRow[] {
    const cached = this.standingsCache.get(competitionId);
    if (cached) {
      return cached;
    }
    const season = this.leagueSeason(competitionId);
    const played = (season ? (this.gamesBySeason.get(season.id) ?? []) : []).filter(
      (game) => game.seriesId === null
    );
    const rows = computeStandings(teamIds, played);
    this.standingsCache.set(competitionId, rows);
    return rows;
  }

  /** El último partido de liga regular de un club en este curso, en milisegundos. */
  lastRegularGame(competitionId: string, teamId: string): number | null {
    const season = this.leagueSeason(competitionId);
    const games = (season ? (this.gamesBySeason.get(season.id) ?? []) : []).filter(
      (game) => game.seriesId === null && (game.homeTeamId === teamId || game.awayTeamId === teamId)
    );
    return games.length > 0 ? Math.max(...games.map((game) => game.scheduledOn.getTime())) : null;
  }

  /**
   * Hasta dónde llegó un club en los playoffs de su liga, con la escala del
   * consejo: 0 fuera, 1 cuartos, 2 semifinales, 3 final.
   */
  playoffRound(competitionId: string, teamId: string): number {
    const season = this.leagueSeason(competitionId);
    const competition = this.competitions.get(competitionId);
    if (!season || !competition || competition.playoffTeams < 2) {
      return 0;
    }
    const deepest = (this.gamesBySeason.get(season.id) ?? [])
      .filter(
        (game) =>
          game.seriesId !== null && (game.homeTeamId === teamId || game.awayTeamId === teamId)
      )
      .reduce((max, game) => Math.max(max, game.round), 0);
    return competition.nbaFormat ? boardPlayoffRound(deepest) : deepest;
  }

  private ledger(teamId: string): TeamLedger {
    let ledger = this.ledgers.get(teamId);
    if (!ledger) {
      ledger = { games: [], rounds: [], titles: [] };
      this.ledgers.set(teamId, ledger);
    }
    return ledger;
  }
}

/** A qué cuenta va un partido: liga, playoffs, copa o continental. */
function kindOf(competition: CompetitionRow, game: CoachGame): CoachGameKind | null {
  switch (competition.format) {
    case 'league':
      return game.seriesId ? 'playoffs' : 'league';
    case 'cup':
      return 'cup';
    case 'continental':
      return 'continental';
    default:
      // Las selecciones no suman para su club.
      return null;
  }
}

/** Si el partido es de una eliminatoria: la copa entera, y las series de las demás. */
function isKnockout(competition: CompetitionRow, game: CoachGame): boolean {
  if (competition.format === 'cup') {
    return true;
  }
  return (
    (competition.format === 'league' || competition.format === 'continental') &&
    game.seriesId !== null
  );
}

function knockoutKind(competition: CompetitionRow): CoachGameKind {
  if (competition.format === 'cup') return 'cup';
  if (competition.format === 'continental') return 'continental';
  return 'playoffs';
}
