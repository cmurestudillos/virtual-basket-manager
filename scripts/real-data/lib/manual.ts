import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { birthPlaceOf } from '../sources/feb-parse';
import { PROJECT_ROOT } from './http';
import { nationFromBirthPlace } from './nationalities';
import { toIsoDate } from './normalize';
import type { SourceCoach } from './source-types';

/**
 * Los datos puestos a mano, en `resources/real-data/manual/` (fuera de git:
 * son personas reales). Cada extractor sabe qué fichero lee; aquí sólo cómo.
 */

export const MANUAL_DIR = join(PROJECT_ROOT, 'resources', 'real-data', 'manual');

/** Lee un fichero a mano; si no existe, lo vacío que se diga (y el extractor avisa de lo que falte). */
export function loadManualJson<T extends object>(file: string, empty: T): T {
  const path = join(MANUAL_DIR, file);
  if (!existsSync(path)) return empty;
  return { ...empty, ...(JSON.parse(readFileSync(path, 'utf8')) as Partial<T>) };
}

/** Un entrenador escrito a mano: nombre de uso y nacimiento como la FEB («dd/mm/aaaa Ciudad (País)»). */
export interface ManualCoach {
  firstName: string;
  lastName: string;
  /** «dd/mm/aaaa Ciudad (País)»; el país entre paréntesis da la nacionalidad. */
  birth?: string;
  /** Sin fecha exacta: la edad el día de la extracción (regla del 1 de julio). */
  age?: number;
  /** Si el lugar no la dice (o no se sabe dónde nació): código COI. */
  nationality?: string;
}

/** El {@link SourceCoach} de un entrenador puesto a mano. */
export function coachFromManual(manual: ManualCoach, sourceId: string): SourceCoach {
  const place = birthPlaceOf(manual.birth ?? null);
  return {
    sourceId,
    firstName: manual.firstName,
    lastName: manual.lastName,
    birthDate: toIsoDate(manual.birth ?? null),
    age: manual.birth ? null : (manual.age ?? null),
    nationality: manual.nationality ?? nationFromBirthPlace(place),
    nationalityRaw: place ?? manual.nationality ?? null
  };
}
