import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { competitionsTable } from './competitions.schema';

export const teamsTable = sqliteTable('teams', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  shortName: text('short_name').notNull(),
  city: text('city').notNull(),
  country: text('country').notNull(),
  competitionId: text('competition_id')
    .notNull()
    .references(() => competitionsTable.id, { onDelete: 'cascade' }),
  /** Ruta o data URI del escudo. Nulo mientras no haya imagen. */
  crest: text('crest'),
  pavilionName: text('pavilion_name').notNull(),
  pavilionCapacity: integer('pavilion_capacity').notNull().default(5000),
  /** 1-100: mueve fichajes, taquilla y expectativas del consejo. */
  reputation: integer('reputation').notNull().default(50),
  /** Dinero en céntimos: nunca en euros, para no arrastrar decimales. */
  budgetCents: integer('budget_cents').notNull().default(0)
});

export type TeamRow = typeof teamsTable.$inferSelect;
export type NewTeamRow = typeof teamsTable.$inferInsert;
