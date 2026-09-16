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
  seasonNumber: integer('season_number').notNull().default(1),
  /**
   * Si el consejo puede echarte. Se elige al crear la partida y no se toca
   * después: quien quiere construir un club a diez años vista necesita poder
   * quitarse de en medio la mecánica más punitiva del juego, y quien la deja
   * puesta no debería poder desactivarla en cuanto le aprieta.
   */
  dismissalEnabled: integer('dismissal_enabled', { mode: 'boolean' }).notNull().default(true),
  /**
   * Modo carrera: el despido deja de ser el final de la partida y pasa a ser
   * quedarte sin equipo. Se elige al crear la partida, como el despido, porque
   * es qué clase de partida quieres jugar y no un ajuste que se toque a mitad.
   */
  careerMode: integer('career_mode', { mode: 'boolean' }).notNull().default(false),
  /**
   * La última foto del club que vio la bandeja, en JSON. Los avisos salen de
   * compararla con la de ahora; nula hasta la primera vez que se mira.
   */
  inboxSnapshot: text('inbox_snapshot')
});

export type GameStateRow = typeof gameStateTable.$inferSelect;
export type NewGameStateRow = typeof gameStateTable.$inferInsert;
