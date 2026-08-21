import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

export const savesTable = sqliteTable('saves', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  fileName: text('file_name').notNull().unique(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  lastPlayedAt: integer('last_played_at', { mode: 'timestamp_ms' })
});

export type SaveRow = typeof savesTable.$inferSelect;
export type NewSaveRow = typeof savesTable.$inferInsert;
