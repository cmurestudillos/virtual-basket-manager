/**
 * Un valor de 0 a 100 en estrellas: el potencial de un jugador, la reputación
 * de un club, de una selección o de un entrenador.
 *
 * Cada veinte puntos, una estrella, redondeando a la media más cercana: un 70
 * son tres y media, un 100 las cinco. Vive aquí y no repetido en cada pantalla
 * porque si la plantilla contara de una forma y el draft de otra, el mismo
 * jugador tendría distintas estrellas según dónde se mirara.
 */

/** Las estrellas que tiene la escala entera. */
export const STARS_MAX = 5;

export function toStars(value: number): number {
  if (!Number.isFinite(value)) return 0;
  const clamped = Math.max(0, Math.min(100, value));
  return Math.round((clamped / 100) * STARS_MAX * 2) / 2;
}
