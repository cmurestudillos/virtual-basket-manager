import { eq } from 'drizzle-orm';
import type { SaveDatabase } from '../../database/client';
import {
  gameStateTable,
  playersTable,
  teamsTable,
  teamTacticsTable,
  type TeamTacticsRow
} from '../../database/schema/save';

export class TacticsRepository {
  constructor(private readonly db: SaveDatabase) {}

  managedTeamId(): string | null {
    return this.db.select().from(gameStateTable).get()?.managedTeamId ?? null;
  }

  findTeamName(teamId: string): string | null {
    return this.db.select().from(teamsTable).where(eq(teamsTable.id, teamId)).get()?.name ?? null;
  }

  findTactics(teamId: string): TeamTacticsRow | null {
    return (
      this.db.select().from(teamTacticsTable).where(eq(teamTacticsTable.teamId, teamId)).get() ??
      null
    );
  }

  /** Nombre del jugador si está en ese equipo; `null` si no es suyo o no existe. */
  findPlayerNameInTeam(teamId: string, playerId: string): string | null {
    const row = this.db.select().from(playersTable).where(eq(playersTable.id, playerId)).get();
    return row && row.teamId === teamId ? `${row.firstName} ${row.lastName}` : null;
  }

  upsert(row: TeamTacticsRow): void {
    this.db
      .insert(teamTacticsTable)
      .values(row)
      .onConflictDoUpdate({ target: teamTacticsTable.teamId, set: row })
      .run();
  }
}
