import type { Position } from './positions';

/**
 * Atributos de un jugador, en escala 1-99.
 *
 * El conjunto sale de cruzar los dos referentes: PC Basket 6.5 trabajaba con
 * media docena de valores muy legibles (tiro exterior, tiro interior, rebote,
 * pase, defensa, físico), e International Basketball Manager desglosaba
 * veintitantas habilidades por grupos. Aquí se queda en 21 atributos agrupados
 * en cuatro familias: suficientes para que el motor distinga un tirador de un
 * finalizador, y pocos como para que una ficha quepa en una pantalla.
 *
 * Regla del proyecto (heredada del motor de fútbol): los atributos que se
 * guardan son los *primitivos*. Todo lo que el motor necesita por encima de
 * esto (valoración ofensiva, defensiva, rebote...) es derivado y se calcula,
 * nunca se persiste, para que no puedan desincronizarse.
 */
export interface PlayerAttributes {
  // --- Tiro ---
  /** Tiro cerca del aro: bandejas, ganchos, continuaciones. */
  close: number;
  /** Tiro de media distancia, dentro del 6,75. */
  midRange: number;
  /** Triple. */
  threePoint: number;
  /** Tiros libres. */
  freeThrow: number;
  /** Capacidad de terminar por encima del aro y de aguantar el contacto. */
  finishing: number;

  // --- Manejo y creación ---
  /** Pase: calidad y decisión del último pase. */
  passing: number;
  /** Bote y manejo bajo presión; alimenta las pérdidas. */
  handling: number;
  /** Penetración: capacidad de romper al primer defensor. */
  driving: number;

  // --- Defensa y rebote ---
  perimeterDefense: number;
  interiorDefense: number;
  steal: number;
  block: number;
  offensiveRebound: number;
  defensiveRebound: number;

  // --- Físico ---
  speed: number;
  strength: number;
  jumping: number;
  stamina: number;

  // --- Mental ---
  /** Lectura de juego: elección de tiro, rotaciones defensivas. */
  basketballIQ: number;
  /** Regularidad: cuánto oscila su rendimiento de partido a partido. */
  consistency: number;
  /** Agresividad: sube robos y tapones, y también las faltas personales. */
  aggression: number;
}

export const ATTRIBUTE_KEYS = [
  'close',
  'midRange',
  'threePoint',
  'freeThrow',
  'finishing',
  'passing',
  'handling',
  'driving',
  'perimeterDefense',
  'interiorDefense',
  'steal',
  'block',
  'offensiveRebound',
  'defensiveRebound',
  'speed',
  'strength',
  'jumping',
  'stamina',
  'basketballIQ',
  'consistency',
  'aggression'
] as const satisfies readonly (keyof PlayerAttributes)[];

export type AttributeKey = (typeof ATTRIBUTE_KEYS)[number];

export const ATTRIBUTE_GROUPS = {
  tiro: ['close', 'midRange', 'threePoint', 'freeThrow', 'finishing'],
  creacion: ['passing', 'handling', 'driving'],
  defensa: ['perimeterDefense', 'interiorDefense', 'steal', 'block'],
  rebote: ['offensiveRebound', 'defensiveRebound'],
  fisico: ['speed', 'strength', 'jumping', 'stamina'],
  mental: ['basketballIQ', 'consistency', 'aggression']
} as const satisfies Record<string, readonly AttributeKey[]>;

export const ATTRIBUTE_LABELS: Record<AttributeKey, string> = {
  close: 'Tiro cercano',
  midRange: 'Media distancia',
  threePoint: 'Triple',
  freeThrow: 'Tiros libres',
  finishing: 'Finalización',
  passing: 'Pase',
  handling: 'Manejo',
  driving: 'Penetración',
  perimeterDefense: 'Defensa exterior',
  interiorDefense: 'Defensa interior',
  steal: 'Robo',
  block: 'Tapón',
  offensiveRebound: 'Rebote ofensivo',
  defensiveRebound: 'Rebote defensivo',
  speed: 'Velocidad',
  strength: 'Fuerza',
  jumping: 'Salto',
  stamina: 'Resistencia',
  basketballIQ: 'Visión de juego',
  consistency: 'Regularidad',
  aggression: 'Agresividad'
};

/**
 * Peso de cada atributo en la media (`overall`) según la posición.
 *
 * Es lo que evita el problema clásico de una media única: un pívot con 30 de
 * triple no es peor jugador por ello, y un base con 30 de rebote defensivo
 * tampoco. Sólo aparecen los atributos con peso distinto de cero; el resto
 * cuenta con el peso base de {@link BASELINE_WEIGHT}.
 */
const BASELINE_WEIGHT = 0.4;

const POSITION_WEIGHTS: Record<Position, Partial<Record<AttributeKey, number>>> = {
  PG: {
    passing: 3,
    handling: 3,
    basketballIQ: 2.5,
    driving: 2,
    threePoint: 2,
    midRange: 1.5,
    speed: 1.5,
    perimeterDefense: 1.5,
    steal: 1
  },
  SG: {
    threePoint: 3,
    midRange: 2.5,
    driving: 2,
    handling: 2,
    perimeterDefense: 2,
    speed: 1.5,
    close: 1,
    passing: 1
  },
  SF: {
    threePoint: 2.5,
    driving: 2.5,
    close: 2,
    perimeterDefense: 2,
    defensiveRebound: 1.5,
    speed: 1.5,
    strength: 1,
    finishing: 1.5
  },
  PF: {
    close: 3,
    finishing: 2.5,
    defensiveRebound: 2.5,
    offensiveRebound: 2,
    interiorDefense: 2,
    strength: 2,
    block: 1.5,
    midRange: 1
  },
  C: {
    close: 3,
    finishing: 2.5,
    defensiveRebound: 3,
    offensiveRebound: 2.5,
    interiorDefense: 3,
    block: 2.5,
    strength: 2,
    jumping: 1.5
  }
};

/**
 * Media del jugador (1-99) ponderada por la posición en la que juega.
 * Función pura y determinista: nunca se guarda en base de datos.
 */
export function overallForPosition(attributes: PlayerAttributes, position: Position): number {
  const weights = POSITION_WEIGHTS[position];
  let weightedSum = 0;
  let totalWeight = 0;

  for (const key of ATTRIBUTE_KEYS) {
    const weight = weights[key] ?? BASELINE_WEIGHT;
    weightedSum += attributes[key] * weight;
    totalWeight += weight;
  }

  return Math.round(weightedSum / totalWeight);
}

/** Crea un juego de atributos con el mismo valor en todos: útil en tests y seeds. */
export function uniformAttributes(value: number): PlayerAttributes {
  return Object.fromEntries(
    ATTRIBUTE_KEYS.map((key) => [key, value])
  ) as unknown as PlayerAttributes;
}
