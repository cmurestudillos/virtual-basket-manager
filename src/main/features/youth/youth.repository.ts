import { and, asc, eq } from 'drizzle-orm';
import type { SaveDatabase } from '../../database/client';
import {
  gameStateTable,
  playersTable,
  teamsTable,
  type NewPlayerRow,
  type PlayerRow,
  type TeamRow
} from '../../database/schema/save';

export class YouthRepository {
  constructor(private readonly db: SaveDatabase) {}

  managedTeamId(): string | null {
    return this.db.select().from(gameStateTable).get()?.managedTeamId ?? null;
  }

  currentDate(): Date {
    return this.db.select().from(gameStateTable).get()?.currentDate ?? new Date();
  }

  findTeam(teamId: string): TeamRow | null {
    return this.db.select().from(teamsTable).where(eq(teamsTable.id, teamId)).get() ?? null;
  }

  listTeams(): TeamRow[] {
    return this.db.select().from(teamsTable).orderBy(asc(teamsTable.id)).all();
  }

  /** Los juveniles de un club, del más prometedor al menos. */
  listYouth(teamId: string): PlayerRow[] {
    return this.db
      .select()
      .from(playersTable)
      .where(and(eq(playersTable.teamId, teamId), eq(playersTable.isYouth, true)))
      .orderBy(asc(playersTable.lastName))
      .all();
  }

  /** Y los del primer equipo, que son los que ocupan sitio en la plantilla. */
  countRoster(teamId: string): number {
    return this.db
      .select({ id: playersTable.id })
      .from(playersTable)
      .where(and(eq(playersTable.teamId, teamId), eq(playersTable.isYouth, false)))
      .all().length;
  }

  findPlayer(playerId: string): PlayerRow | null {
    return this.db.select().from(playersTable).where(eq(playersTable.id, playerId)).get() ?? null;
  }

  promote(playerId: string): void {
    this.db.update(playersTable).set({ isYouth: false }).where(eq(playersTable.id, playerId)).run();
  }

  /** Al juvenil que se hace mayor y no sube se le da la carta de libertad. */
  release(playerId: string): void {
    this.db.delete(playersTable).where(eq(playersTable.id, playerId)).run();
  }

  insertPlayers(rows: readonly NewPlayerRow[]): void {
    this.db.transaction((tx) => {
      for (const row of rows) {
        tx.insert(playersTable).values(row).run();
      }
    });
  }

  setYouthLevel(teamId: string, level: number): void {
    this.db.update(teamsTable).set({ youthLevel: level }).where(eq(teamsTable.id, teamId)).run();
  }
}
