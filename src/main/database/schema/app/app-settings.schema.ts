import { sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const appSettingsTable = sqliteTable('app_settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull()
});

export type AppSettingsRow = typeof appSettingsTable.$inferSelect;
export type NewAppSettingsRow = typeof appSettingsTable.$inferInsert;
