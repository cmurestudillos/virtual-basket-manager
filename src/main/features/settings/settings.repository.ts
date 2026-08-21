import { eq } from 'drizzle-orm';
import { appSettingsTable } from '../../database/schema/app';
import type { AppDatabase } from '../../database/client';
import type { SettingsKey } from '@shared/contracts/settings.contract';

/**
 * Única clase de esta feature autorizada a tocar Drizzle/SQLite. Los servicios
 * dependen de esta abstracción, nunca del cliente de base de datos.
 */
export class SettingsRepository {
  constructor(private readonly db: AppDatabase) {}

  findByKey(key: SettingsKey): string | null {
    const row = this.db.select().from(appSettingsTable).where(eq(appSettingsTable.key, key)).get();

    return row?.value ?? null;
  }

  upsert(key: SettingsKey, value: string): void {
    this.db
      .insert(appSettingsTable)
      .values({ key, value })
      .onConflictDoUpdate({ target: appSettingsTable.key, set: { value } })
      .run();
  }
}
