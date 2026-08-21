import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { competitionsTable } from './competitions.schema';

export const seasonsTable = sqliteTable('seasons', {
  id: text('id').primaryKey(),
  competitionId: text('competition_id')
    .notNull()
    .references(() => competitionsTable.id, { onDelete: 'cascade' }),
  /** 1 para la primera temporada de la partida, 2 para la siguiente, etc. */
  seasonNumber: integer('season_number').notNull(),
  /** Año natural en el que arranca (2025 para la temporada 2025-26). */
  startYear: integer('start_year').notNull(),
  /** Jornada de liga regular en curso. */
  currentRound: integer('current_round').notNull().default(1),
  /** `regular`, `playoffs` o `finished`. */
  stage: text('stage').notNull().default('regular')
});

export type SeasonRow = typeof seasonsTable.$inferSelect;
export type NewSeasonRow = typeof seasonsTable.$inferInsert;
