import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
import { teamsTable } from './teams.schema';

/**
 * Libro de movimientos del club.
 *
 * Cada apunte va acompañado, en la misma transacción, del movimiento de caja en
 * `teams.budget_cents`: así no hay forma de que el saldo y el libro cuenten
 * cosas distintas. El libro es la historia; la caja, el saldo.
 *
 * Sólo se llevan las cuentas del club del usuario: los rivales no tienen libros
 * mientras no haya mercado en el que gastar.
 */
export const financeEntriesTable = sqliteTable(
  'finance_entries',
  {
    id: text('id').primaryKey(),
    teamId: text('team_id')
      .notNull()
      .references(() => teamsTable.id, { onDelete: 'cascade' }),
    /** Temporada a la que se imputa; nulo para lo que cae fuera de una. */
    seasonId: text('season_id'),
    /** Fecha del juego en la que se apunta. */
    happenedOn: integer('happened_on', { mode: 'timestamp_ms' }).notNull(),
    /** `ticketing`, `wages`, `tv`… ver el dominio de finanzas. */
    type: text('type').notNull(),
    description: text('description').notNull(),
    /** Positivo ingreso, negativo gasto. Céntimos, siempre enteros. */
    amountCents: integer('amount_cents').notNull()
  },
  (table) => [index('idx_finance_entries_team').on(table.teamId, table.happenedOn)]
);

export type FinanceEntryRow = typeof financeEntriesTable.$inferSelect;
export type NewFinanceEntryRow = typeof financeEntriesTable.$inferInsert;
