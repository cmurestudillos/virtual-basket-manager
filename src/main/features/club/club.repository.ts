import { randomUUID } from 'node:crypto';
import { and, desc, eq, sql } from 'drizzle-orm';
import type { FinanceEntryType } from '@shared/domain/finance';
import type { SaveDatabase } from '../../database/client';
import {
  boardTable,
  financeEntriesTable,
  gameStateTable,
  playersTable,
  teamsTable,
  type BoardRow,
  type FinanceEntryRow,
  type TeamRow
} from '../../database/schema/save';

export interface NewEntry {
  teamId: string;
  seasonId: string | null;
  happenedOn: Date;
  type: FinanceEntryType;
  description: string;
  /** Positivo ingreso, negativo gasto. */
  amountCents: number;
}

export class ClubRepository {
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

  /** Nómina anual de la plantilla: la suma de las fichas. */
  seasonWagesCents(teamId: string): number {
    const row = this.db
      .select({ total: sql<number>`coalesce(sum(${playersTable.wageCents}), 0)` })
      .from(playersTable)
      .where(eq(playersTable.teamId, teamId))
      .get();

    return row?.total ?? 0;
  }

  setTicketPrice(teamId: string, priceCents: number): void {
    this.db
      .update(teamsTable)
      .set({ ticketPriceCents: priceCents })
      .where(eq(teamsTable.id, teamId))
      .run();
  }

  setSeasonTicketHolders(teamId: string, holders: number): void {
    this.db
      .update(teamsTable)
      .set({ seasonTicketHolders: holders })
      .where(eq(teamsTable.id, teamId))
      .run();
  }

  setFanSupport(teamId: string, support: number): void {
    this.db.update(teamsTable).set({ fanSupport: support }).where(eq(teamsTable.id, teamId)).run();
  }

  setCapacity(teamId: string, capacity: number): void {
    this.db
      .update(teamsTable)
      .set({ pavilionCapacity: capacity })
      .where(eq(teamsTable.id, teamId))
      .run();
  }

  /**
   * Apunta un movimiento y mueve la caja en la misma transacción.
   *
   * Es el único camino por el que entra o sale dinero: así el libro y el saldo
   * no pueden contar cosas distintas, que es el error clásico de llevar las dos
   * cifras por separado.
   */
  record(entry: NewEntry): void {
    if (entry.amountCents === 0) {
      return;
    }

    this.db.transaction((tx) => {
      tx.insert(financeEntriesTable)
        .values({
          id: randomUUID(),
          teamId: entry.teamId,
          seasonId: entry.seasonId,
          happenedOn: entry.happenedOn,
          type: entry.type,
          description: entry.description,
          amountCents: entry.amountCents
        })
        .run();

      tx.update(teamsTable)
        .set({ budgetCents: sql`${teamsTable.budgetCents} + ${entry.amountCents}` })
        .where(eq(teamsTable.id, entry.teamId))
        .run();
    });
  }

  /** Últimos movimientos, del más reciente al más antiguo. */
  listEntries(teamId: string, limit: number): FinanceEntryRow[] {
    return this.db
      .select()
      .from(financeEntriesTable)
      .where(eq(financeEntriesTable.teamId, teamId))
      .orderBy(desc(financeEntriesTable.happenedOn), desc(financeEntriesTable.id))
      .limit(limit)
      .all();
  }

  listSeasonEntries(teamId: string, seasonId: string): FinanceEntryRow[] {
    return this.db
      .select()
      .from(financeEntriesTable)
      .where(
        and(eq(financeEntriesTable.teamId, teamId), eq(financeEntriesTable.seasonId, seasonId))
      )
      .all();
  }

  /** Si ya se apuntó algo de ese tipo en la temporada: evita cobrar dos veces. */
  hasEntry(teamId: string, seasonId: string, type: FinanceEntryType): boolean {
    return (
      this.db
        .select({ id: financeEntriesTable.id })
        .from(financeEntriesTable)
        .where(
          and(
            eq(financeEntriesTable.teamId, teamId),
            eq(financeEntriesTable.seasonId, seasonId),
            eq(financeEntriesTable.type, type)
          )
        )
        .get() !== undefined
    );
  }

  findBoard(teamId: string): BoardRow | null {
    return this.db.select().from(boardTable).where(eq(boardTable.teamId, teamId)).get() ?? null;
  }

  upsertBoard(row: BoardRow): void {
    this.db
      .insert(boardTable)
      .values(row)
      .onConflictDoUpdate({ target: boardTable.teamId, set: row })
      .run();
  }
}
