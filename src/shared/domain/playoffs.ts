/**
 * Playoffs al formato ACB: ocho equipos, cuartos al mejor de 3 y semifinales y
 * final al mejor de 5.
 *
 * Es la diferencia estructural de fondo con el fútbol y lo que decide de verdad
 * el título en baloncesto: la liga regular no corona campeón, reparte el
 * **factor cancha**. Todo lo de este módulo es función pura sobre listas de
 * equipos y resultados; no sabe de base de datos ni de fechas.
 */

/** Quién juega en casa cada partido de una serie. */
export type SeriesHost = 'higher' | 'lower';

export interface PlayoffRound {
  /** 1 = primera ronda (la más numerosa). */
  round: number;
  name: string;
  /** Partidos de la serie: 3, 5 o 7. */
  bestOf: number;
  /** Equipos que entran en esta ronda. */
  teams: number;
}

export interface SeriesPairing {
  /** El mejor clasificado de la liga regular: tiene el factor cancha. */
  higherSeedTeamId: string;
  /** Posición en la liga regular, 1 es el primero. */
  higherSeed: number;
  lowerSeedTeamId: string;
  lowerSeed: number;
}

export class InvalidPlayoffSizeError extends Error {
  constructor(teamCount: number) {
    super(`Un cuadro de playoffs necesita una potencia de dos (hay ${teamCount})`);
    this.name = 'InvalidPlayoffSizeError';
  }
}

const ROUND_NAMES: Record<number, string> = {
  2: 'Final',
  4: 'Semifinales',
  8: 'Cuartos de final',
  16: 'Octavos de final',
  32: 'Dieciseisavos de final'
};

export function playoffRoundName(teamsInRound: number): string {
  return ROUND_NAMES[teamsInRound] ?? `Ronda de ${teamsInRound}`;
}

/**
 * El cuadro completo: cuántas rondas hay, cómo se llaman y a cuántos partidos
 * se juega cada una.
 *
 * La primera ronda es más corta que el resto —al mejor de 3 frente al mejor de
 * 5— porque es como se juega la ACB, y porque un cuarto de final largo alarga
 * la temporada sin añadir emoción: el favorito casi nunca cae ahí.
 */
export function buildPlayoffFormat(teamCount: number, seriesLength: number): PlayoffRound[] {
  if (teamCount < 2 || (teamCount & (teamCount - 1)) !== 0) {
    throw new InvalidPlayoffSizeError(teamCount);
  }

  const rounds: PlayoffRound[] = [];
  let teams = teamCount;
  let round = 1;

  while (teams >= 2) {
    rounds.push({
      round,
      name: playoffRoundName(teams),
      bestOf: round === 1 && teamCount > 2 ? Math.min(3, seriesLength) : seriesLength,
      teams
    });
    teams /= 2;
    round += 1;
  }

  return rounds;
}

/**
 * Emparejamientos de la primera ronda: 1-8, 2-7, 3-6 y 4-5.
 *
 * `seeds` llega en orden de clasificación, del primero al octavo.
 */
export function firstRoundPairings(seeds: readonly string[]): SeriesPairing[] {
  const pairings: SeriesPairing[] = [];

  for (let index = 0; index < seeds.length / 2; index += 1) {
    const opposite = seeds.length - 1 - index;
    pairings.push({
      higherSeedTeamId: seeds[index] as string,
      higherSeed: index + 1,
      lowerSeedTeamId: seeds[opposite] as string,
      lowerSeed: opposite + 1
    });
  }

  return pairings;
}

/**
 * Ronda siguiente a partir de los ganadores de la anterior.
 *
 * El cuadro es **fijo**, no se reordena: el ganador del 1-8 se cruza con el del
 * 4-5 y el del 2-7 con el del 3-6, que es lo que permite mirar el bracket en
 * octubre y saber con quién te puedes encontrar. Dentro de cada cruce, el mejor
 * clasificado en la liga regular conserva el factor cancha.
 *
 * Los ganadores llegan en el orden de las series de la ronda anterior, cada uno
 * con la posición que tuvo en la liga regular.
 */
export function nextRoundPairings(
  winners: readonly { teamId: string; seed: number }[]
): SeriesPairing[] {
  const pairings: SeriesPairing[] = [];

  for (let index = 0; index < winners.length / 2; index += 1) {
    const first = winners[index] as { teamId: string; seed: number };
    const second = winners[winners.length - 1 - index] as { teamId: string; seed: number };
    const [higher, lower] = first.seed <= second.seed ? [first, second] : [second, first];

    pairings.push({
      higherSeedTeamId: higher.teamId,
      higherSeed: higher.seed,
      lowerSeedTeamId: lower.teamId,
      lowerSeed: lower.seed
    });
  }

  return pairings;
}

/** Victorias que hacen falta para llevarse la serie. */
export function winsNeeded(bestOf: number): number {
  return Math.ceil(bestOf / 2);
}

/**
 * Reparto de campo de una serie, partido a partido.
 *
 * Al mejor de 3 es 2-1 y al mejor de 5, 2-2-1: el mejor clasificado abre en
 * casa y cierra en casa. Eso es exactamente el premio de acabar arriba en la
 * liga regular, y por eso el factor cancha no necesita ninguna otra mecánica.
 */
export function homeAdvantagePattern(bestOf: number): SeriesHost[] {
  const patterns: Record<number, SeriesHost[]> = {
    1: ['higher'],
    3: ['higher', 'lower', 'higher'],
    5: ['higher', 'higher', 'lower', 'lower', 'higher'],
    7: ['higher', 'higher', 'lower', 'lower', 'higher', 'lower', 'higher']
  };

  return (
    patterns[bestOf] ??
    // Formato raro: se alterna empezando en casa del mejor clasificado.
    Array.from({ length: bestOf }, (_, index) => (index % 2 === 0 ? 'higher' : 'lower'))
  );
}

export interface SeriesGameResult {
  homeTeamId: string;
  awayTeamId: string;
  homeScore: number;
  awayScore: number;
}

/** Victorias de cada lado de la serie con lo jugado hasta ahora. */
export function seriesWins(
  pairing: SeriesPairing,
  games: readonly SeriesGameResult[]
): { higher: number; lower: number } {
  let higher = 0;
  let lower = 0;

  for (const game of games) {
    const winnerId = game.homeScore > game.awayScore ? game.homeTeamId : game.awayTeamId;
    if (winnerId === pairing.higherSeedTeamId) {
      higher += 1;
    } else if (winnerId === pairing.lowerSeedTeamId) {
      lower += 1;
    }
  }

  return { higher, lower };
}

/** Ganador de la serie, o `null` si todavía no está decidida. */
export function seriesWinner(
  pairing: SeriesPairing,
  games: readonly SeriesGameResult[],
  bestOf: number
): string | null {
  const wins = seriesWins(pairing, games);
  const needed = winsNeeded(bestOf);

  if (wins.higher >= needed) {
    return pairing.higherSeedTeamId;
  }
  if (wins.lower >= needed) {
    return pairing.lowerSeedTeamId;
  }
  return null;
}
