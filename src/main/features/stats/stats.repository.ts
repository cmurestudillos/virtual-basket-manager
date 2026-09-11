import { and, eq, isNotNull } from 'drizzle-orm';
import type { Position } from '@shared/domain/positions';
import type { SaveDatabase } from '../../database/client';
import {
  gamePlayerStatsTable,
  gamesTable,
  playersTable,
  teamsTable,
  type GamePlayerStatsRow
} from '../../database/schema/save';

export interface PlayerCard {
  name: string;
  position: Position;
  teamId: string | null;
}

export class StatsRepository {
  constructor(private readonly db: SaveDatabase) {}

  /**
   * Todas las líneas de acta de una temporada.
   *
   * Se traen en crudo y se suman en memoria en vez de pedirle las medias a
   * SQLite: son del orden de siete mil filas en una liga entera, y así la
   * valoración y los porcentajes salen de las mismas funciones de dominio que
   * usa el acta de un partido, sin una segunda implementación en SQL.
   */
  listSeasonLines(seasonId: string, teamId?: string): GamePlayerStatsRow[] {
    const filter = teamId
      ? and(eq(gamesTable.seasonId, seasonId), eq(gamePlayerStatsTable.teamId, teamId))
      : eq(gamesTable.seasonId, seasonId);

    return this.db
      .select({ line: gamePlayerStatsTable })
      .from(gamePlayerStatsTable)
      .innerJoin(gamesTable, eq(gamesTable.id, gamePlayerStatsTable.gameId))
      .where(filter)
      .all()
      .map((row) => row.line);
  }

  /** Partidos jugados por cada equipo: es el divisor del mínimo de la tabla de líderes. */
  gamesPlayedByTeam(seasonId: string): Map<string, number> {
    const played = this.db
      .select({ home: gamesTable.homeTeamId, away: gamesTable.awayTeamId })
      .from(gamesTable)
      .where(and(eq(gamesTable.seasonId, seasonId), isNotNull(gamesTable.homeScore)))
      .all();

    const counts = new Map<string, number>();
    for (const game of played) {
      counts.set(game.home, (counts.get(game.home) ?? 0) + 1);
      counts.set(game.away, (counts.get(game.away) ?? 0) + 1);
    }
    return counts;
  }

  playerCards(): Map<string, PlayerCard> {
    return new Map(
      this.db
        .select({
          id: playersTable.id,
          firstName: playersTable.firstName,
          lastName: playersTable.lastName,
          position: playersTable.position,
          teamId: playersTable.teamId
        })
        .from(playersTable)
        .all()
        .map((row) => [
          row.id,
          {
            name: `${row.firstName} ${row.lastName}`,
            position: row.position as Position,
            teamId: row.teamId
          }
        ])
    );
  }

  teamNames(): Map<string, string> {
    return new Map(
      this.db
        .select({ id: teamsTable.id, name: teamsTable.name })
        .from(teamsTable)
        .all()
        .map((row) => [row.id, row.name])
    );
  }
}
