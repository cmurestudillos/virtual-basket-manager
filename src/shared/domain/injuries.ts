/**
 * Lesiones: cuándo aparecen, de qué y por cuánto tiempo.
 *
 * La baja se cuenta en **días del calendario del juego**, no en partidos: una
 * rotura de tres semanas se lleva por delante tres jornadas de liga, pero en
 * playoffs, con partido cada tres días, son seis. Contarlo en partidos borraría
 * justo esa diferencia, que es la que hace que apretar en mayo salga caro.
 */

import type { Rng } from '@shared/engine/basketball/rng';

export interface InjuryTemplate {
  name: string;
  minDays: number;
  maxDays: number;
  /** Peso relativo: las leves son las que más pasan, como en la vida. */
  weight: number;
}

export interface Injury {
  name: string;
  days: number;
}

export const INJURY_TEMPLATES: readonly InjuryTemplate[] = [
  { name: 'Contusión', minDays: 2, maxDays: 5, weight: 26 },
  { name: 'Sobrecarga muscular', minDays: 4, maxDays: 9, weight: 24 },
  { name: 'Esguince de tobillo', minDays: 10, maxDays: 24, weight: 20 },
  { name: 'Tendinitis rotuliana', minDays: 12, maxDays: 26, weight: 12 },
  { name: 'Rotura fibrilar', minDays: 21, maxDays: 45, weight: 10 },
  { name: 'Fractura en la mano', minDays: 35, maxDays: 60, weight: 5 },
  { name: 'Lesión de rodilla', minDays: 70, maxDays: 150, weight: 3 }
];

/** Riesgo de un jugador fresco, joven y con minutos normales. */
export const BASE_GAME_INJURY_RISK = 0.012;
/** Riesgo semanal de entrenar a intensidad media. */
export const BASE_TRAINING_INJURY_RISK = 0.0025;
/** Ninguna combinación de factores pasa de aquí: una lesión sigue siendo mala suerte. */
export const MAX_INJURY_RISK = 0.25;

/**
 * Probabilidad de lesionarse en un partido.
 *
 * Tres cosas la mueven, y las tres son decisiones o consecuencias de decisiones
 * del entrenador: los minutos que le ha dado, cómo de fundido llegaba y la edad
 * del jugador. Un veterano cargado jugando 38 minutos multiplica por cinco el
 * riesgo de un titular joven y fresco.
 */
export function gameInjuryRisk(input: {
  minutesPlayed: number;
  condition: number;
  age: number;
  stamina: number;
}): number {
  if (input.minutesPlayed <= 0) {
    return 0;
  }

  const minutes = input.minutesPlayed / 24;
  const fatigue = 1 + ((100 - clamp(input.condition, 0, 100)) / 100) * 1.5;
  const stamina = 1.15 - (clamp(input.stamina, 1, 99) / 100) * 0.3;

  return Math.min(
    MAX_INJURY_RISK,
    BASE_GAME_INJURY_RISK * minutes * fatigue * stamina * ageRisk(input.age)
  );
}

/** Probabilidad de lesionarse en una semana de entrenamiento. */
export function trainingInjuryRisk(input: {
  intensity: number;
  condition: number;
  age: number;
}): number {
  const intensity = Math.pow(clamp(input.intensity, 1, 10) / 5, 1.6);
  const fatigue = 1 + ((100 - clamp(input.condition, 0, 100)) / 100) * 1.5;

  return Math.min(
    MAX_INJURY_RISK,
    BASE_TRAINING_INJURY_RISK * intensity * fatigue * ageRisk(input.age)
  );
}

/** A partir de los treinta, cada año cuesta. */
export function ageRisk(age: number): number {
  return 1 + Math.max(0, age - 29) * 0.09;
}

/**
 * Tira el dado. Devuelve `null` si no hay lesión, que es lo normal.
 *
 * El generador llega de fuera y viene sembrado del partido y del jugador: la
 * misma partida repetida se lesiona a la misma gente, igual que repite los
 * resultados.
 */
export function rollInjury(rng: Rng, risk: number): Injury | null {
  if (risk <= 0 || !rng.chance(risk)) {
    return null;
  }

  const template = rng.weighted(
    INJURY_TEMPLATES,
    INJURY_TEMPLATES.map((entry) => entry.weight)
  );

  return { name: template.name, days: rng.int(template.minDays, template.maxDays) };
}

/** «4 días», «3 semanas», «2 meses»: como lo diría un parte médico. */
export function injuryLabel(daysLeft: number): string {
  if (daysLeft <= 0) {
    return 'Disponible';
  }
  if (daysLeft < 7) {
    return `${daysLeft} ${daysLeft === 1 ? 'día' : 'días'}`;
  }
  if (daysLeft < 60) {
    const weeks = Math.round(daysLeft / 7);
    return `${weeks} ${weeks === 1 ? 'semana' : 'semanas'}`;
  }

  const months = Math.round(daysLeft / 30);
  return `${months} ${months === 1 ? 'mes' : 'meses'}`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
