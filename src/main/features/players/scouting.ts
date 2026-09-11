import type { PlayerSummary } from '@shared/contracts/players.contract';
import { ATTRIBUTE_KEYS, overallForPosition } from '@shared/domain/attributes';
import { NO_SCOUT_ERROR, scoutingError } from '@shared/domain/staff';
import { createRng, seedFromString } from '@shared/engine/basketball/rng';

/**
 * Cuánto te puedes fiar de lo que ves de un jugador.
 *
 * A los tuyos los conoces: cero margen. De los de fuera ves lo que te cuente tu
 * ojeador, y sin ojeador, muy poco. Es lo que impide jugar el mercado con una
 * calculadora y números exactos.
 */
export function scoutingErrorFor(scoutLevel: number, isOwnPlayer: boolean): number {
  if (isOwnPlayer) {
    return 0;
  }
  return scoutLevel > 0 ? scoutingError(scoutLevel) : NO_SCOUT_ERROR;
}

/**
 * Difumina la ficha con el margen del ojeador.
 *
 * El ruido sale de una semilla fija por jugador: si cambiara en cada lectura,
 * el mismo jugador bailaría de 70 a 78 cada vez que abres su ficha y la
 * incertidumbre dejaría de significar nada.
 */
export function scoutPlayer(player: PlayerSummary, error: number): PlayerSummary {
  if (error <= 0) {
    return player;
  }

  const rng = createRng(seedFromString(`${player.id}-ojeo`));
  const attributes = { ...player.attributes };
  for (const key of ATTRIBUTE_KEYS) {
    attributes[key] = clamp(attributes[key] + Math.round((rng.next() * 2 - 1) * error));
  }

  return {
    ...player,
    attributes,
    overall: overallForPosition(attributes, player.position),
    potential: clamp(player.potential + Math.round((rng.next() * 2 - 1) * error)),
    uncertainty: Math.round(error)
  };
}

function clamp(value: number): number {
  return Math.min(99, Math.max(1, value));
}
