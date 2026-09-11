import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { teamsTable } from './teams.schema';

/**
 * Cuerpo técnico.
 *
 * `teamId` nulo es un técnico libre: el mercado de staff es esta misma tabla
 * sin equipo, igual que un agente libre es un jugador sin equipo. La ficha no
 * se guarda porque sale del nivel — lo derivado no se persiste.
 */
export const staffTable = sqliteTable('staff', {
  id: text('id').primaryKey(),
  /** Nulo = libre, disponible para contratar. */
  teamId: text('team_id').references(() => teamsTable.id, { onDelete: 'set null' }),
  firstName: text('first_name').notNull(),
  lastName: text('last_name').notNull(),
  /** `assistant`, `fitness`, `physio`, `analyst` u `scout`. */
  role: text('role').notNull(),
  /** 1-5. Decide lo que aporta y lo que cobra. */
  level: integer('level').notNull().default(1)
});

export type StaffRow = typeof staffTable.$inferSelect;
export type NewStaffRow = typeof staffTable.$inferInsert;
