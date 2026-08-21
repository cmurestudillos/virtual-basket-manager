/**
 * Clasificación de liga.
 *
 * El desempate es el del baloncesto y no el del fútbol, que es la diferencia
 * que más se nota al mirar una tabla: primero manda el **resultado particular**
 * entre los empatados (el *average*), y sólo si eso no resuelve se mira la
 * diferencia general. En fútbol se va directo a la diferencia de goles.
 *
 * Función pura sobre los partidos ya jugados: no toca base de datos.
 */

export interface PlayedGame {
  homeTeamId: string;
  awayTeamId: string;
  homeScore: number;
  awayScore: number;
}

export interface StandingRow {
  teamId: string;
  position: number;
  played: number;
  won: number;
  lost: number;
  pointsFor: number;
  pointsAgainst: number;
  /** Diferencia general de puntos. */
  pointsDifference: number;
  /** Racha actual, positiva si son victorias: +3 son tres seguidas ganadas. */
  streak: number;
}

interface Tally {
  teamId: string;
  played: number;
  won: number;
  lost: number;
  pointsFor: number;
  pointsAgainst: number;
  results: boolean[];
}

export function computeStandings(
  teamIds: readonly string[],
  games: readonly PlayedGame[]
): StandingRow[] {
  const tallies = new Map<string, Tally>(
    teamIds.map((teamId) => [
      teamId,
      { teamId, played: 0, won: 0, lost: 0, pointsFor: 0, pointsAgainst: 0, results: [] }
    ])
  );

  for (const game of games) {
    const home = tallies.get(game.homeTeamId);
    const away = tallies.get(game.awayTeamId);
    if (!home || !away) {
      // Un partido de un equipo que no está en esta competición no cuenta para
      // su clasificación; ignorarlo es más seguro que inventarle una fila.
      continue;
    }

    accumulate(home, game.homeScore, game.awayScore);
    accumulate(away, game.awayScore, game.homeScore);
  }

  const ordered = [...tallies.values()].sort((a, b) => compare(a, b, games));

  return ordered.map((tally, index) => ({
    teamId: tally.teamId,
    position: index + 1,
    played: tally.played,
    won: tally.won,
    lost: tally.lost,
    pointsFor: tally.pointsFor,
    pointsAgainst: tally.pointsAgainst,
    pointsDifference: tally.pointsFor - tally.pointsAgainst,
    streak: currentStreak(tally.results)
  }));
}

function accumulate(tally: Tally, scored: number, conceded: number): void {
  tally.played += 1;
  tally.pointsFor += scored;
  tally.pointsAgainst += conceded;
  const won = scored > conceded;
  if (won) {
    tally.won += 1;
  } else {
    tally.lost += 1;
  }
  tally.results.push(won);
}

/**
 * Orden entre dos equipos: victorias, luego el particular entre ellos, luego la
 * diferencia general y por último los puntos anotados. El id sólo entra al
 * final para que el orden sea estable y la tabla no baile entre dos lecturas
 * idénticas.
 */
function compare(a: Tally, b: Tally, games: readonly PlayedGame[]): number {
  if (a.won !== b.won) {
    return b.won - a.won;
  }

  const headToHead = headToHeadDifference(a.teamId, b.teamId, games);
  if (headToHead !== 0) {
    return -headToHead;
  }

  const differenceA = a.pointsFor - a.pointsAgainst;
  const differenceB = b.pointsFor - b.pointsAgainst;
  if (differenceA !== differenceB) {
    return differenceB - differenceA;
  }

  if (a.pointsFor !== b.pointsFor) {
    return b.pointsFor - a.pointsFor;
  }

  return a.teamId.localeCompare(b.teamId);
}

/**
 * Diferencia de puntos en los partidos entre esos dos equipos, desde el punto
 * de vista del primero.
 *
 * Con la ida jugada y la vuelta no, el *average* particular ya cuenta: es
 * exactamente como funciona una clasificación real a mitad de temporada.
 */
export function headToHeadDifference(
  teamId: string,
  rivalId: string,
  games: readonly PlayedGame[]
): number {
  let difference = 0;

  for (const game of games) {
    if (game.homeTeamId === teamId && game.awayTeamId === rivalId) {
      difference += game.homeScore - game.awayScore;
    } else if (game.homeTeamId === rivalId && game.awayTeamId === teamId) {
      difference += game.awayScore - game.homeScore;
    }
  }

  return difference;
}

/** Racha actual: positiva si son victorias seguidas, negativa si son derrotas. */
function currentStreak(results: readonly boolean[]): number {
  if (results.length === 0) {
    return 0;
  }

  const last = results[results.length - 1] as boolean;
  let count = 0;
  for (let index = results.length - 1; index >= 0 && results[index] === last; index -= 1) {
    count += 1;
  }

  return last ? count : -count;
}
