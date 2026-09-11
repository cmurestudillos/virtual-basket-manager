/**
 * La cantera.
 *
 * Un juvenil es un jugador más de la base de datos, marcado como cantera: no se
 * viste, no entra en la rotación y no aparece en el acta hasta que se le
 * promociona. Así no hay dos clases de jugador conviviendo en el código, que es
 * el error que convierte la cantera en un módulo aparte que nadie mantiene.
 *
 * Lo que decide la cantera no es el azar puro: son las **instalaciones**, que
 * cuestan dinero y deciden cuántos salen y con qué techo. Es la otra pata de la
 * planificación a largo plazo, junto al entrenamiento.
 *
 * Funciones puras: el generador llega de fuera.
 */

import { POSITIONS, type Position } from './positions';
import { ATTRIBUTE_KEYS, type PlayerAttributes } from './attributes';
import type { Rng } from '@shared/engine/basketball/rng';

export const YOUTH_MIN_AGE = 16;
export const YOUTH_MAX_AGE = 18;

/** Tope de juveniles en la cantera: por encima, los mayores se van. */
export const MAX_YOUTH_PLAYERS = 10;

/** Plantilla máxima del primer equipo; promocionar exige hueco. */
export const MAX_ROSTER = 14;

export const MIN_YOUTH_LEVEL = 1;
export const MAX_YOUTH_LEVEL = 5;

export const YOUTH_LEVEL_LABELS: Record<number, string> = {
  1: 'Modesta',
  2: 'Correcta',
  3: 'Buena',
  4: 'Muy buena',
  5: 'De referencia'
};

export function youthLevelLabel(level: number): string {
  return YOUTH_LEVEL_LABELS[clampLevel(level)] as string;
}

/** Lo que cuesta subir la cantera un nivel. Cada escalón cuesta más que el anterior. */
export function youthUpgradeCostCents(currentLevel: number): number {
  return clampLevel(currentLevel) * 600_000_00;
}

/** Mantenimiento anual de la cantera, que se paga aunque no salga nadie. */
export function youthUpkeepCents(level: number): number {
  return clampLevel(level) * 90_000_00;
}

/** Cuántos juveniles entran cada verano. */
export function intakeSize(level: number, rng: Rng): number {
  const base = clampLevel(level);
  return Math.max(1, rng.int(base - 1, base + 1));
}

export interface YouthProspect {
  age: number;
  position: Position;
  secondaryPosition: Position | null;
  attributes: PlayerAttributes;
  potential: number;
  heightCm: number;
}

/**
 * Un juvenil recién salido de la cantera.
 *
 * Sale flojo y con techo: la gracia no es lo que vale hoy —siempre es peor que
 * el último de la plantilla— sino lo que puede llegar a valer si se le entrena
 * y se le dan minutos. Una cantera de nivel 5 no saca mejores jugadores hoy,
 * saca más y con más techo.
 */
export function generateProspect(level: number, rng: Rng): YouthProspect {
  const facilities = clampLevel(level);
  const position = POSITIONS[rng.int(0, POSITIONS.length - 1)] as Position;
  const base = rng.int(28, 40) + facilities * 2;

  const attributes = {} as PlayerAttributes;
  for (const key of ATTRIBUTE_KEYS) {
    attributes[key] = clamp(base + rng.int(-6, 6), 15, 70);
  }

  return {
    age: rng.int(YOUTH_MIN_AGE, YOUTH_MAX_AGE),
    position,
    secondaryPosition: rng.chance(0.4)
      ? (POSITIONS[rng.int(0, POSITIONS.length - 1)] as Position)
      : null,
    attributes,
    // El techo es lo que de verdad reparte la cantera: de 55 en una modesta a
    // un posible 90 en una de referencia.
    potential: clamp(base + rng.int(8, 22) + facilities * 4, 45, 92),
    heightCm: heightFor(position, rng)
  };
}

/** Hueco en el primer equipo para subir a alguien. */
export function canPromote(rosterSize: number): boolean {
  return rosterSize < MAX_ROSTER;
}

/** A los diecinueve ya no es juvenil: o sube o se va. */
export function agedOut(age: number): boolean {
  return age > YOUTH_MAX_AGE;
}

function heightFor(position: Position, rng: Rng): number {
  const mean: Record<Position, number> = { PG: 186, SG: 193, SF: 199, PF: 204, C: 209 };
  return Math.round((mean[position] as number) + rng.int(-5, 5));
}

function clampLevel(level: number): number {
  return Math.min(MAX_YOUTH_LEVEL, Math.max(MIN_YOUTH_LEVEL, Math.round(level)));
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
