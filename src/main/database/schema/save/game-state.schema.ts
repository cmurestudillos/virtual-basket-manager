import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

/**
 * Estado global de la partida: una única fila (`id = 'singleton'`).
 *
 * Guardar el equipo dirigido y la fecha del juego en una tabla de una fila
 * —en vez de en un fichero de ajustes— los deja dentro del mismo `.sqlite`
 * que el resto de la partida, así que copiar el save copia todo.
 */
export const gameStateTable = sqliteTable('game_state', {
  id: text('id').primaryKey().default('singleton'),
  managedTeamId: text('managed_team_id'),
  managerName: text('manager_name').notNull().default('Entrenador'),
  /** Fecha dentro del juego. El reloj real de la máquina no pinta nada aquí. */
  currentDate: integer('current_date', { mode: 'timestamp_ms' }).notNull(),
  seasonNumber: integer('season_number').notNull().default(1)
});

export type GameStateRow = typeof gameStateTable.$inferSelect;
export type NewGameStateRow = typeof gameStateTable.$inferInsert;
