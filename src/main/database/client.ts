import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import {
  getAppDatabasePath,
  getAppMigrationsFolder,
  getSaveMigrationsFolder
} from '../config/paths';
import * as schema from './schema/app';
import { openSaveDatabase, type SaveDatabase } from './save-database';

export type AppDatabase = BetterSQLite3Database<typeof schema>;
export type { SaveDatabase };

let dbInstance: AppDatabase | null = null;

/**
 * Abre (o devuelve la ya abierta) conexión a la base de aplicación —ajustes
 * globales y registro de partidas—, aplicando las migraciones pendientes.
 *
 * Sólo este módulo, y los repositorios que reciben la instancia por
 * constructor, pueden importar `better-sqlite3` o `drizzle-orm` directamente.
 * Todo lo demás pasa por un repositorio.
 *
 * Aquí sí se usa WAL: esta base no necesita ser portable, a diferencia del
 * fichero de una partida.
 */
export function getAppDatabase(): AppDatabase {
  if (dbInstance) {
    return dbInstance;
  }

  const dbPath = getAppDatabasePath();
  mkdirSync(dirname(dbPath), { recursive: true });

  const sqlite = new Database(dbPath);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');

  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: getAppMigrationsFolder() });

  dbInstance = db;
  return db;
}

/**
 * Abre la conexión al fichero de una partida concreta. Envoltorio fino y
 * consciente de Electron sobre `save-database.ts`, cuyo núcleo se mantiene
 * libre de Electron para poder testearlo.
 */
export function getSaveDatabase(filePath: string): SaveDatabase {
  return openSaveDatabase(filePath, getSaveMigrationsFolder());
}
