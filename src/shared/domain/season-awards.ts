/**
 * Los premios de fin de temporada de una liga — la gala (2026-09-29).
 *
 * MVP, máximo anotador, reboteador, asistente, mejor defensor, mejor joven,
 * entrenador del año, quinteto ideal y MVP de la final. Todo sale de las actas
 * de la **fase regular**, por medias y con el mismo mínimo de partidos que la
 * tabla de líderes (`minimumGamesForLeaders`): el que juega tres partidos de
 * treinta puntos y se lesiona no es el anotador del año. La final es la
 * excepción, claro: su MVP sale de los partidos de la final.
 *
 * Se entregan en **todas** las ligas que se juegan, no sólo en la del usuario:
 * el máximo anotador de Grecia existe aunque nadie mire Grecia. La gala sólo
 * enseña la tuya.
 *
 * Módulo puro: recibe actas y devuelve ganadores. Quién las lee y dónde se
 * guardan es cosa de `features/trophies/` en el proceso principal.
 */

import { efficiencyRating, points, totalRebounds, type PlayerBoxScore } from './box-score';
import { POSITIONS, type Position } from './positions';
import {
  accumulateSeason,
  minimumGamesForLeaders,
  perGame,
  type SeasonTotals
} from './season-stats';

export const SEASON_AWARD_TYPES = [
  'mvp',
  'top_scorer',
  'top_rebounder',
  'top_assister',
  'best_defender',
  'best_young',
  'coach_of_year',
  'finals_mvp',
  'all_league'
] as const;
export type SeasonAwardType = (typeof SEASON_AWARD_TYPES)[number];

export const SEASON_AWARD_LABEL: Record<SeasonAwardType, string> = {
  mvp: 'MVP de la temporada',
  top_scorer: 'Máximo anotador',
  top_rebounder: 'Máximo reboteador',
  top_assister: 'Máximo asistente',
  best_defender: 'Mejor defensor',
  best_young: 'Mejor joven',
  coach_of_year: 'Entrenador del año',
  finals_mvp: 'MVP de la final',
  all_league: 'Quinteto ideal'
};

/** Qué mide la cifra de cada premio, para la caja de al lado del nombre. */
export const SEASON_AWARD_VALUE_LABEL: Record<SeasonAwardType, string> = {
  mvp: 'Valoración',
  top_scorer: 'Puntos',
  top_rebounder: 'Rebotes',
  top_assister: 'Asistencias',
  best_defender: 'Rob. + tap.',
  best_young: 'Valoración',
  coach_of_year: 'Puestos',
  finals_mvp: 'Valoración',
  all_league: 'Valoración'
};

/** Hasta qué edad se es joven para el premio. */
export const YOUNG_PLAYER_MAX_AGE = 22;

/** Una línea de acta con su partido y el equipo con el que se jugó. */
export type AwardLine = PlayerBoxScore & { gameId: string; teamId: string };

export interface SeasonAwardsInput {
  /** Actas de la fase regular: ni playoffs ni play-in. */
  regularLines: readonly AwardLine[];
  /** Puesto y edad de cada jugador el día de la gala. El que falte no opta a joven ni a quinteto. */
  players: ReadonlyMap<string, { position: Position; age: number }>;
  /** Clasificación final de la fase regular. */
  standings: readonly { teamId: string; position: number }[];
  /** Puesto que se esperaba de cada club por su reputación, el mismo que usa el consejo de la IA. */
  expectedPositions: ReadonlyMap<string, number>;
  /** Quién se sienta en cada banquillo al acabar la liga (id de `coaches`). */
  coaches: ReadonlyMap<string, string>;
  /** La final, si la liga tuvo playoffs: el campeón y las actas de sus partidos. */
  finals: { championTeamId: string; lines: readonly AwardLine[] } | null;
}

export interface SeasonAwardWinner {
  type: SeasonAwardType;
  /** `null` en el entrenador del año. */
  playerId: string | null;
  /** Sólo en el entrenador del año. */
  coachId: string | null;
  teamId: string;
  /**
   * La cifra del premio, en sus unidades: medias por partido en los de
   * jugador, y puestos por encima de lo esperado en el del entrenador.
   */
  value: number;
  /** 0 en los premios sueltos; 0..4 en el quinteto ideal, de base a pívot. */
  slot: number;
  /** Sólo en el quinteto ideal. */
  position: Position | null;
}

/** Un jugador con sus medias y el equipo con el que más jugó. */
interface Candidate {
  totals: SeasonTotals;
  teamId: string;
}

/** Los premios de una liga. Si no hay actas, sólo el del entrenador (que sale de la tabla). */
export function computeSeasonAwards(input: SeasonAwardsInput): SeasonAwardWinner[] {
  const winners: SeasonAwardWinner[] = [];
  const candidates = qualified(input.regularLines);

  const single = (
    type: SeasonAwardType,
    value: (totals: SeasonTotals) => number,
    pool: readonly Candidate[] = candidates
  ): void => {
    const best = bestBy(pool, value);
    if (best) {
      winners.push({
        type,
        playerId: best.totals.playerId,
        coachId: null,
        teamId: best.teamId,
        value: value(best.totals),
        slot: 0,
        position: null
      });
    }
  };

  single('mvp', valuation);
  single('top_scorer', (totals) => perGame(points(totals.box), totals.games));
  single('top_rebounder', (totals) => perGame(totalRebounds(totals.box), totals.games));
  single('top_assister', (totals) => perGame(totals.box.assists, totals.games));
  single('best_defender', (totals) => perGame(totals.box.steals + totals.box.blocks, totals.games));
  single(
    'best_young',
    valuation,
    candidates.filter(
      (candidate) =>
        (input.players.get(candidate.totals.playerId)?.age ?? Infinity) <= YOUNG_PLAYER_MAX_AGE
    )
  );

  const coach = coachOfTheYear(input);
  if (coach) {
    winners.push(coach);
  }

  const finals = finalsMvp(input.finals);
  if (finals) {
    winners.push(finals);
  }

  POSITIONS.forEach((position, slot) => {
    const best = bestBy(
      candidates.filter(
        (candidate) => input.players.get(candidate.totals.playerId)?.position === position
      ),
      valuation
    );
    if (best) {
      winners.push({
        type: 'all_league',
        playerId: best.totals.playerId,
        coachId: null,
        teamId: best.teamId,
        value: valuation(best.totals),
        slot,
        position
      });
    }
  });

  return winners;
}

/** Valoración por partido: la cifra del MVP, del joven y del quinteto. */
function valuation(totals: SeasonTotals): number {
  return perGame(efficiencyRating(totals.box), totals.games);
}

/**
 * Los que llegan al mínimo de partidos, cada uno con el club con el que más
 * jugó. El mínimo se mide contra el equipo que más partidos lleva, como en la
 * tabla de líderes.
 */
function qualified(lines: readonly AwardLine[]): Candidate[] {
  const gamesByTeam = new Map<string, Map<string, number>>();
  const teamGames = new Map<string, Set<string>>();

  for (const line of lines) {
    const games = teamGames.get(line.teamId) ?? new Set<string>();
    games.add(line.gameId);
    teamGames.set(line.teamId, games);
    if (line.secondsPlayed <= 0) {
      continue;
    }
    const byTeam = gamesByTeam.get(line.playerId) ?? new Map<string, number>();
    byTeam.set(line.teamId, (byTeam.get(line.teamId) ?? 0) + 1);
    gamesByTeam.set(line.playerId, byTeam);
  }

  const minimum = minimumGamesForLeaders(
    Math.max(0, ...[...teamGames.values()].map((games) => games.size))
  );

  return accumulateSeason(lines)
    .filter((totals) => totals.games >= minimum)
    .map((totals) => ({ totals, teamId: mainTeam(gamesByTeam.get(totals.playerId)) }))
    .filter((candidate) => candidate.teamId !== '');
}

/** El club con el que más partidos jugó; a igualdad, por id, para que salga siempre igual. */
function mainTeam(byTeam: ReadonlyMap<string, number> | undefined): string {
  if (!byTeam) {
    return '';
  }
  return (
    [...byTeam.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? ''
  );
}

/** El mejor en una cifra; a igualdad, el que más jugó y después por id. */
function bestBy(
  pool: readonly Candidate[],
  value: (totals: SeasonTotals) => number
): Candidate | null {
  return (
    [...pool].sort(
      (a, b) =>
        value(b.totals) - value(a.totals) ||
        b.totals.games - a.totals.games ||
        a.totals.playerId.localeCompare(b.totals.playerId)
    )[0] ?? null
  );
}

/**
 * El entrenador del club que más ha superado lo que se esperaba de él: puesto
 * previsto por la reputación menos puesto final. A igualdad, el que acabó más
 * arriba. Un banquillo vacío no recibe premio: pasa al siguiente.
 */
function coachOfTheYear(input: SeasonAwardsInput): SeasonAwardWinner | null {
  const ranked = input.standings
    .filter((row) => input.coaches.has(row.teamId))
    .map((row) => ({
      row,
      beat: (input.expectedPositions.get(row.teamId) ?? row.position) - row.position
    }))
    .sort((a, b) => b.beat - a.beat || a.row.position - b.row.position);
  const best = ranked[0];
  if (!best) {
    return null;
  }
  return {
    type: 'coach_of_year',
    playerId: null,
    coachId: input.coaches.get(best.row.teamId) ?? null,
    teamId: best.row.teamId,
    value: best.beat,
    slot: 0,
    position: null
  };
}

/** El mejor del campeón en la final, por valoración por partido. */
function finalsMvp(finals: SeasonAwardsInput['finals']): SeasonAwardWinner | null {
  if (!finals) {
    return null;
  }
  const own = finals.lines.filter((line) => line.teamId === finals.championTeamId);
  const best = bestBy(
    accumulateSeason(own)
      .filter((totals) => totals.games > 0)
      .map((totals) => ({ totals, teamId: finals.championTeamId })),
    valuation
  );
  if (!best) {
    return null;
  }
  return {
    type: 'finals_mvp',
    playerId: best.totals.playerId,
    coachId: null,
    teamId: finals.championTeamId,
    value: valuation(best.totals),
    slot: 0,
    position: null
  };
}
