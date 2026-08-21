import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { resolve } from 'node:path';
import * as schema from './schema/save';

export type SaveDatabase = BetterSQLite3Database<typeof schema> & {
  $client: InstanceType<typeof Database>;
};

const openConnections = new Map<string, SaveDatabase>();

/**
 * Abre (o devuelve la ya abierta) conexión al fichero de una partida,
 * aplicando las migraciones pendientes.
 *
 * Deliberadamente sin ningún import de `electron`, para que este módulo siga
 * siendo importable —y testeable— bajo Vitest a secas.
 *
 * Sin WAL a propósito: a diferencia de la base de aplicación, una partida debe
 * seguir siendo un único fichero autocontenido (WAL añade `-wal`/`-shm` al
 * lado, que pueden desincronizarse con sincronización tipo Steam Cloud).
 * `foreign_keys` sí va activado: sin él no se aplicarían los `onDelete` del
 * esquema.
 */
export function openSaveDatabase(filePath: string, migrationsFolder: string): SaveDatabase {
  const key = resolve(filePath);
  const cached = openConnections.get(key);
  if (cached) {
    return cached;
  }

  const sqlite = new Database(key);
  sqlite.pragma('foreign_keys = ON');

  const db = drizzle(sqlite, { schema }) as SaveDatabase;
  migrate(db, { migrationsFolder });

  openConnections.set(key, db);
  return db;
}

/** Cierra y olvida la conexión de una partida, si estaba abierta. Idempotente. */
export function closeSaveDatabase(filePath: string): void {
  const key = resolve(filePath);
  const db = openConnections.get(key);
  if (!db) {
    return;
  }

  db.$client.close();
  openConnections.delete(key);
}
