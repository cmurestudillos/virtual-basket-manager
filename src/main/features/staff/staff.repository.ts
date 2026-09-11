import { asc, eq, isNull } from 'drizzle-orm';
import type { SaveDatabase } from '../../database/client';
import {
  gameStateTable,
  staffTable,
  teamsTable,
  type NewStaffRow,
  type StaffRow
} from '../../database/schema/save';

export class StaffRepository {
  constructor(private readonly db: SaveDatabase) {}

  managedTeamId(): string | null {
    return this.db.select().from(gameStateTable).get()?.managedTeamId ?? null;
  }

  findTeamName(teamId: string): string | null {
    return this.db.select().from(teamsTable).where(eq(teamsTable.id, teamId)).get()?.name ?? null;
  }

  listByTeam(teamId: string): StaffRow[] {
    return this.db
      .select()
      .from(staffTable)
      .where(eq(staffTable.teamId, teamId))
      .orderBy(asc(staffTable.role))
      .all();
  }

  /** Técnicos libres: el mercado de cuerpo técnico es esta tabla sin equipo. */
  listFree(): StaffRow[] {
    return this.db
      .select()
      .from(staffTable)
      .where(isNull(staffTable.teamId))
      .orderBy(asc(staffTable.role), asc(staffTable.level))
      .all();
  }

  findById(staffId: string): StaffRow | null {
    return this.db.select().from(staffTable).where(eq(staffTable.id, staffId)).get() ?? null;
  }

  insertMany(rows: readonly NewStaffRow[]): void {
    this.db.transaction((tx) => {
      for (const row of rows) {
        tx.insert(staffTable).values(row).run();
      }
    });
  }

  setTeam(staffId: string, teamId: string | null): void {
    this.db.update(staffTable).set({ teamId }).where(eq(staffTable.id, staffId)).run();
  }
}
