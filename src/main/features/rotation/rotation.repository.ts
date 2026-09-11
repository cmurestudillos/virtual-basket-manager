import { and, asc, eq } from 'drizzle-orm';
import type { SaveDatabase } from '../../database/client';
import {
  gameStateTable,
  playersTable,
  rotationSlotsTable,
  teamsTable,
  type NewRotationSlotRow,
  type PlayerRow,
  type RotationSlotRow
} from '../../database/schema/save';

export class RotationRepository {
  constructor(private readonly db: SaveDatabase) {}

  managedTeamId(): string | null {
    return this.db.select().from(gameStateTable).get()?.managedTeamId ?? null;
  }

  /** Fecha del juego: la edad de la plantilla se calcula contra ella. */
  currentDate(): Date {
    return this.db.select().from(gameStateTable).get()?.currentDate ?? new Date();
  }

  findTeamName(teamId: string): string | null {
    return this.db.select().from(teamsTable).where(eq(teamsTable.id, teamId)).get()?.name ?? null;
  }

  /** Sólo el primer equipo: un juvenil no entra en la rotación. */
  listRoster(teamId: string): PlayerRow[] {
    return this.db
      .select()
      .from(playersTable)
      .where(and(eq(playersTable.teamId, teamId), eq(playersTable.isYouth, false)))
      .orderBy(asc(playersTable.lastName))
      .all();
  }

  listSlots(teamId: string): RotationSlotRow[] {
    return this.db
      .select()
      .from(rotationSlotsTable)
      .where(eq(rotationSlotsTable.teamId, teamId))
      .orderBy(asc(rotationSlotsTable.depth))
      .all();
  }

  /**
   * Sustituye la rotación entera de un equipo.
   *
   * Borrar y reinsertar dentro de una transacción, y no actualizar fila a fila:
   * la rotación es una lista ordenada, y actualizarla por partes deja estados
   * intermedios con dos jugadores en el mismo puesto o con un titular de menos.
   */
  replaceSlots(teamId: string, rows: readonly NewRotationSlotRow[]): void {
    this.db.transaction((tx) => {
      tx.delete(rotationSlotsTable).where(eq(rotationSlotsTable.teamId, teamId)).run();
      for (const row of rows) {
        tx.insert(rotationSlotsTable).values(row).run();
      }
    });
  }
}
