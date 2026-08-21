import type { AttributeKey } from '@shared/domain/attributes';
import { outOfPositionPenalty, type Position } from '@shared/domain/positions';
import type { EnginePlayer } from './types';

/**
 * Valores derivados que consume el motor. Ninguno se guarda: se calculan a
 * partir de los atributos primitivos, la posición que el jugador está jugando
 * en ese momento y su frescura. Es la misma regla que en el motor de fútbol —
 * lo derivado no se persiste para que no pueda desincronizarse de su origen.
 */

/** Jugador en pista: quién es, en qué hueco juega y cómo llega de fresco. */
export interface OnCourtPlayer {
  player: EnginePlayer;
  /** Hueco que ocupa ahora mismo, que puede no ser su posición natural. */
  playedPosition: Position;
  /** Frescura actual 0-100; baja durante el partido. */
  freshness: number;
  /** Faltas personales cometidas. */
  fouls: number;
}

/**
 * Cuánto rinde un atributo concreto ahora mismo: valor base, corregido por
 * jugar fuera de posición y por el cansancio.
 *
 * El cansancio no anula al jugador, lo degrada: a 0 de frescura conserva el
 * 75% de su nivel, que es más o menos lo que se ve en un partido real cuando
 * alguien juega 38 minutos.
 */
export function effectiveAttribute(onCourt: OnCourtPlayer, key: AttributeKey): number {
  const base = onCourt.player.attributes[key];
  const positionFactor = outOfPositionPenalty(onCourt.player.position, onCourt.playedPosition);
  const fatigueFactor = 0.75 + (onCourt.freshness / 100) * 0.25;
  return base * positionFactor * fatigueFactor;
}

/** Media de un atributo entre los cinco de pista. */
export function lineupAverage(lineup: readonly OnCourtPlayer[], key: AttributeKey): number {
  if (lineup.length === 0) {
    return 50;
  }
  const total = lineup.reduce((sum, onCourt) => sum + effectiveAttribute(onCourt, key), 0);
  return total / lineup.length;
}

/**
 * Traduce una diferencia de nivel (atacante menos defensor, en escala 1-99) a
 * un multiplicador de probabilidad. Una diferencia de 20 puntos mueve el
 * acierto un ~12%, que es la magnitud que se observa entre un gran tirador y
 * uno malo sobre el mismo tiro.
 */
export function skillMultiplier(difference: number, sensitivity = 0.006): number {
  return 1 + difference * sensitivity;
}

/**
 * Peso de uso: la probabilidad relativa de que una posesión acabe en manos de
 * este jugador. Sale de su capacidad anotadora, no de su media global — un
 * pívot defensivo excelente no debe acaparar tiros.
 */
export function usageWeight(onCourt: OnCourtPlayer, isFocusPlayer: boolean): number {
  const scoring =
    effectiveAttribute(onCourt, 'close') * 0.3 +
    effectiveAttribute(onCourt, 'midRange') * 0.25 +
    effectiveAttribute(onCourt, 'threePoint') * 0.25 +
    effectiveAttribute(onCourt, 'driving') * 0.2;

  // Se eleva al cuadrado para separar de verdad a la estrella del último de la
  // rotación: con peso lineal todos los quintetos tiran casi lo mismo.
  const weight = Math.pow(Math.max(scoring, 1) / 50, 2);
  return isFocusPlayer ? weight * 1.45 : weight;
}

/** Peso para repartir un rebote entre los diez jugadores en pista. */
export function reboundWeight(onCourt: OnCourtPlayer, offensive: boolean): number {
  const key: AttributeKey = offensive ? 'offensiveRebound' : 'defensiveRebound';
  const positioning = effectiveAttribute(onCourt, key);
  const physical =
    effectiveAttribute(onCourt, 'jumping') * 0.5 + effectiveAttribute(onCourt, 'strength') * 0.5;
  return Math.max(1, positioning * 0.75 + physical * 0.25);
}
