import { and, eq, inArray } from 'drizzle-orm';
import type { AppDatabase } from '../../database/client';
import { worldEditsTable } from '../../database/schema/app';
import type { WorldEdit } from './apply-world-edits';

/** Las ediciones del mundo base, en la base de la aplicación. */
export class WorldEditorRepository {
  constructor(private readonly db: AppDatabase) {}

  all(): WorldEdit[] {
    return this.db
      .select()
      .from(worldEditsTable)
      .all()
      .flatMap((row) => {
        try {
          return [
            {
              entityType: row.entityType,
              entityId: row.entityId,
              data: JSON.parse(row.data)
            } as WorldEdit
          ];
        } catch {
          // Una fila ilegible no tumba el editor ni la creación de partidas.
          return [];
        }
      });
  }

  find(entityType: 'team' | 'player', entityId: string): WorldEdit | null {
    return (
      this.all().find((edit) => edit.entityType === entityType && edit.entityId === entityId) ??
      null
    );
  }

  upsert(entityType: 'team' | 'player', entityId: string, data: object): void {
    const values = {
      entityType,
      entityId,
      data: JSON.stringify(data),
      updatedAt: new Date()
    };
    this.db
      .insert(worldEditsTable)
      .values(values)
      .onConflictDoUpdate({
        target: [worldEditsTable.entityType, worldEditsTable.entityId],
        set: { data: values.data, updatedAt: values.updatedAt }
      })
      .run();
  }

  remove(entityType: 'team' | 'player', entityId: string): void {
    this.db
      .delete(worldEditsTable)
      .where(
        and(eq(worldEditsTable.entityType, entityType), eq(worldEditsTable.entityId, entityId))
      )
      .run();
  }

  removePlayers(playerIds: readonly string[]): void {
    if (playerIds.length === 0) {
      return;
    }
    this.db
      .delete(worldEditsTable)
      .where(
        and(
          eq(worldEditsTable.entityType, 'player'),
          inArray(worldEditsTable.entityId, [...playerIds])
        )
      )
      .run();
  }

  removeAll(): void {
    this.db.delete(worldEditsTable).run();
  }
}
