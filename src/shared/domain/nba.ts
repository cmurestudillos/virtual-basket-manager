/**
 * El formato NBA de la liga americana.
 *
 * Es casi un juego aparte, y por eso vive en su propio módulo: **conferencias y
 * divisiones**, un **play-in** para los puestos 7 a 10 de cada conferencia,
 * **playoffs de dieciséis al mejor de siete** por conferencias hasta unas
 * finales, **sin descensos**, un **draft** anual con **lotería** para los que
 * no llegaron a playoffs y un **tope salarial blando** con **impuesto de lujo**.
 *
 * El calendario sigue siendo el del resto del mundo —una vuelta de treinta
 * equipos cabe en la temporada—: lo que cambia es todo lo demás.
 *
 * Funciones puras: ni base de datos ni azar propio (la lotería recibe su Rng).
 */

import { ATTRIBUTE_KEYS, type PlayerAttributes } from './attributes';
import type { PlayoffRound, SeriesPairing } from './playoffs';
import { POSITIONS, type Position } from './positions';
import type { Rng } from '@shared/engine/basketball/rng';

/** La liga que juega con formato NBA en el mundo del juego. */
export const NBA_LEAGUE_ID = 'usa-1';

export const CONFERENCES = ['east', 'west'] as const;
export type Conference = (typeof CONFERENCES)[number];

export const CONFERENCE_LABELS: Record<Conference, string> = {
  east: 'Conferencia Este',
  west: 'Conferencia Oeste'
};

/** Tres divisiones por conferencia, como la liga de verdad. */
export const DIVISIONS: Record<Conference, readonly string[]> = {
  east: ['Atlántico', 'Central', 'Sudeste'],
  west: ['Noroeste', 'Pacífico', 'Suroeste']
};

/** Playoffs: los seis primeros de cada conferencia directos y dos del play-in. */
export const NBA_PLAYOFF_TEAMS = 16;
export const DIRECT_PLAYOFF_SEEDS = 6;
export const PLAY_IN_LAST_SEED = 10;
export const NBA_SERIES_LENGTH = 7;

/** El play-in es la ronda cero del cuadro: va antes de la primera ronda. */
export const PLAY_IN_ROUND = 0;

/**
 * Reparte los equipos en conferencias y divisiones: la mitad a cada lado y
 * cinco por división. Recibe los ids en un orden estable, así que el reparto
 * es siempre el mismo para la misma liga.
 */
export function assignConferences(
  teamIds: readonly string[]
): Map<string, { conference: Conference; division: string }> {
  const sorted = [...teamIds].sort();
  const half = Math.ceil(sorted.length / 2);
  const result = new Map<string, { conference: Conference; division: string }>();

  CONFERENCES.forEach((conference, index) => {
    const members = index === 0 ? sorted.slice(0, half) : sorted.slice(half);
    const divisions = DIVISIONS[conference];
    const perDivision = Math.ceil(members.length / divisions.length);
    members.forEach((teamId, position) => {
      result.set(teamId, {
        conference,
        division: divisions[Math.floor(position / perDivision)] ?? (divisions[0] as string)
      });
    });
  });

  return result;
}

/**
 * La clasificación de cada conferencia a partir de la general: el orden de la
 * general se respeta, sólo se separa por conferencias. Como en la NBA desde
 * 2016, ganar la división no da puesto.
 */
export function conferenceOrder(
  overallOrder: readonly string[],
  conferenceOf: ReadonlyMap<string, Conference>
): Record<Conference, string[]> {
  const order: Record<Conference, string[]> = { east: [], west: [] };
  for (const teamId of overallOrder) {
    const conference = conferenceOf.get(teamId);
    if (conference) {
      order[conference].push(teamId);
    }
  }
  return order;
}

/** Qué se juega cada puesto de una conferencia. */
export function nbaZone(conferenceRank: number): 'playoffs' | 'playIn' | null {
  if (conferenceRank <= DIRECT_PLAYOFF_SEEDS) return 'playoffs';
  if (conferenceRank <= PLAY_IN_LAST_SEED) return 'playIn';
  return null;
}

/**
 * El play-in de una conferencia: el 7º recibe al 8º (el ganador es el séptimo
 * cabeza de serie) y el 9º al 10º (el perdedor se va). El perdedor del primero
 * recibe al ganador del segundo por el octavo puesto.
 */
export function playInOpeners(conferenceOrderIds: readonly string[]): SeriesPairing[] {
  const seed = (rank: number) => conferenceOrderIds[rank - 1] as string;
  return [
    { higherSeedTeamId: seed(7), higherSeed: 7, lowerSeedTeamId: seed(8), lowerSeed: 8 },
    { higherSeedTeamId: seed(9), higherSeed: 9, lowerSeedTeamId: seed(10), lowerSeed: 10 }
  ];
}

/** Los ocho de una conferencia en el cuadro, ya con el play-in resuelto. */
export function conferenceSeeds(
  conferenceOrderIds: readonly string[],
  seventh: string,
  eighth: string
): string[] {
  return [...conferenceOrderIds.slice(0, DIRECT_PLAYOFF_SEEDS), seventh, eighth];
}

/**
 * Primera ronda: 1-8, 4-5, 3-6 y 2-7 en cada conferencia, en ese orden, para
 * que la ronda siguiente sea cruzar vecinos: el ganador del 1-8 con el del
 * 4-5, y el del 3-6 con el del 2-7. Primero el Este, luego el Oeste.
 */
export function nbaFirstRoundPairings(
  east: readonly string[],
  west: readonly string[]
): SeriesPairing[] {
  const pairs: [number, number][] = [
    [1, 8],
    [4, 5],
    [3, 6],
    [2, 7]
  ];
  return [east, west].flatMap((seeds) =>
    pairs.map(([high, low]) => ({
      higherSeedTeamId: seeds[high - 1] as string,
      higherSeed: high,
      lowerSeedTeamId: seeds[low - 1] as string,
      lowerSeed: low
    }))
  );
}

/**
 * Ronda siguiente: vecinos del cuadro, de dos en dos. El factor cancha es para
 * quien tuvo mejor temporada regular, que es lo que dice `record` (1 = el
 * mejor de la liga).
 */
export function nbaNextRoundPairings(
  winnersInBracketOrder: readonly string[],
  record: ReadonlyMap<string, number>
): SeriesPairing[] {
  const pairings: SeriesPairing[] = [];
  for (let index = 0; index + 1 < winnersInBracketOrder.length; index += 2) {
    const first = winnersInBracketOrder[index] as string;
    const second = winnersInBracketOrder[index + 1] as string;
    const firstRank = record.get(first) ?? 99;
    const secondRank = record.get(second) ?? 99;
    const [higher, lower] = firstRank <= secondRank ? [first, second] : [second, first];
    pairings.push({
      higherSeedTeamId: higher,
      higherSeed: record.get(higher) ?? 0,
      lowerSeedTeamId: lower,
      lowerSeed: record.get(lower) ?? 0
    });
  }
  return pairings;
}

/** El cuadro NBA: play-in y cuatro rondas al mejor de siete. */
export function buildNbaPlayoffFormat(): PlayoffRound[] {
  return [
    { round: PLAY_IN_ROUND, name: 'Play-in', bestOf: 1, teams: 8 },
    { round: 1, name: 'Primera ronda', bestOf: NBA_SERIES_LENGTH, teams: 16 },
    { round: 2, name: 'Semifinales de conferencia', bestOf: NBA_SERIES_LENGTH, teams: 8 },
    { round: 3, name: 'Finales de conferencia', bestOf: NBA_SERIES_LENGTH, teams: 4 },
    { round: 4, name: 'Finales', bestOf: NBA_SERIES_LENGTH, teams: 2 }
  ];
}

/**
 * Hasta dónde se llegó, en la escala del consejo (0 fuera, 1 cuartos, 2
 * semifinales, 3 final): la primera ronda y las semifinales de conferencia
 * cuentan como estar en playoffs, las finales de conferencia como unas
 * semifinales y las finales como una final.
 */
export function boardPlayoffRound(nbaRound: number): number {
  if (nbaRound >= 4) return 3;
  if (nbaRound >= 3) return 2;
  if (nbaRound >= 1) return 1;
  return 0;
}

// --- Draft -------------------------------------------------------------------

export const DRAFT_ROUNDS = 2;

/**
 * Probabilidad del número uno para cada equipo de la lotería, del peor al
 * mejor: la tabla de la NBA desde 2019, en milésimas. Los tres peores tienen lo
 * mismo, que es lo que quitó el incentivo de perder a propósito.
 */
export const LOTTERY_ODDS = [140, 140, 140, 125, 105, 90, 75, 60, 45, 30, 20, 15, 10, 5];
/** Elecciones que se sortean; el resto de la lotería va por orden inverso. */
export const LOTTERY_DRAWS = 4;

/**
 * El orden del draft.
 *
 * `lotteryWorstFirst` son los que no jugaron playoffs, del peor al mejor;
 * `playoffWorstFirst`, los demás. Se sortean las cuatro primeras elecciones
 * entre la lotería con sus probabilidades; el resto de la primera ronda va por
 * orden inverso de clasificación. La segunda ronda es el orden inverso entero,
 * sin sorteo.
 */
export function draftOrder(
  lotteryWorstFirst: readonly string[],
  playoffWorstFirst: readonly string[],
  rng: Rng
): { firstRound: string[]; secondRound: string[]; lotteryWinners: string[] } {
  const pool = [...lotteryWorstFirst];
  const weights = pool.map((_, index) => LOTTERY_ODDS[index] ?? 1);
  const winners: string[] = [];

  for (let draw = 0; draw < LOTTERY_DRAWS && pool.length > 0; draw += 1) {
    const chosen = rng.weighted(pool, weights);
    const index = pool.indexOf(chosen);
    winners.push(chosen);
    pool.splice(index, 1);
    weights.splice(index, 1);
  }

  const firstRound = [...winners, ...pool, ...playoffWorstFirst];
  const secondRound = [...lotteryWorstFirst, ...playoffWorstFirst];
  return { firstRound, secondRound, lotteryWinners: winners };
}

/** Número de elección global: 1-30 la primera ronda, 31-60 la segunda. */
export function overallPick(round: number, pickInRound: number, teams: number): number {
  return (round - 1) * teams + pickInRound;
}

/**
 * Sueldo de novato según la elección. La primera ronda tiene escala: el número
 * uno cobra como un titular medio y el treinta, poco más que el mínimo. La
 * segunda ronda va al mínimo.
 */
export function rookieWageCents(pick: number, salaryCapCents: number): number {
  const minimum = minimumSalaryCents(salaryCapCents);
  if (pick > 30) {
    return minimum;
  }
  const top = Math.round(salaryCapCents * 0.075);
  const share = (30 - pick) / 29;
  return Math.max(minimum, Math.round(minimum + (top - minimum) * share * share));
}

/** Años de contrato de novato: tres en primera ronda, dos en segunda. */
export function rookieContractYears(pick: number): number {
  return pick <= 30 ? 3 : 2;
}

/**
 * Prospectos que salen al draft cada año: las dos rondas y un puñado más, que
 * acaban en el mercado como agentes libres si nadie los elige.
 */
export const DRAFT_CLASS_SIZE = 80;

/**
 * Nacionalidades de la clase del draft: la mitad americanos y el resto del
 * mundo, como en las últimas clases de verdad.
 */
export const DRAFT_NATIONALITIES = [
  'USA',
  'USA',
  'USA',
  'USA',
  'USA',
  'FRA',
  'ESP',
  'SRB',
  'AUS',
  'GER',
  'CRO',
  'LTU',
  'GRE',
  'SEN',
  'ARG',
  'BRA',
  'TUR',
  'SLO',
  'ITA',
  'MNE',
  'CAN',
  'CAN',
  'NGR',
  'CMR',
  'SSD',
  'MLI',
  'JPN',
  'CHN',
  'PHI',
  'NZL',
  'LAT',
  'GEO',
  'DOM',
  'PUR',
  'GBR',
  'FIN'
];

/** Un prospecto del draft, antes de convertirse en ficha. */
export interface DraftProspect {
  age: number;
  position: Position;
  secondaryPosition: Position | null;
  attributes: PlayerAttributes;
  potential: number;
  heightCm: number;
  nationality: string;
}

/**
 * Un prospecto de la clase del draft. `rank` es su lugar en la clase (1 = el
 * mejor): los primeros ya podrían jugar hoy minutos de rotación y tienen techo
 * de estrella; los del final son apuestas. Es más hecho que un juvenil de
 * cantera —tiene de 19 a 22 años— y por eso llega directo al primer equipo.
 */
export function generateDraftProspect(rank: number, rng: Rng): DraftProspect {
  const position = POSITIONS[rng.int(0, POSITIONS.length - 1)] as Position;
  const age = rng.int(19, 22);
  // Los mayores están más hechos y tienen menos recorrido.
  const base = Math.round(60 - rank * 0.22 + (age - 19) * 1.5) + rng.int(-4, 4);

  const attributes = {} as PlayerAttributes;
  for (const key of ATTRIBUTE_KEYS) {
    attributes[key] = Math.min(85, Math.max(20, base + rng.int(-8, 8)));
  }

  const growth = rng.int(12, 30) - (age - 19) * 3 - Math.floor(rank / 20);
  return {
    age,
    position,
    secondaryPosition: rng.chance(0.4)
      ? (POSITIONS[rng.int(0, POSITIONS.length - 1)] as Position)
      : null,
    attributes,
    potential: Math.min(95, Math.max(base + 4, base + growth)),
    heightCm: Math.round(PROSPECT_HEIGHTS[position] + rng.int(-5, 6)),
    nationality: DRAFT_NATIONALITIES[rng.int(0, DRAFT_NATIONALITIES.length - 1)] as string
  };
}

const PROSPECT_HEIGHTS: Record<Position, number> = { PG: 188, SG: 195, SF: 201, PF: 206, C: 211 };

// --- Tope salarial -----------------------------------------------------------

/**
 * El tope salarial: la nómina media de la liga. No es una cifra fija de un
 * convenio: se mueve con lo que la liga gasta, que es lo que hace el tope de
 * verdad a lo largo de los años.
 */
export function salaryCapCents(averagePayrollCents: number): number {
  return Math.round(averagePayrollCents / 100_000_00) * 100_000_00;
}

/** El umbral del impuesto de lujo: un 22 % por encima del tope. */
export const LUXURY_TAX_MARGIN = 1.22;
/** Cada euro por encima del umbral cuesta uno y medio de impuesto. */
export const LUXURY_TAX_RATE = 1.5;

export function luxuryTaxLineCents(salaryCapCents: number): number {
  return Math.round(salaryCapCents * LUXURY_TAX_MARGIN);
}

export function luxuryTaxCents(payrollCents: number, taxLineCents: number): number {
  return Math.round(Math.max(0, payrollCents - taxLineCents) * LUXURY_TAX_RATE);
}

/** El contrato mínimo de la liga: un 4 % del tope. */
export function minimumSalaryCents(salaryCapCents: number): number {
  return Math.round(salaryCapCents * 0.04);
}

/**
 * ¿Se puede firmar con el tope blando?
 *
 * Por debajo del tope, cualquier contrato que quepa. Por encima, sólo mínimos:
 * es la excepción que deja completar plantilla a quien ya gasta de más. Renovar
 * a los propios no pasa por aquí —son los derechos Bird—: por eso un equipo
 * puede acabar pagando impuesto de lujo.
 */
export function canSignUnderCap(input: {
  payrollCents: number;
  wageOfferedCents: number;
  salaryCapCents: number;
}): { ok: boolean; reason: string } {
  if (input.payrollCents + input.wageOfferedCents <= input.salaryCapCents) {
    return { ok: true, reason: '' };
  }
  if (input.wageOfferedCents <= minimumSalaryCents(input.salaryCapCents)) {
    return { ok: true, reason: '' };
  }
  return {
    ok: false,
    reason: 'Por encima del tope salarial sólo se pueden firmar contratos mínimos'
  };
}
