/**
 * Las selecciones.
 *
 * Cada verano se juega un **Mundial** de dieciséis: el anfitrión y los tres
 * primeros de cada grupo de clasificación. La clasificación son grupos de
 * cuatro a ida y vuelta, repartidos en tres **ventanas**: dos partidos en
 * noviembre, dos en febrero y dos a primeros de agosto. El Mundial va a
 * continuación: grupos de cuatro a una vuelta, cuartos, semifinales y final,
 * todo a partido único.
 *
 * No hay campeonatos continentales alternos a propósito: de las veintiuna
 * selecciones del mundo quince son europeas, y un torneo continental dejaría a
 * Australia y a Senegal sin nada que jugar y a América con cuatro.
 *
 * Los partidos de ventana van en **viernes y lunes**: la liga es de domingos y
 * Europa de jueves, así que no se pisan. Lo que sí pasa es que el convocado se
 * pierde el domingo con su club. Y como en la realidad, en noviembre y febrero
 * no sueltan a sus jugadores ni la liga americana ni los clubes que juegan
 * competición continental; al verano va todo el mundo.
 *
 * Funciones puras: ni base de datos ni azar propio (el sorteo recibe su Rng).
 */

import type { Position } from './positions';
import type { SeriesPairing } from './playoffs';
import type { Rng } from '@shared/engine/basketball/rng';

/** Nombre de cada selección por su código de nacionalidad. */
export const NATION_NAMES: Record<string, string> = {
  ARG: 'Argentina',
  AUS: 'Australia',
  BEL: 'Bélgica',
  BIH: 'Bosnia y Herzegovina',
  BRA: 'Brasil',
  CHI: 'Chile',
  CRO: 'Croacia',
  ESP: 'España',
  FRA: 'Francia',
  GER: 'Alemania',
  GRE: 'Grecia',
  ISR: 'Israel',
  ITA: 'Italia',
  LTU: 'Lituania',
  MNE: 'Montenegro',
  NED: 'Países Bajos',
  SEN: 'Senegal',
  SLO: 'Eslovenia',
  SRB: 'Serbia',
  TUR: 'Turquía',
  USA: 'Estados Unidos',
  ANG: 'Angola',
  CAN: 'Canadá',
  CHN: 'China',
  CIV: 'Costa de Marfil',
  CMR: 'Camerún',
  CPV: 'Cabo Verde',
  CZE: 'Chequia',
  DOM: 'República Dominicana',
  EGY: 'Egipto',
  FIN: 'Finlandia',
  GBR: 'Gran Bretaña',
  GEO: 'Georgia',
  HUN: 'Hungría',
  IRI: 'Irán',
  JOR: 'Jordania',
  JPN: 'Japón',
  KOR: 'Corea del Sur',
  LAT: 'Letonia',
  LBN: 'Líbano',
  MEX: 'México',
  MKD: 'Macedonia del Norte',
  MLI: 'Malí',
  NGR: 'Nigeria',
  NZL: 'Nueva Zelanda',
  PHI: 'Filipinas',
  POL: 'Polonia',
  POR: 'Portugal',
  PUR: 'Puerto Rico',
  SSD: 'Sudán del Sur',
  TUN: 'Túnez',
  UKR: 'Ucrania',
  URU: 'Uruguay',
  VEN: 'Venezuela',
  // Países con jugadores en las ligas reales pero sin cantera para una
  // selección: sólo dan nombre a la nacionalidad. Una selección necesita
  // `MIN_NATIONAL_POOL` jugadores, así que no aparecen en el Mundial.
  AND: 'Andorra',
  ARM: 'Armenia',
  AUT: 'Austria',
  AZE: 'Azerbaiyán',
  BAH: 'Bahamas',
  BAR: 'Barbados',
  BUL: 'Bulgaria',
  CAF: 'República Centroafricana',
  CGO: 'Congo',
  CHA: 'Chad',
  COD: 'República Democrática del Congo',
  COL: 'Colombia',
  CUB: 'Cuba',
  DEN: 'Dinamarca',
  EST: 'Estonia',
  GHA: 'Ghana',
  GUI: 'Guinea',
  HAI: 'Haití',
  IRL: 'Irlanda',
  ISL: 'Islandia',
  JAM: 'Jamaica',
  NOR: 'Noruega',
  ROU: 'Rumanía',
  RUS: 'Rusia',
  SKN: 'San Cristóbal y Nieves',
  SLE: 'Sierra Leona',
  SUI: 'Suiza',
  SVK: 'Eslovaquia',
  SWE: 'Suecia',
  UGA: 'Uganda'
};

export function nationName(code: string): string {
  return NATION_NAMES[code] ?? code;
}

/** Id del equipo de una selección: fijo, para que sobreviva a todo. */
export function nationalTeamId(code: string): string {
  return `seleccion-${code.toLowerCase()}`;
}

export const NATIONAL_SQUAD_SIZE = 12;
/** Sin doce jugadores de un país no hay selección que montar. */
export const MIN_NATIONAL_POOL = NATIONAL_SQUAD_SIZE;
export const WORLD_CUP_TEAMS = 16;
export const QUALIFIER_GROUP_SIZE = 4;
/** Cuatro equipos a ida y vuelta: seis jornadas, dos por ventana. */
export const QUALIFIER_MATCHDAYS = 6;
export const WORLD_CUP_GROUPS = 4;

/** Las rondas del Mundial: tres de grupo y tres de eliminatoria. */
export const WORLD_CUP_QUARTERFINAL = 4;
export const WORLD_CUP_SEMIFINAL = 5;
export const WORLD_CUP_FINAL = 6;

export const NATIONAL_WINDOWS = ['november', 'february', 'summer'] as const;
export type NationalWindow = (typeof NATIONAL_WINDOWS)[number];

export const NATIONAL_WINDOW_LABELS: Record<NationalWindow, string> = {
  november: 'Ventana de noviembre',
  february: 'Ventana de febrero',
  summer: 'Verano'
};

const DAY_MS = 24 * 60 * 60 * 1000;
const FRIDAY = 5;
const TUESDAY = 2;
/** Días entre la convocatoria y el primer partido de la ventana. */
export const CALLUP_NOTICE_DAYS = 10;

function firstWeekdayOnOrAfter(timestamp: number, weekday: number): Date {
  const date = new Date(timestamp);
  const days = (weekday - date.getUTCDay() + 7) % 7;
  return new Date(timestamp + days * DAY_MS);
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS);
}

/** La ventana en la que cae una jornada de clasificación. */
export function windowOfMatchday(matchday: number): NationalWindow {
  if (matchday <= 2) return 'november';
  if (matchday <= 4) return 'february';
  return 'summer';
}

/** El viernes de una ventana; el lunes siguiente es su segundo partido. */
function windowFriday(seasonStartYear: number, window: NationalWindow): Date {
  switch (window) {
    case 'november':
      return firstWeekdayOnOrAfter(Date.UTC(seasonStartYear, 10, 21), FRIDAY);
    case 'february':
      return firstWeekdayOnOrAfter(Date.UTC(seasonStartYear + 1, 1, 20), FRIDAY);
    default:
      return firstWeekdayOnOrAfter(Date.UTC(seasonStartYear + 1, 7, 1), FRIDAY);
  }
}

/** Fecha de una jornada de clasificación: viernes la impar, lunes la par. */
export function qualifierDate(seasonStartYear: number, matchday: number): Date {
  const friday = windowFriday(seasonStartYear, windowOfMatchday(matchday));
  return matchday % 2 === 1 ? friday : addDays(friday, 3);
}

/** Día en que se da la lista: diez antes del primer partido. */
export function callupDate(seasonStartYear: number, window: NationalWindow): Date {
  return addDays(windowFriday(seasonStartYear, window), -CALLUP_NOTICE_DAYS);
}

/**
 * Días con la selección: desde la víspera del primer partido hasta el último.
 * En verano llega hasta la final del Mundial, aunque para entonces los clubes
 * ya no juegan.
 */
export function dutyPeriod(
  seasonStartYear: number,
  window: NationalWindow
): { from: Date; to: Date } {
  const friday = windowFriday(seasonStartYear, window);
  const to =
    window === 'summer' ? worldCupDate(seasonStartYear, WORLD_CUP_FINAL) : addDays(friday, 3);
  return { from: addDays(friday, -1), to };
}

/**
 * Fecha de una ronda del Mundial: grupos martes, jueves y sábado; cuartos el
 * martes siguiente, semifinales el jueves y final el sábado.
 */
export function worldCupDate(seasonStartYear: number, round: number): Date {
  const start = firstWeekdayOnOrAfter(Date.UTC(seasonStartYear + 1, 7, 11), TUESDAY);
  const offsets = [0, 0, 2, 4, 7, 9, 11];
  return addDays(start, offsets[round] ?? 11);
}

export function worldCupRoundName(round: number): string {
  if (round <= 3) return `Grupos · jornada ${round}`;
  if (round === WORLD_CUP_QUARTERFINAL) return 'Cuartos de final';
  if (round === WORLD_CUP_SEMIFINAL) return 'Semifinales';
  return 'Final';
}

/** Lo que hace falta saber del club de un jugador para dejarle ir. */
export interface ClubReleaseInfo {
  /** País de la liga del club; nulo si no tiene club. */
  leagueCountry: string | null;
  /** El club juega una competición continental este curso. */
  playsContinental: boolean;
}

/**
 * Si el club suelta al jugador. En verano, siempre; en las ventanas de la
 * temporada, ni la liga americana ni los clubes con competición continental.
 */
export function releasedForWindow(window: NationalWindow, club: ClubReleaseInfo): boolean {
  if (window === 'summer') {
    return true;
  }
  return club.leagueCountry !== 'USA' && !club.playsContinental;
}

/** Lo que vale una selección: la media de sus doce mejores. */
export function nationStrength(overalls: readonly number[]): number {
  const best = [...overalls].sort((a, b) => b - a).slice(0, NATIONAL_SQUAD_SIZE);
  if (best.length === 0) {
    return 0;
  }
  return Math.round(best.reduce((sum, value) => sum + value, 0) / best.length);
}

/** Reputación de una selección (1-100) a partir de su fuerza. */
export function nationReputation(strength: number): number {
  return Math.min(100, Math.max(1, Math.round((strength - 50) * 2.2 + 40)));
}

/**
 * El anfitrión del Mundial de cada temporada: rota por orden de código, así
 * que todos organizan alguno y nunca dos veces seguidas.
 */
export function hostFor(codes: readonly string[], seasonNumber: number): string | null {
  const sorted = [...codes].sort();
  if (sorted.length === 0) {
    return null;
  }
  return sorted[(seasonNumber - 1) % sorted.length] as string;
}

/**
 * Los grupos de clasificación.
 *
 * Por bombos: las selecciones ordenadas por fuerza se reparten de cuatro en
 * cuatro y cada grupo saca una de cada bombo, así que no hay grupos de la
 * muerte ni grupos regalados. Las que no completan un grupo —las más flojas—
 * se quedan fuera, como en una fase previa.
 */
export function drawQualifierGroups(rankedCodes: readonly string[], rng: Rng): string[][] {
  const groupCount = Math.floor(rankedCodes.length / QUALIFIER_GROUP_SIZE);
  const groups: string[][] = Array.from({ length: groupCount }, () => []);

  for (let pot = 0; pot < QUALIFIER_GROUP_SIZE; pot += 1) {
    const members = rankedCodes.slice(pot * groupCount, (pot + 1) * groupCount);
    const shuffled = shuffle(members, rng);
    shuffled.forEach((code, index) => groups[index]?.push(code));
  }

  return groups;
}

/** Nombre de un grupo: A, B, C… */
export function groupName(index: number): string {
  return String.fromCharCode(65 + index);
}

/**
 * Los que van al Mundial: el anfitrión y los mejores de cada grupo hasta
 * completar dieciséis. Primero todos los primeros, luego los segundos, y así;
 * dentro de cada puesto, por orden de grupo.
 */
export function worldCupEntrants(
  host: string | null,
  groupStandings: readonly string[][]
): string[] {
  const entrants: string[] = host ? [host] : [];
  const deepest = groupStandings.reduce((max, group) => Math.max(max, group.length), 0);

  for (let position = 0; position < deepest && entrants.length < WORLD_CUP_TEAMS; position += 1) {
    for (const group of groupStandings) {
      const code = group[position];
      if (code && !entrants.includes(code) && entrants.length < WORLD_CUP_TEAMS) {
        entrants.push(code);
      }
    }
  }

  return entrants;
}

/** Los grupos del Mundial, también por bombos. */
export function drawWorldCupGroups(rankedEntrants: readonly string[], rng: Rng): string[][] {
  return drawQualifierGroups(rankedEntrants.slice(0, WORLD_CUP_GROUPS * 4), rng);
}

/** Cruces de cuartos: 1A-2B, 1B-2A, 1C-2D y 1D-2C. */
export function worldCupQuarterfinals(groupStandings: readonly string[][]): SeriesPairing[] {
  const order: [number, number][] = [
    [0, 1],
    [1, 0],
    [2, 3],
    [3, 2]
  ];
  return order.flatMap(([winnerGroup, runnerUpGroup]) => {
    const winner = groupStandings[winnerGroup]?.[0];
    const runnerUp = groupStandings[runnerUpGroup]?.[1];
    return winner && runnerUp
      ? [{ higherSeedTeamId: winner, higherSeed: 1, lowerSeedTeamId: runnerUp, lowerSeed: 2 }]
      : [];
  });
}

/** Un posible convocado. */
export interface SquadCandidate {
  id: string;
  position: Position;
  overall: number;
}

const POSITION_GROUP: Record<Position, 'guard' | 'forward' | 'center'> = {
  PG: 'guard',
  SG: 'guard',
  SF: 'forward',
  PF: 'forward',
  C: 'center'
};

/** Mínimos por demarcación en una lista de doce. */
const SQUAD_QUOTAS = { guard: 4, forward: 4, center: 2 } as const;

/**
 * La lista de un seleccionador que no es el usuario: los mejores, pero con
 * bases y pívots suficientes. Un doce de aleros es más fuerte en el papel y
 * peor en la pista.
 */
export function pickSquad(
  candidates: readonly SquadCandidate[],
  size = NATIONAL_SQUAD_SIZE
): string[] {
  const ranked = [...candidates].sort((a, b) => b.overall - a.overall || a.id.localeCompare(b.id));
  const chosen = new Set<string>();

  for (const [group, quota] of Object.entries(SQUAD_QUOTAS)) {
    ranked
      .filter((row) => POSITION_GROUP[row.position] === group)
      .slice(0, quota)
      .forEach((row) => chosen.add(row.id));
  }
  for (const row of ranked) {
    if (chosen.size >= size) {
      break;
    }
    chosen.add(row.id);
  }

  return ranked
    .filter((row) => chosen.has(row.id))
    .slice(0, size)
    .map((row) => row.id);
}

/** Lo que pide la federación, de menos a más. */
export const NATIONAL_OBJECTIVES = ['compete', 'qualify', 'quarterfinal', 'semifinal'] as const;
export type NationalObjective = (typeof NATIONAL_OBJECTIVES)[number];

export const NATIONAL_OBJECTIVE_LABELS: Record<NationalObjective, string> = {
  compete: 'Competir con dignidad',
  qualify: 'Clasificarse para el Mundial',
  quarterfinal: 'Llegar a cuartos del Mundial',
  semifinal: 'Pelear por las medallas'
};

/** El objetivo según el puesto de la selección en el mundo (1 = la mejor). */
export function objectiveForRank(rank: number): NationalObjective {
  if (rank <= 2) return 'semifinal';
  if (rank <= 6) return 'quarterfinal';
  if (rank <= 12) return 'qualify';
  return 'compete';
}

/** Hasta dónde llegó una selección en el curso. */
export const NATIONAL_OUTCOMES = [
  'notQualified',
  'groupStage',
  'quarterfinal',
  'semifinal',
  'final',
  'champion'
] as const;
export type NationalOutcome = (typeof NATIONAL_OUTCOMES)[number];

export const NATIONAL_OUTCOME_LABELS: Record<NationalOutcome, string> = {
  notQualified: 'No se clasificó',
  groupStage: 'Fase de grupos del Mundial',
  quarterfinal: 'Cuartos de final',
  semifinal: 'Semifinales',
  final: 'Subcampeón',
  champion: 'Campeón del mundo'
};

/** El resultado a partir de la ronda más alta jugada en el Mundial. */
export function outcomeFor(lastRound: number | null, champion: boolean): NationalOutcome {
  if (champion) return 'champion';
  if (lastRound === null) return 'notQualified';
  if (lastRound >= WORLD_CUP_FINAL) return 'final';
  if (lastRound >= WORLD_CUP_SEMIFINAL) return 'semifinal';
  if (lastRound >= WORLD_CUP_QUARTERFINAL) return 'quarterfinal';
  return 'groupStage';
}

const OBJECTIVE_LEVEL: Record<NationalObjective, number> = {
  compete: 0,
  qualify: 1,
  quarterfinal: 2,
  semifinal: 3
};

export type FederationVerdict = 'fulfilled' | 'warning' | 'dismissed';

export const FEDERATION_VERDICT_LABELS: Record<FederationVerdict, string> = {
  fulfilled: 'Objetivo cumplido',
  warning: 'Por debajo de lo pedido',
  dismissed: 'Destituido por la federación'
};

/**
 * Lo que decide la federación al acabar el Mundial. Quedarse un escalón por
 * debajo es un aviso; dos, la calle. Las federaciones son más pacientes que
 * los consejos: se juzga un verano, no cada partido.
 */
export function federationVerdict(
  objective: NationalObjective,
  outcome: NationalOutcome
): FederationVerdict {
  const gap = OBJECTIVE_LEVEL[objective] - NATIONAL_OUTCOMES.indexOf(outcome);
  if (gap <= 0) return 'fulfilled';
  if (gap === 1) return 'warning';
  return 'dismissed';
}

/**
 * Probabilidad de que una federación busque seleccionador tras el verano.
 * Casi segura si fracasó, poco probable si cumplió.
 */
export function nationalVacancyChance(verdict: FederationVerdict): number {
  if (verdict === 'dismissed') return 0.8;
  if (verdict === 'warning') return 0.35;
  return 0.08;
}

function shuffle<T>(items: readonly T[], rng: Rng): T[] {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const other = rng.int(0, index);
    [copy[index], copy[other]] = [copy[other] as T, copy[index] as T];
  }
  return copy;
}
