import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { teamsTable } from './teams.schema';

/**
 * El consejo del club que dirige el usuario: qué le pidieron esta temporada y
 * cuánta cuerda le queda.
 *
 * Una fila por equipo dirigido. Se guarda la temporada a la que corresponde el
 * objetivo para poder renovarlo al empezar la siguiente sin perder el rastro de
 * lo que pasó en la anterior.
 */
export const boardTable = sqliteTable('board', {
  teamId: text('team_id')
    .primaryKey()
    .references(() => teamsTable.id, { onDelete: 'cascade' }),
  /** Temporada del objetivo vigente. */
  seasonNumber: integer('season_number').notNull().default(1),
  /** `survive`, `playoffs`, `title`… ver el dominio del consejo. */
  objective: text('objective').notNull().default('midtable'),
  /** Puesto de liga regular con el que se da por cumplido. */
  targetPosition: integer('target_position').notNull().default(9),
  /** Paciencia del consejo, 0-100. A cero, despido. */
  confidence: integer('confidence').notNull().default(60),
  /** Si ya te han echado: la partida se queda como estaba, pero sin avanzar. */
  dismissed: integer('dismissed', { mode: 'boolean' }).notNull().default(false)
});

export type BoardRow = typeof boardTable.$inferSelect;
export type NewBoardRow = typeof boardTable.$inferInsert;
