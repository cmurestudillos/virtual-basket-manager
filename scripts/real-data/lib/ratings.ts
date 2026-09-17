import {
  ATTRIBUTE_KEYS,
  overallForPosition,
  type PlayerAttributes
} from '../../../src/shared/domain/attributes';
import type { Position } from '../../../src/shared/domain/positions';
import type { SourcePlayer, SourceStats } from './source-types';

/**
 * De estadísticas reales a los 21 atributos del juego.
 *
 * El motor está calibrado con el mundo inventado: sus medias de anotación,
 * rebote y pérdidas salen de cómo se reparten los atributos en las ligas
 * ficticias. Así que la conversión **no inventa una escala nueva**: coloca a
 * cada jugador real en un percentil de su liga y le da el valor que tiene ese
 * mismo percentil en la liga ficticia equivalente. La ACB real queda con el
 * nivel de la Liga Nacional inventada, y el motor no se entera del cambio.
 *
 * Cada atributo mezcla dos cosas:
 *
 * - **El nivel**: cuánto confía el entrenador en él (minutos por partido) y
 *   cuánto produce (valoración por minuto). Es lo que separa a un titular de
 *   Euroliga de un duodécimo jugador aunque los dos tiren bien de tres.
 * - **El estilo**: la estadística que mide ese atributo — triples, rebotes,
 *   tapones, asistencias.
 *
 * Con pocos minutos una estadística miente (tres de tres en triples), así que
 * cada ritmo se acerca a la media de su puesto en proporción a lo poco que ha
 * jugado. Y quien no tiene estadísticas en la liga —el fichaje que llega de
 * fuera— recibe los valores típicos de su puesto, con el nivel estimado por
 * su cupo, su edad y su altura.
 */

/**
 * Cuánto pesa el nivel del equipo en el nivel del jugador (0-1).
 *
 * Sólo con estadísticas la liga sale plana: un club con Euroliga reparte los
 * minutos entre doce buenos y sus estrellas hacen números de rotación, y el
 * mejor de un equipo de abajo acapara balón y minutos. El puesto final del
 * equipo pone a cada plantilla cerca de donde acabó de verdad.
 */
export const TEAM_WEIGHT = 0.45;

/** Minutos a partir de los cuales una estadística se cree a medias. */
const SHRINK_MINUTES = 300;
/** Menos minutos que esto en toda la temporada es como no tener estadísticas. */
export const MIN_MINUTES_FOR_STATS = 40;

/** Las métricas de estilo que se calculan de las estadísticas. */
export type Metric =
  | 'level'
  | 'minutes'
  | 'ratingRate'
  | 'twoPct'
  | 'threePct'
  | 'threeRate'
  | 'ftPct'
  | 'ftRate'
  | 'dunkRate'
  | 'assistRate'
  | 'assistToTurnover'
  | 'ballSecurity'
  | 'stealRate'
  | 'blockRate'
  | 'offRebRate'
  | 'defRebRate'
  | 'foulRate'
  | 'drawnRate'
  | 'games';

/**
 * Qué métricas alimentan cada atributo, y con qué peso. `level` entra en
 * todos: un atributo nunca es sólo estilo.
 */
export const ATTRIBUTE_RECIPES: Record<keyof PlayerAttributes, Partial<Record<Metric, number>>> = {
  close: { level: 0.45, twoPct: 0.4, drawnRate: 0.15 },
  midRange: { level: 0.5, twoPct: 0.25, ftPct: 0.25 },
  threePoint: { level: 0.35, threePct: 0.4, threeRate: 0.25 },
  freeThrow: { level: 0.3, ftPct: 0.7 },
  finishing: { level: 0.4, twoPct: 0.25, dunkRate: 0.2, ftRate: 0.15 },
  passing: { level: 0.4, assistRate: 0.45, assistToTurnover: 0.15 },
  handling: { level: 0.4, ballSecurity: 0.35, assistRate: 0.25 },
  driving: { level: 0.45, ftRate: 0.3, drawnRate: 0.25 },
  perimeterDefense: { level: 0.65, stealRate: 0.35 },
  interiorDefense: { level: 0.55, blockRate: 0.25, defRebRate: 0.2 },
  steal: { level: 0.3, stealRate: 0.7 },
  block: { level: 0.25, blockRate: 0.75 },
  offensiveRebound: { level: 0.3, offRebRate: 0.7 },
  defensiveRebound: { level: 0.3, defRebRate: 0.7 },
  speed: { level: 0.55, stealRate: 0.2, threeRate: 0.25 },
  strength: { level: 0.5, offRebRate: 0.3, ftRate: 0.2 },
  jumping: { level: 0.45, blockRate: 0.3, dunkRate: 0.25 },
  stamina: { level: 0.4, minutes: 0.6 },
  basketballIQ: { level: 0.7, assistToTurnover: 0.3 },
  consistency: { level: 0.6, games: 0.4 },
  aggression: { level: 0.3, foulRate: 0.4, drawnRate: 0.3 }
};

/** Las métricas de un jugador; `null` si no hay estadísticas que creerse. */
export type PlayerMetrics = Record<Metric, number>;

function per40(value: number, seconds: number): number {
  return seconds > 0 ? (value * 2400) / seconds : 0;
}

/** Acerca un ritmo a la media de su puesto cuanto menos ha jugado. */
export function shrink(value: number, minutes: number, prior: number): number {
  return (value * minutes + prior * SHRINK_MINUTES) / (minutes + SHRINK_MINUTES);
}

/** Métricas sin encoger, directas de las estadísticas. */
export function rawMetrics(stats: SourceStats): PlayerMetrics {
  const seconds = stats.seconds;
  const fga = stats.twoPointAttempted + stats.threePointAttempted;
  const possessions = fga + 0.44 * stats.freeThrowAttempted + stats.assists + stats.turnovers;
  const minutesPerGame = stats.games > 0 ? seconds / 60 / stats.games : 0;
  const rating =
    stats.rating ??
    stats.points +
      stats.offensiveRebounds +
      stats.defensiveRebounds +
      stats.assists +
      stats.steals +
      stats.blocks -
      (fga - stats.twoPointMade - stats.threePointMade) -
      (stats.freeThrowAttempted - stats.freeThrowMade) -
      stats.turnovers;

  return {
    // El nivel se rellena al sacar percentiles: es la media del percentil de
    // minutos por partido (la confianza del entrenador) y del de valoración por
    // cuarenta minutos (lo que produce con ellos). Sumarlos en bruto mezclaría
    // escalas que no tienen nada que ver.
    level: 0,
    minutes: minutesPerGame,
    ratingRate: per40(rating, seconds),
    twoPct: stats.twoPointAttempted > 0 ? stats.twoPointMade / stats.twoPointAttempted : 0,
    threePct: stats.threePointAttempted > 0 ? stats.threePointMade / stats.threePointAttempted : 0,
    threeRate: fga > 0 ? stats.threePointAttempted / fga : 0,
    ftPct: stats.freeThrowAttempted > 0 ? stats.freeThrowMade / stats.freeThrowAttempted : 0,
    ftRate: fga > 0 ? stats.freeThrowAttempted / fga : 0,
    dunkRate: per40(stats.dunks ?? 0, seconds),
    assistRate: per40(stats.assists, seconds),
    assistToTurnover: stats.assists / Math.max(1, stats.turnovers),
    ballSecurity: possessions > 0 ? 1 - stats.turnovers / possessions : 0,
    stealRate: per40(stats.steals, seconds),
    blockRate: per40(stats.blocks, seconds),
    offRebRate: per40(stats.offensiveRebounds, seconds),
    defRebRate: per40(stats.defensiveRebounds, seconds),
    foulRate: per40(stats.fouls, seconds),
    drawnRate: per40(stats.foulsDrawn ?? stats.freeThrowAttempted / 2, seconds),
    games: stats.games
  };
}

const METRICS: readonly Metric[] = [
  'level',
  'minutes',
  'ratingRate',
  'twoPct',
  'threePct',
  'threeRate',
  'ftPct',
  'ftRate',
  'dunkRate',
  'assistRate',
  'assistToTurnover',
  'ballSecurity',
  'stealRate',
  'blockRate',
  'offRebRate',
  'defRebRate',
  'foulRate',
  'drawnRate',
  'games'
];

/** Percentil (0-1) de `value` dentro de una lista ya ordenada, con empates al medio. */
export function percentileOf(sorted: readonly number[], value: number): number {
  if (sorted.length === 0) return 0.5;
  let below = 0;
  let equal = 0;
  for (const item of sorted) {
    if (item < value) below += 1;
    else if (item === value) equal += 1;
  }
  return (below + equal / 2) / sorted.length;
}

/** El valor de una lista ordenada en un percentil (0-1), interpolando. */
export function quantileOf(sorted: readonly number[], percentile: number): number {
  if (sorted.length === 0) return 50;
  const position = Math.min(1, Math.max(0, percentile)) * (sorted.length - 1);
  const low = Math.floor(position);
  const high = Math.ceil(position);
  const fraction = position - low;
  return (sorted[low] as number) * (1 - fraction) + (sorted[high] as number) * fraction;
}

/** Un número estable entre -1 y 1 a partir de un texto: variación sin azar. */
export function jitter(seed: string): number {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return ((hash >>> 0) / 0xffffffff) * 2 - 1;
}

export interface RatedPlayer {
  source: SourcePlayer;
  position: Position;
  attributes: PlayerAttributes;
  overall: number;
  /** Percentil de nivel dentro de su liga (0-1): decide sueldo y valor. */
  level: number;
  /** Si los atributos salen de sus estadísticas o están estimados. */
  estimated: boolean;
}

export interface LeagueReference {
  /** Valores ordenados de cada atributo en la liga ficticia equivalente. */
  attributes: Record<keyof PlayerAttributes, number[]>;
}

/** Saca la referencia (valores ordenados por atributo) de las fichas de una liga ficticia. */
export function referenceFrom(
  players: readonly { attributes: PlayerAttributes }[]
): LeagueReference {
  const attributes = {} as Record<keyof PlayerAttributes, number[]>;
  for (const key of ATTRIBUTE_KEYS) {
    attributes[key] = players.map((player) => player.attributes[key]).sort((a, b) => a - b);
  }
  return { attributes };
}

/**
 * El nivel estimado de quien no tiene estadísticas en la liga, en percentil.
 *
 * Un extracomunitario que ficha un club casi siempre llega para jugar; un
 * junior de formación, casi nunca. La edad y la altura matizan.
 */
export function estimatedLevel(player: SourcePlayer): number {
  const licence = (player.licence ?? '').toUpperCase();
  let level = 0.45;
  if (licence.includes('EXT')) level = 0.62;
  else if (licence.includes('COT')) level = 0.55;
  else if (licence.includes('JFL') || licence === 'SI') level = 0.35;
  const age = player.age ?? ageFrom(player.birthDate, 2025);
  if (age !== null) {
    if (age <= 20) level -= 0.15;
    else if (age <= 22) level -= 0.07;
    else if (age >= 34) level -= 0.05;
  }
  return Math.min(0.85, Math.max(0.08, level + jitter(`${player.sourceId}:level`) * 0.06));
}

export function ageFrom(birthDate: string | null, seasonStartYear: number): number | null {
  if (!birthDate) return null;
  const year = Number(birthDate.slice(0, 4));
  return Number.isFinite(year) ? seasonStartYear - year : null;
}

/**
 * Pone atributos a todos los jugadores de una liga real.
 *
 * `positionOf` decide el puesto de cada uno (la fuente o, si no lo da, una
 * estimación por altura), y la referencia es la liga ficticia con la que se
 * calibra. `teamStrengthOf` da el nivel de su equipo en la liga (1 el
 * campeón de la liga regular, 0 el último; `null` si no se sabe), que entra
 * en el nivel con `TEAM_WEIGHT`.
 */
export function rateLeague(
  players: readonly SourcePlayer[],
  reference: LeagueReference,
  positionOf: (player: SourcePlayer) => Position,
  teamStrengthOf: (player: SourcePlayer) => number | null = () => null
): RatedPlayer[] {
  const withStats = players.filter(
    (player) => player.stats && player.stats.seconds / 60 >= MIN_MINUTES_FOR_STATS
  );

  // Medias de cada métrica por puesto: el sitio al que se encoge quien jugó poco.
  const raw = new Map(withStats.map((player) => [player, rawMetrics(player.stats as SourceStats)]));
  const priors = new Map<Position, PlayerMetrics>();
  for (const position of ['PG', 'SG', 'SF', 'PF', 'C'] as Position[]) {
    const group = withStats.filter((player) => positionOf(player) === position);
    const pool = group.length > 0 ? group : withStats;
    const prior = {} as PlayerMetrics;
    for (const metric of METRICS) {
      const values = pool.map((player) => (raw.get(player) as PlayerMetrics)[metric]);
      prior[metric] = values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
    }
    priors.set(position, prior);
  }

  const shrunk = new Map<SourcePlayer, PlayerMetrics>();
  for (const player of withStats) {
    const metrics = raw.get(player) as PlayerMetrics;
    const minutes = (player.stats as SourceStats).seconds / 60;
    const prior = priors.get(positionOf(player)) as PlayerMetrics;
    const result = {} as PlayerMetrics;
    for (const metric of METRICS) {
      // Minutos y partidos no se encogen: son hechos, no ritmos.
      result[metric] =
        metric === 'minutes' || metric === 'games'
          ? metrics[metric]
          : shrink(metrics[metric], minutes, prior[metric]);
    }
    shrunk.set(player, result);
  }

  // Las distribuciones de la liga real, para sacar percentiles.
  const sortedMetric = new Map<Metric, number[]>();
  for (const metric of METRICS) {
    sortedMetric.set(
      metric,
      [...shrunk.values()].map((metrics) => metrics[metric]).sort((a, b) => a - b)
    );
  }

  // Percentiles típicos de cada puesto: lo que recibe quien no tiene estadísticas.
  const typical = new Map<Position, Record<Metric, number>>();
  for (const position of ['PG', 'SG', 'SF', 'PF', 'C'] as Position[]) {
    const group = withStats.filter((player) => positionOf(player) === position);
    const record = {} as Record<Metric, number>;
    for (const metric of METRICS) {
      const values = group
        .map((player) =>
          percentileOf(
            sortedMetric.get(metric) as number[],
            (shrunk.get(player) as PlayerMetrics)[metric]
          )
        )
        .sort((a, b) => a - b);
      record[metric] = values.length > 0 ? quantileOf(values, 0.5) : 0.5;
    }
    typical.set(position, record);
  }

  // Primera pasada: la mezcla de percentiles de cada atributo, jugador a jugador.
  const blends = players.map((player) => {
    const position = positionOf(player);
    const metrics = shrunk.get(player);
    const percentiles = {} as Record<Metric, number>;
    for (const metric of METRICS) {
      percentiles[metric] = metrics
        ? percentileOf(sortedMetric.get(metric) as number[], metrics[metric])
        : (typical.get(position) as Record<Metric, number>)[metric];
    }
    const own = metrics
      ? (percentiles.minutes + percentiles.ratingRate) / 2
      : estimatedLevel(player);
    const team = teamStrengthOf(player);
    percentiles.level = team === null ? own : own * (1 - TEAM_WEIGHT) + team * TEAM_WEIGHT;
    if (!metrics) percentiles.minutes = percentiles.level;

    const blend = {} as Record<keyof PlayerAttributes, number>;
    for (const key of ATTRIBUTE_KEYS) {
      let weighted = 0;
      let total = 0;
      for (const [metric, weight] of Object.entries(ATTRIBUTE_RECIPES[key]) as [Metric, number][]) {
        weighted += percentiles[metric] * weight;
        total += weight;
      }
      // Un poco de variación estable para que dos jugadores con los mismos
      // números no sean clones, sin mover a nadie de sitio.
      blend[key] = weighted / total + jitter(`${player.sourceId}:${key}`) * 0.02;
    }
    return { player, position, blend, level: percentiles.level, estimated: !metrics };
  });

  // Segunda pasada: promediar percentiles los amontona hacia la mitad, y la
  // liga real saldría más igualada que la ficticia. Se vuelven a ordenar las
  // mezclas dentro de la liga, y es ese orden el que se traduce a valor.
  const sortedBlend = {} as Record<keyof PlayerAttributes, number[]>;
  for (const key of ATTRIBUTE_KEYS) {
    sortedBlend[key] = blends.map((entry) => entry.blend[key]).sort((a, b) => a - b);
  }

  return blends.map(({ player, position, blend, level, estimated }) => {
    const attributes = {} as PlayerAttributes;
    for (const key of ATTRIBUTE_KEYS) {
      const percentile = percentileOf(sortedBlend[key], blend[key]);
      const value = quantileOf(reference.attributes[key], percentile);
      attributes[key] = Math.round(Math.min(97, Math.max(15, value)));
    }
    return {
      source: player,
      position,
      attributes,
      overall: overallForPosition(attributes, position),
      level,
      estimated
    };
  });
}
