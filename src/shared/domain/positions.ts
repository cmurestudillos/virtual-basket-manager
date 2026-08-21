/**
 * Posiciones de baloncesto, numeradas como se numeran en la pizarra (1 a 5).
 *
 * A diferencia del fútbol, aquí el número de posición no es sólo una etiqueta:
 * el motor lo usa para repartir posesiones, rebotes y tapones, y las reglas de
 * alineación exigen exactamente cinco jugadores en pista, uno por hueco lógico
 * (aunque un quinteto pueda ser "pequeño" o "alto" y desplazar a alguien de su
 * posición natural).
 */
export const POSITIONS = ['PG', 'SG', 'SF', 'PF', 'C'] as const;

export type Position = (typeof POSITIONS)[number];

/** Etiquetas en castellano, como en PC Basket. */
export const POSITION_LABELS: Record<Position, string> = {
  PG: 'Base',
  SG: 'Escolta',
  SF: 'Alero',
  PF: 'Ala-pívot',
  C: 'Pívot'
};

/** Número clásico de la posición (1-5), el que se usa al hablar de quintetos. */
export const POSITION_NUMBERS: Record<Position, 1 | 2 | 3 | 4 | 5> = {
  PG: 1,
  SG: 2,
  SF: 3,
  PF: 4,
  C: 5
};

/**
 * Reparto grueso perímetro/interior. El motor lo usa para decidir qué tipo de
 * tiro genera cada posesión y quién pelea el rebote: un `PG` casi nunca captura
 * un rebote ofensivo, un `C` casi nunca lanza un triple.
 */
export const PERIMETER_POSITIONS: readonly Position[] = ['PG', 'SG', 'SF'];
export const INTERIOR_POSITIONS: readonly Position[] = ['PF', 'C'];

export function isPerimeter(position: Position): boolean {
  return PERIMETER_POSITIONS.includes(position);
}

/**
 * Distancia entre dos posiciones en la escala 1-5. Un jugador puede jugar
 * "fuera de sitio" con penalización proporcional a esta distancia: un escolta
 * de alero rinde casi igual (distancia 1), de pívot no (distancia 3).
 */
export function positionDistance(a: Position, b: Position): number {
  return Math.abs(POSITION_NUMBERS[a] - POSITION_NUMBERS[b]);
}

/**
 * Multiplicador de rendimiento por jugar fuera de la posición natural.
 * Deliberadamente suave en distancia 1 (los quintetos modernos mueven a todo el
 * mundo un puesto) y severo a partir de 2.
 */
export function outOfPositionPenalty(natural: Position, played: Position): number {
  const penaltyByDistance = [1, 0.96, 0.88, 0.78, 0.68];
  return penaltyByDistance[positionDistance(natural, played)] ?? 0.68;
}
