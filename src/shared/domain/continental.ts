/**
 * Las competiciones continentales: Euroliga, Eurocup, Europe League y American
 * League.
 *
 * Las cuatro se juegan igual —dieciséis equipos, **fase de liga a una vuelta**
 * de quince jornadas entre semana, los ocho primeros a **cuartos al mejor de
 * tres** y una **Final Four** a partido único en sede neutral— porque lo que
 * las distingue no es el reglamento: es contra quién juegas y cuánto paga. Y
 * son la razón de que el mundo tenga catorce países: meten una competición
 * larga en paralelo a la liga, con rivales que no están en la clasificación
 * doméstica y con un premio que cambia el presupuesto del club.
 *
 * Se juega entre semana a propósito. La liga es de domingos, así que jugar en
 * Europa no para el calendario nacional: lo que hace es cansar a la plantilla,
 * que es exactamente lo que tiene que costar.
 *
 * Funciones puras: ni base de datos ni azar.
 */

import { cupPairings, nextCupPairings } from './cup';
import type { SeriesPairing } from './playoffs';

export const CONTINENTAL_TEAMS = 16;
/** Plazas que reparte la liga nacional; el resto son los invitados europeos. */
export const CONTINENTAL_DOMESTIC_SLOTS = 8;
/** Fase de liga a una vuelta: una jornada menos que equipos. */
export const CONTINENTAL_GROUP_ROUNDS = CONTINENTAL_TEAMS - 1;
export const CONTINENTAL_PLAYOFF_TEAMS = 8;
/** Los cuartos son al mejor de tres; la Final Four, a partido único. */
export const CONTINENTAL_SERIES_LENGTH = 3;

/** Rondas del torneo, por encima de las de la fase de liga. */
export const QUARTERFINAL_ROUND = CONTINENTAL_GROUP_ROUNDS + 1;
export const SEMIFINAL_ROUND = QUARTERFINAL_ROUND + 1;
export const FINAL_ROUND = SEMIFINAL_ROUND + 1;

export type ContinentalStage = 'group' | 'quarterfinal' | 'semifinal' | 'final';

export const CONTINENTAL_STAGE_LABELS: Record<ContinentalStage, string> = {
  group: 'Fase de liga',
  quarterfinal: 'Cuartos de final',
  semifinal: 'Semifinal · Final Four',
  final: 'Final · Final Four'
};

/** En qué fase del torneo está una ronda. */
export function continentalStageOf(round: number): ContinentalStage {
  if (round >= FINAL_ROUND) return 'final';
  if (round === SEMIFINAL_ROUND) return 'semifinal';
  if (round === QUARTERFINAL_ROUND) return 'quarterfinal';
  return 'group';
}

/** Cómo se llama esa ronda en el acta y en el cuadro. */
export function continentalRoundName(round: number): string {
  const stage = continentalStageOf(round);
  return stage === 'group' ? `Jornada ${round}` : CONTINENTAL_STAGE_LABELS[stage];
}

/** Partidos de la ronda: tres en cuartos, uno en la Final Four. */
export function continentalBestOf(round: number): number {
  return continentalStageOf(round) === 'quarterfinal' ? CONTINENTAL_SERIES_LENGTH : 1;
}

/** La Final Four se juega en sede única: allí no hay factor cancha para nadie. */
export function isNeutralVenueRound(round: number): boolean {
  const stage = continentalStageOf(round);
  return stage === 'semifinal' || stage === 'final';
}

const DAY_MS = 24 * 60 * 60 * 1000;
/** Jueves: la liga se juega en domingo, así que Europa no la pisa. */
const THURSDAY = 4;
const FRIDAY = 5;

/**
 * Fecha de una jornada de la fase de liga: jueves, una por semana, desde el
 * primero a partir del 16 de octubre. Quince jornadas dejan el corte a finales
 * de enero, con la liga por la mitad.
 */
export function continentalRoundDate(seasonStartYear: number, round: number): Date {
  const first = firstWeekdayOnOrAfter(Date.UTC(seasonStartYear, 9, 16), THURSDAY);
  return new Date(first.getTime() + (round - 1) * 7 * DAY_MS);
}

/**
 * Cuartos de final: tres partidos en nueve días de finales de febrero, con
 * cuatro de descanso entre uno y otro para no caer nunca en domingo de liga.
 */
export function continentalPlayoffDate(seasonStartYear: number, seriesGame: number): Date {
  const first = firstWeekdayOnOrAfter(Date.UTC(seasonStartYear + 1, 1, 19), THURSDAY);
  return new Date(first.getTime() + (seriesGame - 1) * 4 * DAY_MS);
}

/**
 * Final Four: semifinales el viernes y final el lunes siguiente, como el
 * torneo de verdad, y las cuatro en la misma cancha.
 */
export function finalFourDate(seasonStartYear: number, round: number): Date {
  const friday = firstWeekdayOnOrAfter(Date.UTC(seasonStartYear + 1, 2, 20), FRIDAY);
  return round >= FINAL_ROUND ? new Date(friday.getTime() + 3 * DAY_MS) : friday;
}

/** La fecha que le toca a una ronda, sea de la fase que sea. */
export function continentalDateFor(seasonStartYear: number, round: number, seriesGame = 1): Date {
  switch (continentalStageOf(round)) {
    case 'group':
      return continentalRoundDate(seasonStartYear, round);
    case 'quarterfinal':
      return continentalPlayoffDate(seasonStartYear, seriesGame);
    default:
      return finalFourDate(seasonStartYear, round);
  }
}

/** Cruces de cuartos: 1-8, 2-7, 3-6 y 4-5 sobre la fase de liga. */
export function quarterfinalPairings(seeds: readonly string[]): SeriesPairing[] {
  return cupPairings(seeds.slice(0, CONTINENTAL_PLAYOFF_TEAMS));
}

/** Y la ronda siguiente, con el cuadro fijo: el mejor contra el peor que quede. */
export function nextContinentalPairings(
  winners: readonly { teamId: string; seed: number }[]
): SeriesPairing[] {
  return nextCupPairings(winners);
}

/**
 * Aforo mínimo del pabellón para jugar cada categoría continental.
 *
 * Es una norma de verdad —la Euroliga exige un pabellón grande— y aquí hace
 * algo más: le da sentido a ampliar el pabellón. Un club que pelea por entrar
 * en Europa y no llega al aforo sabe exactamente qué obra le falta.
 */
export const MIN_CAPACITY_BY_TIER: Record<number, number> = {
  1: 7_000,
  2: 4_500,
  3: 3_000
};

/** Plazas que puede llevarse una misma liga: sin tope, la mejor las coparía. */
export const MAX_PER_LEAGUE = 4;

export interface ContinentalCandidate {
  teamId: string;
  competitionId: string;
  /** Puesto en su liga el curso pasado; 1 es el campeón. */
  rank: number;
  reputation: number;
  capacity: number;
}

/**
 * Quién juega una competición continental.
 *
 * Dos reglas, y las dos importan. Dentro de cada liga manda **el puesto**: el
 * tercero de una liga no puede entrar antes que el segundo, pase lo que pase.
 * Entre ligas manda **la reputación**: la plaza siguiente se la lleva el mejor
 * club que quede de cualquier país. Eso reparte como reparte la realidad —las
 * ligas fuertes se llevan más plazas, pero ninguna se lo lleva todo— sin
 * necesidad de una tabla de coeficientes por país.
 *
 * `taken` son los que ya juegan una competición de más rango: nadie juega dos.
 */
export function qualifyForContinental(
  candidates: readonly ContinentalCandidate[],
  options: {
    slots: number;
    minCapacity: number;
    maxPerLeague?: number;
    taken?: ReadonlySet<string>;
  }
): string[] {
  const taken = options.taken ?? new Set<string>();
  const maxPerLeague = options.maxPerLeague ?? MAX_PER_LEAGUE;

  const queues = new Map<string, ContinentalCandidate[]>();
  for (const candidate of candidates) {
    if (taken.has(candidate.teamId) || candidate.capacity < options.minCapacity) {
      continue;
    }
    const queue = queues.get(candidate.competitionId);
    if (queue) {
      queue.push(candidate);
    } else {
      queues.set(candidate.competitionId, [candidate]);
    }
  }

  // Orden estable: mismo mundo, mismo cuadro, pase lo que pase.
  const leagues = [...queues.keys()].sort();
  for (const league of leagues) {
    (queues.get(league) as ContinentalCandidate[]).sort(
      (a, b) => a.rank - b.rank || a.teamId.localeCompare(b.teamId)
    );
  }

  const chosen: string[] = [];
  const perLeague = new Map<string, number>();

  while (chosen.length < options.slots) {
    let best: ContinentalCandidate | null = null;
    let bestLeague: string | null = null;

    for (const league of leagues) {
      if ((perLeague.get(league) ?? 0) >= maxPerLeague) {
        continue;
      }
      const head = (queues.get(league) as ContinentalCandidate[])[0];
      if (!head) {
        continue;
      }
      if (!best || head.reputation > best.reputation) {
        best = head;
        bestLeague = league;
      }
    }

    if (!best || !bestLeague) {
      break;
    }

    (queues.get(bestLeague) as ContinentalCandidate[]).shift();
    perLeague.set(bestLeague, (perLeague.get(bestLeague) ?? 0) + 1);
    chosen.push(best.teamId);
  }

  return chosen;
}

/**
 * Lo que paga Europa.
 *
 * Entrar ya da dinero —son los derechos de la competición— y cada ronda suma.
 * Es la mayor entrada suelta del juego a propósito: clasificarse tiene que
 * cambiar el presupuesto del club, no adornarlo.
 */
export function continentalPrizeCents(
  stage: ContinentalStage,
  champion: boolean,
  tier = 1
): number {
  const byStage: Record<ContinentalStage, number> = {
    group: 900_000_00,
    quarterfinal: 400_000_00,
    semifinal: 600_000_00,
    final: 400_000_00
  };

  // Cada escalón paga la mitad que el de encima: ganar la tercera competición
  // del continente está bien, pero no es entrar en la primera.
  const factor = 1 / Math.pow(2, Math.max(0, tier - 1));
  return Math.round((byStage[stage] + (champion ? 1_200_000_00 : 0)) * factor);
}

function firstWeekdayOnOrAfter(timestamp: number, weekday: number): Date {
  const date = new Date(timestamp);
  const days = (weekday - date.getUTCDay() + 7) % 7;
  return new Date(timestamp + days * DAY_MS);
}
