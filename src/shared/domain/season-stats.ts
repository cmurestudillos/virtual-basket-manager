/**
 * Estadística de temporada: sumar actas y sacar medias.
 *
 * El acta de cada partido se guarda en crudo, así que todo lo que enseña el
 * juego —medias por jugador, líderes de la liga, valoración— se calcula aquí al
 * leer. Ninguna media se persiste: una media guardada miente en cuanto se juega
 * el partido siguiente.
 */

import {
  addBoxScores,
  efficiencyRating,
  emptyPlayerBoxScore,
  points,
  totalRebounds,
  type PlayerBoxScore
} from './box-score';

/** Acumulado de un jugador en la temporada, más los partidos que ha disputado. */
export interface SeasonTotals {
  playerId: string;
  /** Partidos jugados de verdad: los que pisó la pista, no los de convocatoria. */
  games: number;
  box: PlayerBoxScore;
}

export type LeaderCategory =
  | 'points'
  | 'rebounds'
  | 'assists'
  | 'steals'
  | 'blocks'
  | 'threePointMade'
  | 'efficiency'
  | 'minutes';

export const LEADER_CATEGORY_LABELS: Record<LeaderCategory, string> = {
  points: 'Puntos',
  rebounds: 'Rebotes',
  assists: 'Asistencias',
  steals: 'Robos',
  blocks: 'Tapones',
  threePointMade: 'Triples',
  efficiency: 'Valoración',
  minutes: 'Minutos'
};

/**
 * Suma las líneas de acta de una temporada, agrupadas por jugador.
 *
 * Una línea con cero segundos cuenta como acta pero no como partido jugado: el
 * duodécimo que se queda en el banquillo no debe arrastrar la media de nadie.
 */
export function accumulateSeason(lines: readonly PlayerBoxScore[]): SeasonTotals[] {
  const totals = new Map<string, SeasonTotals>();

  for (const line of lines) {
    const current = totals.get(line.playerId) ?? {
      playerId: line.playerId,
      games: 0,
      box: emptyPlayerBoxScore(line.playerId)
    };

    totals.set(line.playerId, {
      playerId: line.playerId,
      games: current.games + (line.secondsPlayed > 0 ? 1 : 0),
      box: addBoxScores(current.box, line)
    });
  }

  return [...totals.values()];
}

/** Media por partido con un decimal; 0 si no jugó ninguno (nunca `NaN`). */
export function perGame(total: number, games: number): number {
  if (games <= 0) {
    return 0;
  }
  return Math.round((total / games) * 10) / 10;
}

/** Total de la temporada en una categoría. */
export function categoryTotal(box: PlayerBoxScore, category: LeaderCategory): number {
  switch (category) {
    case 'points':
      return points(box);
    case 'rebounds':
      return totalRebounds(box);
    case 'assists':
      return box.assists;
    case 'steals':
      return box.steals;
    case 'blocks':
      return box.blocks;
    case 'threePointMade':
      return box.threePointMade;
    case 'efficiency':
      return efficiencyRating(box);
    case 'minutes':
      return box.secondsPlayed / 60;
  }
}

export function categoryAverage(totals: SeasonTotals, category: LeaderCategory): number {
  return perGame(categoryTotal(totals.box, category), totals.games);
}

/**
 * Partidos mínimos para entrar en la tabla de líderes.
 *
 * La mitad de los que lleva jugados la liga, como en la ACB: sin un mínimo, el
 * que juega un partido, mete veinte puntos y se lesiona lidera la anotación
 * hasta junio.
 */
export function minimumGamesForLeaders(teamGames: number): number {
  return Math.max(1, Math.ceil(teamGames / 2));
}

/**
 * Líderes de una categoría, por media y no por total: es como se leen las
 * estadísticas de baloncesto. Empates deshechos por partidos jugados y, si
 * hiciera falta, por id, para que la tabla salga siempre igual.
 */
export function rankLeaders(
  entries: readonly SeasonTotals[],
  category: LeaderCategory,
  options: { minimumGames: number; limit: number }
): SeasonTotals[] {
  return entries
    .filter((entry) => entry.games >= options.minimumGames)
    .sort(
      (a, b) =>
        categoryAverage(b, category) - categoryAverage(a, category) ||
        b.games - a.games ||
        a.playerId.localeCompare(b.playerId)
    )
    .slice(0, options.limit);
}
