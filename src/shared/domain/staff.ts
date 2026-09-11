/**
 * El cuerpo técnico.
 *
 * Cinco puestos, cada uno con un efecto que se nota en algo que el usuario ya
 * mira: el ayudante en cuánto mejora la plantilla, el preparador en cómo llega
 * al partido siguiente, el médico en cuántas semanas pierdes a un lesionado, el
 * ojeador en cuánto te puedes fiar de la ficha de un rival y el analista en lo
 * que ves del contrario antes de jugar.
 *
 * Si un puesto no cambia nada medible, sobra. Por eso son cinco y no doce.
 *
 * Funciones puras: ni base de datos ni azar.
 */

export type StaffRole = 'assistant' | 'fitness' | 'physio' | 'analyst' | 'scout';

export const STAFF_ROLES = [
  'assistant',
  'fitness',
  'physio',
  'analyst',
  'scout'
] as const satisfies readonly StaffRole[];

export const STAFF_ROLE_LABELS: Record<StaffRole, string> = {
  assistant: 'Entrenador ayudante',
  fitness: 'Preparador físico',
  physio: 'Médico',
  analyst: 'Analista',
  scout: 'Ojeador'
};

export const STAFF_ROLE_HINTS: Record<StaffRole, string> = {
  assistant: 'La plantilla progresa más rápido con lo que entrena',
  fitness: 'Se recupera antes entre partidos y se llega menos fundido',
  physio: 'Las lesiones duran menos y se producen algo menos',
  analyst: 'Enseña la pizarra y el quinteto del rival en la previa',
  scout: 'Afina lo que ves de los jugadores de otros clubes'
};

export const MIN_STAFF_LEVEL = 1;
export const MAX_STAFF_LEVEL = 5;

export const STAFF_LEVEL_LABELS: Record<number, string> = {
  1: 'Aprendiz',
  2: 'Competente',
  3: 'Bueno',
  4: 'Muy bueno',
  5: 'Eminencia'
};

export function staffLevelLabel(level: number): string {
  return STAFF_LEVEL_LABELS[clampLevel(level)] as string;
}

/**
 * Ficha anual de un técnico.
 *
 * Crece al cuadrado con el nivel: una eminencia cuesta veinticinco veces lo que
 * un aprendiz, que es lo que obliga a elegir en qué puesto merece la pena
 * gastar en vez de contratar a cinco cracks.
 */
export function staffWageCents(level: number): number {
  return clampLevel(level) * clampLevel(level) * 5_000_00;
}

/** Cuánto acelera el ayudante el entrenamiento: de +8 % a +40 %. */
export function trainingBoost(level: number): number {
  return 1 + clampLevel(level) * 0.08;
}

/** Cuánto acelera el preparador la recuperación diaria. */
export function recoveryBoost(level: number): number {
  return 1 + clampLevel(level) * 0.07;
}

/** Cuánto desgaste de partido ahorra el preparador: hasta un 20 %. */
export function wearFactor(level: number): number {
  return 1 - clampLevel(level) * 0.04;
}

/** Cuánto acorta el médico una baja: hasta un 35 %. */
export function injuryDurationFactor(level: number): number {
  return 1 - clampLevel(level) * 0.07;
}

/** Y cuánto rebaja el riesgo de romperse. */
export function injuryRiskFactor(level: number): number {
  return 1 - clampLevel(level) * 0.04;
}

/**
 * Margen de error con el que ves a un jugador que no es tuyo.
 *
 * Sin ojeador, un ±12 en cada atributo: sabes si es bueno, no cuánto. Con una
 * eminencia, ±2. Es la incertidumbre que hace que ojear sirva para algo — y la
 * que evita que el mercado se juegue mirando números exactos.
 */
export function scoutingError(level: number): number {
  return Math.max(2, 14 - clampLevel(level) * 2.4);
}

/** Error de quien no tiene ojeador contratado. */
export const NO_SCOUT_ERROR = 14;

/** A partir de competente, el analista ya te enseña al rival. */
export function analystRevealsRival(level: number): boolean {
  return clampLevel(level) >= 2;
}

/** Nivel con el que un club se encuentra a su cuerpo técnico al empezar. */
export function staffLevelForReputation(reputation: number): number {
  if (reputation >= 80) return 4;
  if (reputation >= 65) return 3;
  if (reputation >= 45) return 2;
  return 1;
}

function clampLevel(level: number): number {
  return Math.min(MAX_STAFF_LEVEL, Math.max(MIN_STAFF_LEVEL, Math.round(level)));
}
