import { app } from 'electron';
import { is } from '@electron-toolkit/utils';
import { join } from 'node:path';
import { currentEdition } from './edition';

/**
 * Ruta del SQLite de aplicación (ajustes globales + registro de partidas;
 * nunca datos de juego, que viven en un fichero por partida).
 *
 * En desarrollo se usa una carpeta `.dev-data` dentro del proyecto, fácil de
 * inspeccionar o borrar sin tocar el perfil del usuario. En producción va bajo
 * el `userData` de Electron.
 */
export function getAppDatabasePath(): string {
  const baseDir = is.dev ? join(process.cwd(), '.dev-data') : app.getPath('userData');
  return join(baseDir, 'app.sqlite');
}

/**
 * Carpeta con un `.sqlite` por partida guardada, separada de la base de
 * aplicación para que cada partida siga siendo un fichero portable y completo.
 */
export function getSavesDirectory(): string {
  const baseDir = is.dev ? join(process.cwd(), '.dev-data') : app.getPath('userData');
  return join(baseDir, 'saves');
}

/** Ruta del fichero de una partida concreta dentro de {@link getSavesDirectory}. */
export function getSaveFilePath(fileName: string): string {
  return join(getSavesDirectory(), fileName);
}

/**
 * Dónde viven en tiempo de ejecución las migraciones SQL generadas por Drizzle
 * para la base de aplicación.
 *
 * En desarrollo se leen del repo. En una build empaquetada se copian a
 * `resources/drizzle` vía `extraResources` (ver electron-builder.yml).
 */
export function getAppMigrationsFolder(): string {
  return is.dev
    ? join(process.cwd(), 'drizzle', 'app')
    : join(process.resourcesPath, 'drizzle', 'app');
}

/** Igual que {@link getAppMigrationsFolder}, para el esquema de una partida. */
export function getSaveMigrationsFolder(): string {
  return is.dev
    ? join(process.cwd(), 'drizzle', 'save')
    : join(process.resourcesPath, 'drizzle', 'save');
}

/**
 * Dataset con el que se siembra una partida nueva (competiciones, equipos y
 * plantillas). Mismo reparto desarrollo/empaquetado que las migraciones.
 *
 * Empaquetado se lee siempre `seed-data`: qué dataset hay dentro lo decide el
 * build (el ficticio en el público, el real en el privado). En desarrollo el
 * repositorio tiene los dos —el real, sin versionar, en `resources/real-data`—
 * y se elige con la edición (`TM_DATASET=real`, ver `edition.ts`).
 */
export function getSeedDataDirectory(): string {
  if (!is.dev) {
    return join(process.resourcesPath, 'seed-data');
  }
  const folder = currentEdition() === 'private' ? 'real-data' : 'seed-data';
  return join(process.cwd(), 'resources', folder);
}
