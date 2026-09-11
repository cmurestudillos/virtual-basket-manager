/**
 * Entrenamiento semanal.
 *
 * El foco decide **qué** se entrena y la intensidad **cuánto**: la primera
 * mueve atributos concretos, la segunda acelera la mejora a cambio de forma
 * física y de riesgo de lesión. Es la palanca que tenía PC Basket y la razón de
 * que una plantilla joven valga más que una hecha: aquí es donde crece.
 *
 * Función pura y determinista: el generador llega de fuera.
 */

import { overallForPosition, type AttributeKey, type PlayerAttributes } from './attributes';
import type { Position } from './positions';
import type { Rng } from '@shared/engine/basketball/rng';

export const TRAINING_FOCUSES = [
  'balanced',
  'shooting',
  'inside',
  'defense',
  'playmaking',
  'physical',
  'recovery'
] as const;

export type TrainingFocus = (typeof TRAINING_FOCUSES)[number];

export const TRAINING_FOCUS_LABELS: Record<TrainingFocus, string> = {
  balanced: 'General',
  shooting: 'Tiro exterior',
  inside: 'Juego interior',
  defense: 'Defensa',
  playmaking: 'Dirección y pase',
  physical: 'Físico',
  recovery: 'Recuperación'
};

export const TRAINING_FOCUS_HINTS: Record<TrainingFocus, string> = {
  balanced: 'Un poco de todo; mejora más lento en cada cosa',
  shooting: 'Triple, media distancia y tiros libres',
  inside: 'Tiro cercano, finalización y rebote ofensivo',
  defense: 'Defensa exterior e interior, robo, tapón y rebote',
  playmaking: 'Pase, manejo, penetración y lectura de juego',
  physical: 'Velocidad, fuerza, salto y resistencia',
  recovery: 'No mejora a nadie: recupera forma y baja el riesgo de lesión'
};

/** Con lo que arranca cualquier equipo mientras nadie toque la pizarra de entrenamiento. */
export const DEFAULT_TRAINING_INTENSITY = 5;
export const DEFAULT_TRAINING_FOCUS: TrainingFocus = 'balanced';

/** Qué atributos toca cada foco. `recovery` no toca ninguno a propósito. */
export const TRAINING_FOCUS_ATTRIBUTES: Record<TrainingFocus, readonly AttributeKey[]> = {
  balanced: [
    'close',
    'midRange',
    'threePoint',
    'passing',
    'handling',
    'perimeterDefense',
    'interiorDefense',
    'defensiveRebound',
    'speed',
    'strength',
    'basketballIQ'
  ],
  shooting: ['threePoint', 'midRange', 'freeThrow', 'close'],
  inside: ['close', 'finishing', 'offensiveRebound', 'strength', 'interiorDefense'],
  defense: ['perimeterDefense', 'interiorDefense', 'steal', 'block', 'defensiveRebound'],
  playmaking: ['passing', 'handling', 'driving', 'basketballIQ'],
  physical: ['speed', 'strength', 'jumping', 'stamina'],
  recovery: []
};

/** Atributos que se caen con la edad: los que dependen del cuerpo, no de la cabeza. */
const DECLINING_ATTRIBUTES: readonly AttributeKey[] = ['speed', 'jumping', 'stamina', 'driving'];

export const MIN_ATTRIBUTE = 1;
export const MAX_ATTRIBUTE = 99;

/**
 * Cuánto margen de mejora da la edad.
 *
 * Un chaval de veinte mejora casi tres veces más rápido que uno de veintisiete,
 * y a partir de los treinta y uno ya no se entrena para crecer: se entrena para
 * aguantar. Es la curva que hace que fichar jóvenes tenga sentido.
 */
export function developmentAgeFactor(age: number): number {
  if (age <= 21) return 1.3;
  if (age <= 24) return 1;
  if (age <= 27) return 0.6;
  if (age <= 30) return 0.25;
  return 0;
}

/** Probabilidad semanal de perder un punto físico por edad. 0 antes de los 31. */
export function declineChance(age: number): number {
  return Math.max(0, age - 30) * 0.02;
}

export interface AttributeChange {
  key: AttributeKey;
  /** +1 o −1: el entrenamiento mueve los atributos de uno en uno. */
  delta: number;
}

export interface TrainingSessionInput {
  attributes: PlayerAttributes;
  position: Position;
  potential: number;
  age: number;
  focus: TrainingFocus;
  /** 1-10. */
  intensity: number;
  /** Lo que aporta el entrenador ayudante: 1 si no hay ninguno. */
  staffBoost?: number;
  rng: Rng;
}

/**
 * Una semana de entrenamiento de un jugador.
 *
 * Devuelve los cambios, no los atributos ya aplicados, para que quien llame
 * pueda enseñarlos («ha subido el triple») además de guardarlos.
 *
 * El techo manda: cuanto más cerca está el jugador de su potencial, menos sube,
 * y al llegar deja de crecer. Sin eso, diez temporadas de entrenamiento
 * convertirían a toda la liga en jugadores de 99.
 */
export function trainWeek(input: TrainingSessionInput): AttributeChange[] {
  const changes: AttributeChange[] = [];
  const ageFactor = developmentAgeFactor(input.age);
  const intensity = clamp(input.intensity, 1, 10) / 5;

  if (ageFactor > 0) {
    const overall = overallForPosition(input.attributes, input.position);
    // Veinte puntos de margen es crecer a pleno rendimiento; pegado al techo,
    // casi nada.
    const headroom = clamp((input.potential - overall) / 20, 0, 1);

    for (const key of TRAINING_FOCUS_ATTRIBUTES[input.focus]) {
      if (input.attributes[key] >= MAX_ATTRIBUTE) {
        continue;
      }
      if (input.rng.chance(0.1 * ageFactor * intensity * headroom * (input.staffBoost ?? 1))) {
        changes.push({ key, delta: 1 });
      }
    }
  }

  const decline = declineChance(input.age);
  if (decline > 0) {
    for (const key of DECLINING_ATTRIBUTES) {
      if (input.attributes[key] > MIN_ATTRIBUTE && input.rng.chance(decline)) {
        changes.push({ key, delta: -1 });
      }
    }
  }

  return changes;
}

/** Aplica los cambios a un juego de atributos, respetando la escala 1-99. */
export function applyChanges(
  attributes: PlayerAttributes,
  changes: readonly AttributeChange[]
): PlayerAttributes {
  const next = { ...attributes };

  for (const change of changes) {
    next[change.key] = clamp(next[change.key] + change.delta, MIN_ATTRIBUTE, MAX_ATTRIBUTE);
  }

  return next;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
