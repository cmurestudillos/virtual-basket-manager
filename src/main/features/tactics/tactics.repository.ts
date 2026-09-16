import { eq } from 'drizzle-orm';
import type { SaveDatabase } from '../../database/client';
import {
  gameStateTable,
  playersTable,
  teamsTable,
  teamTacticsTable,
  type TeamTacticsRow
} from '../../database/schema/save';
import { isNationalTeam, nationalSquad, userTeamIds } from '../national/national-squad';

export class TacticsRepository {
  constructor(private readonly db: SaveDatabase) {}

  /** Si el usuario dirige ese equipo: su club o su selección. */
  isUserTeam(teamId: string): boolean {
    return userTeamIds(this.db).includes(teamId);
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
    if (!row) {
      return null;
    }
    const belongs = isNationalTeam(this.db, teamId)
      ? nationalSquad(
          this.db,
          teamId,
          this.db.select().from(gameStateTable).get()?.currentDate ?? new Date()
        ).some((player) => player.id === playerId)
      : row.teamId === teamId;
    return belongs ? `${row.firstName} ${row.lastName}` : null;
  }

  upsert(row: TeamTacticsRow): void {
    this.db
      .insert(teamTacticsTable)
      .values(row)
      .onConflictDoUpdate({ target: teamTacticsTable.teamId, set: row })
      .run();
  }
}
