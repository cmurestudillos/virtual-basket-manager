import { desc, eq } from 'drizzle-orm';
import { savesTable, type NewSaveRow, type SaveRow } from '../../database/schema/app';
import type { AppDatabase } from '../../database/client';

/** Registro de partidas. Vive en la base de aplicación, no dentro de cada partida. */
export class SavesRepository {
  constructor(private readonly db: AppDatabase) {}

  list(): SaveRow[] {
    return this.db.select().from(savesTable).orderBy(desc(savesTable.lastPlayedAt)).all();
  }

  findById(id: string): SaveRow | null {
    return this.db.select().from(savesTable).where(eq(savesTable.id, id)).get() ?? null;
  }

  insert(row: NewSaveRow): void {
    this.db.insert(savesTable).values(row).run();
  }

  touchLastPlayed(id: string, when: Date): void {
    this.db.update(savesTable).set({ lastPlayedAt: when }).where(eq(savesTable.id, id)).run();
  }

  delete(id: string): void {
    this.db.delete(savesTable).where(eq(savesTable.id, id)).run();
  }
}
