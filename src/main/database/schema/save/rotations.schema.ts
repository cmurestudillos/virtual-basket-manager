import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { teamsTable } from './teams.schema';

/**
 * Rotación de un equipo: quién sale de inicio, en qué hueco, y cuántos minutos
 * le toca jugar.
 *
 * En fútbol una alineación es una lista de once y ya está. Aquí el reparto de
 * minutos es la decisión táctica principal del entrenador —lo era ya en PC
 * Basket— así que se guarda como parte de la alineación, no aparte.
 */
export const rotationSlotsTable = sqliteTable('rotation_slots', {
  id: text('id').primaryKey(),
  teamId: text('team_id')
    .notNull()
    .references(() => teamsTable.id, { onDelete: 'cascade' }),
  playerId: text('player_id').notNull(),
  /** Puesto en la rotación: 0-4 titulares, 5+ banquillo por orden. */
  depth: integer('depth').notNull(),
  /** Hueco de pista que ocupa: PG, SG, SF, PF o C. */
  slotPosition: text('slot_position').notNull(),
  /** Minutos objetivo por partido. El motor lo usa para rotar. */
  targetMinutes: integer('target_minutes').notNull().default(0)
});

export type RotationSlotRow = typeof rotationSlotsTable.$inferSelect;
export type NewRotationSlotRow = typeof rotationSlotsTable.$inferInsert;
