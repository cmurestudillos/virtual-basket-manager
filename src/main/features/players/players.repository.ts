import { and, asc, eq } from 'drizzle-orm';
import type { SaveDatabase } from '../../database/client';
import { gameStateTable, playersTable, type PlayerRow } from '../../database/schema/save';

export class PlayersRepository {
  constructor(private readonly db: SaveDatabase) {}

  /** El primer equipo: los juveniles tienen su propia pantalla. */
  listByTeam(teamId: string): PlayerRow[] {
    return this.db
      .select()
      .from(playersTable)
      .where(and(eq(playersTable.teamId, teamId), eq(playersTable.isYouth, false)))
      .orderBy(asc(playersTable.lastName))
      .all();
  }

  managedTeamId(): string | null {
    return this.db.select().from(gameStateTable).get()?.managedTeamId ?? null;
  }

  findById(id: string): PlayerRow | null {
    return this.db.select().from(playersTable).where(eq(playersTable.id, id)).get() ?? null;
  }

  /**
   * Fecha del juego. La lee el repositorio de jugadores porque la edad se
   * calcula contra ella y no contra el reloj real de la máquina: si no, la
   * plantilla envejecería al cambiar de año natural aunque la partida siguiera
   * en la misma temporada.
   */
  currentDate(): Date {
    return this.db.select().from(gameStateTable).get()?.currentDate ?? new Date();
  }
}
