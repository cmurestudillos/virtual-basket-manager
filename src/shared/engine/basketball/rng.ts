/**
 * Generador pseudoaleatorio determinista (mulberry32).
 *
 * El motor NUNCA llama a `Math.random()`: recibe una semilla y todo lo que
 * ocurre en un partido se deriva de ella. Así el mismo partido simulado dos
 * veces da exactamente el mismo resultado, que es lo que permite testear el
 * motor de verdad y lo que hace posible "ver" en directo un partido ya
 * resuelto sin que el marcador cambie por el camino.
 */
export interface Rng {
  /** Flotante en [0, 1). */
  next(): number;
  /** Entero en [min, max], ambos incluidos. */
  int(min: number, max: number): number;
  /** `true` con probabilidad `probability` (0-1). */
  chance(probability: number): boolean;
  /** Elige un elemento según pesos; los pesos no necesitan sumar 1. */
  weighted<T>(items: readonly T[], weights: readonly number[]): T;
}

export function createRng(seed: number): Rng {
  let state = seed >>> 0;

  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const int = (min: number, max: number): number => min + Math.floor(next() * (max - min + 1));

  const chance = (probability: number): boolean => next() < probability;

  const weighted = <T>(items: readonly T[], weights: readonly number[]): T => {
    const total = weights.reduce((sum, weight) => sum + Math.max(0, weight), 0);
    if (items.length === 0) {
      throw new Error('weighted() necesita al menos un elemento');
    }
    if (total <= 0) {
      // Sin pesos válidos, reparto uniforme: preferible a devolver siempre el
      // primero, que sesgaría en silencio (p. ej. plantilla entera lesionada).
      return items[int(0, items.length - 1)] as T;
    }

    let roll = next() * total;
    for (let index = 0; index < items.length; index += 1) {
      roll -= Math.max(0, weights[index] ?? 0);
      if (roll <= 0) {
        return items[index] as T;
      }
    }
    return items[items.length - 1] as T;
  };

  return { next, int, chance, weighted };
}

/**
 * Semilla estable a partir de una cadena (por ejemplo el id del partido), para
 * que un partido concreto se simule siempre igual sin tener que guardar la
 * semilla aparte.
 */
export function seedFromString(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}
