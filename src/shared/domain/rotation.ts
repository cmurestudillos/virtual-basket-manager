/**
 * Rotación: quién sale de inicio, en qué hueco y cuántos minutos le toca jugar.
 *
 * En baloncesto el reparto de minutos es la decisión de entrenador más pesada
 * que hay —lo era ya en PC Basket, con sus minutos por jugador— así que vive en
 * el dominio y no en una pantalla: la usan el sembrado de la partida, el editor
 * del usuario y el motor, y las tres tienen que entender lo mismo por rotación.
 */

import { overallForPosition, type PlayerAttributes } from './attributes';
import { POSITIONS, type Position } from './positions';

/** Jugadores en pista a la vez. */
export const LINEUP_SIZE = 5;

/**
 * Minutos que reparte un equipo en un partido reglamentario: cinco huecos
 * durante cuarenta minutos. Es la referencia contra la que se mide si una
 * rotación está cuadrada.
 */
export const REGULATION_TEAM_MINUTES = 200;

/** Tope de minutos que se le pueden pedir a un jugador (incluye prórrogas). */
export const MAX_TARGET_MINUTES = 48;

/**
 * Reparto por defecto según el puesto en la rotación, del titular más usado al
 * duodécimo. Suma 200 y da una rotación de nueve hombres con titulares en torno
 * a media hora, que es lo que se ve en una plantilla FIBA.
 */
export const DEFAULT_MINUTES_BY_DEPTH = [32, 30, 29, 28, 27, 16, 14, 12, 7, 3, 1, 1] as const;

/** Lo mínimo que hace falta saber de un jugador para colocarlo en la rotación. */
export interface RotationCandidate {
  id: string;
  position: Position;
  secondaryPosition: Position | null;
  attributes: PlayerAttributes;
}

export interface RotationEntry {
  playerId: string;
  /** Puesto en la rotación: 0-4 titulares, 5+ banquillo por orden. */
  depth: number;
  /** Hueco de pista que ocupa. */
  slotPosition: Position;
  /** Minutos objetivo por partido. */
  targetMinutes: number;
}

/**
 * Hueco de pista que corresponde a un puesto de la rotación.
 *
 * Los cinco primeros son el quinteto y ocupan los huecos 1 a 5 en orden; del
 * sexto en adelante cada uno figura en su posición natural, porque al entrar el
 * motor le asigna el hueco que deja libre el que sale.
 */
export function slotPositionForDepth(depth: number, natural: Position): Position {
  return depth < LINEUP_SIZE ? (POSITIONS[depth] as Position) : natural;
}

/**
 * Rotación automática: el mejor de cada posición sale de titular y el resto se
 * ordena por nivel.
 *
 * Es la que se siembra al crear la partida —también para los equipos de la IA,
 * que si no saldrían a la cancha sin cinco inicial— y la que devuelve el botón
 * de rotación automática del editor. Un único sitio, para que lo que propone el
 * juego sea exactamente lo que usa la máquina.
 */
export function buildAutomaticRotation(roster: readonly RotationCandidate[]): RotationEntry[] {
  const remaining = [...roster];
  const starters: RotationCandidate[] = [];

  for (const position of POSITIONS) {
    const best = bestFor(remaining, position);
    if (best) {
      starters.push(best);
      remaining.splice(remaining.indexOf(best), 1);
    }
  }

  const bench = remaining.sort(
    (a, b) =>
      overallForPosition(b.attributes, b.position) - overallForPosition(a.attributes, a.position)
  );

  return [...starters, ...bench].map((player, depth) => ({
    playerId: player.id,
    depth,
    slotPosition: slotPositionForDepth(depth, player.position),
    targetMinutes: DEFAULT_MINUTES_BY_DEPTH[depth] ?? 0
  }));
}

export function totalTargetMinutes(entries: readonly RotationEntry[]): number {
  return entries.reduce((total, entry) => total + entry.targetMinutes, 0);
}

/**
 * Mejor jugador disponible para un puesto del quinteto.
 *
 * Va por prioridades y no por una media común: primero los de esa posición
 * natural, después los que la tienen como segunda, y sólo si no queda nadie,
 * cualquiera. Mezclarlas en un mismo montón dejaba quintetos con dos pívots y
 * ningún alero, porque un escolta bueno con el alero como segunda posición le
 * ganaba el puesto al alero titular.
 */
function bestFor(
  candidates: readonly RotationCandidate[],
  position: Position
): RotationCandidate | null {
  const natural = candidates.filter((player) => player.position === position);
  const secondary = candidates.filter((player) => player.secondaryPosition === position);
  const pool = natural.length > 0 ? natural : secondary.length > 0 ? secondary : candidates;
  if (pool.length === 0) {
    return null;
  }

  return pool.reduce((best, candidate) =>
    overallForPosition(candidate.attributes, position) >
    overallForPosition(best.attributes, position)
      ? candidate
      : best
  );
}
