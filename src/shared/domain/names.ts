/**
 * Nombres del juego.
 *
 * Están aquí y no en el generador del dataset porque el juego sigue inventando
 * gente después de empezar: juveniles cada verano y técnicos en el mercado. Con
 * una sola lista, un chaval que sale de la cantera en 2031 se llama como los que
 * venían de fábrica, que es justo lo que hace que el mundo parezca uno solo.
 *
 * Todos inventados a propósito, como el resto del dataset.
 */

import type { Rng } from '@shared/engine/basketball/rng';

export const FIRST_NAMES = [
  'Álvaro',
  'Íñigo',
  'Rubén',
  'Sergi',
  'Mateo',
  'Nicolás',
  'Adrián',
  'Óscar',
  'Bruno',
  'Guillem',
  'Héctor',
  'Pau',
  'Marcos',
  'Ignacio',
  'Diego',
  'Aitor',
  'Jonás',
  'Emilio',
  'Rodrigo',
  'Kilian',
  'Darius',
  'Milan',
  'Tomas',
  'Andrei',
  'Ousmane',
  'Dwayne',
  'Marcus',
  'Trevor',
  'Kendrick',
  'Lamar'
] as const;

export const LAST_NAMES = [
  'Arroyo',
  'Bermúdez',
  'Cifuentes',
  'Delgado',
  'Escobar',
  'Fuentes',
  'Gallardo',
  'Herrera',
  'Iriarte',
  'Jáuregui',
  'Lorenzo',
  'Maldonado',
  'Nogales',
  'Olmedo',
  'Peñarroya',
  'Quesada',
  'Robledo',
  'Salgado',
  'Terrazas',
  'Ugarte',
  'Vidal',
  'Zabala',
  'Novak',
  'Petrovic',
  'Vasiliev',
  'Kowalski',
  'Diallo',
  'Okafor',
  'Brooks',
  'Whitaker'
] as const;

/** Un nombre completo. Determinista: mismo generador, mismo nombre. */
export function randomName(rng: Rng): { firstName: string; lastName: string } {
  return {
    firstName: FIRST_NAMES[rng.int(0, FIRST_NAMES.length - 1)] as string,
    lastName: LAST_NAMES[rng.int(0, LAST_NAMES.length - 1)] as string
  };
}
