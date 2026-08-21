import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { closeSaveDatabase } from './save-database';

/**
 * Alta y baja del fichero físico de una partida. Sin imports de `electron`, por
 * la misma razón que `save-database.ts`: así se puede probar sin arrancar la
 * aplicación.
 */

/** Nombre de fichero seguro a partir del nombre que escribe el usuario. */
export function toSaveFileName(name: string, id: string): string {
  const slug = name
    .normalize('NFD')
    // Quita los diacríticos que `NFD` acaba de separar, para que "Peñíscola"
    // no termine convertida en "pe-scola".
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);

  // El id va siempre al final: dos partidas pueden llamarse igual, y el nombre
  // podría quedarse vacío entero si el usuario escribe sólo signos.
  return `${slug || 'partida'}-${id}.sqlite`;
}

/** Crea la carpeta de partidas si falta y devuelve la ruta del fichero. */
export function prepareSaveFilePath(directory: string, fileName: string): string {
  mkdirSync(directory, { recursive: true });
  return join(directory, fileName);
}

/**
 * Borra el fichero de una partida. Cierra antes la conexión: en Windows no se
 * puede borrar un fichero que sigue abierto, y el borrado fallaría dejando la
 * partida fuera del listado pero viva en disco.
 */
export function deleteSaveFile(filePath: string): void {
  closeSaveDatabase(filePath);
  if (existsSync(filePath)) {
    rmSync(filePath, { force: true });
  }
}
