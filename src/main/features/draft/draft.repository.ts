import { and, asc, eq, isNull } from 'drizzle-orm';
import type { SaveDatabase } from '../../database/save-database';
import {
  competitionsTable,
  draftPicksTable,
  playersTable,
  type CompetitionRow,
  type DraftPickRow,
  type NewPlayerRow,
  type PlayerRow
} from '../../database/schema/save';

/** Las consultas del draft. */
export class DraftRepository {
  constructor(private readonly db: SaveDatabase) {}

  nbaCompetitions(): CompetitionRow[] {
    return this.db
      .select()
      .from(competitionsTable)
      .where(eq(competitionsTable.nbaFormat, true))
      .all();
  }

  picks(competitionId: string, seasonNumber: number): DraftPickRow[] {
    return this.db
      .select()
      .from(draftPicksTable)
      .where(
        and(
          eq(draftPicksTable.competitionId, competitionId),
          eq(draftPicksTable.seasonNumber, seasonNumber)
        )
      )
      .orderBy(asc(draftPicksTable.pick))
      .all();
  }

  insertPicks(rows: readonly DraftPickRow[]): void {
    this.db.transaction((tx) => {
      for (const row of rows) {
        tx.insert(draftPicksTable).values(row).run();
      }
    });
  }

  resolvePick(pickId: string, playerId: string | null, passed: boolean): void {
    this.db
      .update(draftPicksTable)
      .set({ playerId, passed })
      .where(eq(draftPicksTable.id, pickId))
      .run();
  }

  insertPlayers(rows: readonly NewPlayerRow[]): void {
    this.db.transaction((tx) => {
      for (const row of rows) {
        tx.insert(playersTable).values(row).run();
      }
    });
  }

  /** Los prospectos de una clase que siguen sin equipo. */
  prospects(seasonNumber: number): PlayerRow[] {
    return this.db
      .select()
      .from(playersTable)
      .where(and(eq(playersTable.draftClass, seasonNumber), isNull(playersTable.teamId)))
      .all();
  }

  findPlayer(playerId: string): PlayerRow | null {
    return this.db.select().from(playersTable).where(eq(playersTable.id, playerId)).get() ?? null;
  }

  /** Quien no salió elegido pasa a ser agente libre como cualquier otro. */
  closeClass(seasonNumber: number): void {
    this.db
      .update(playersTable)
      .set({ draftClass: null })
      .where(eq(playersTable.draftClass, seasonNumber))
      .run();
  }

  /** Un elegido deja de ser prospecto: ya es jugador de su equipo. */
  clearDraftClass(playerId: string): void {
    this.db
      .update(playersTable)
      .set({ draftClass: null })
      .where(eq(playersTable.id, playerId))
      .run();
  }
}
