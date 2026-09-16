import { and, asc, desc, eq, inArray, isNotNull, isNull, or, sql } from 'drizzle-orm';
import type { SaveDatabase } from '../../database/save-database';
import {
  competitionsTable,
  gamePlayerStatsTable,
  gamesTable,
  gameStateTable,
  playersTable,
  seasonsTable,
  teamsTable,
  type CompetitionRow,
  type GameRow,
  type SeasonRow
} from '../../database/schema/save';

/** Una marca individual tal y como sale de la consulta, sin adornar. */
export interface RawRecord {
  playerId: string;
  playerName: string;
  teamId: string;
  teamName: string;
  value: number;
  round: number;
  startYear: number;
}

/**
 * Las consultas del historial.
 *
 * Todas miran hacia atrás, así que ninguna puede dar por hecho que el equipo
 * está hoy donde estaba entonces: un club que subió de segunda tiene sus
 * temporadas viejas en otra competición, y el historial se rompería si se
 * buscaran por la liga en la que juega ahora.
 */
export class HistoryRepository {
  constructor(private readonly db: SaveDatabase) {}

  managedTeamId(): string | null {
    return this.db.select().from(gameStateTable).get()?.managedTeamId ?? null;
  }

  teamName(teamId: string): string {
    return this.db.select().from(teamsTable).where(eq(teamsTable.id, teamId)).get()?.name ?? teamId;
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

  competitions(): Map<string, CompetitionRow> {
    return new Map(
      this.db
        .select()
        .from(competitionsTable)
        .all()
        .map((row) => [row.id, row])
    );
  }

  /** Todas las temporadas de la partida, de la más reciente a la más antigua. */
  seasons(): SeasonRow[] {
    return this.db
      .select()
      .from(seasonsTable)
      .orderBy(desc(seasonsTable.seasonNumber), asc(seasonsTable.competitionId))
      .all();
  }

  /** Los equipos inscritos hoy en una competición: el tamaño de la liga. */
  teamCount(competitionId: string): number {
    return this.db
      .select({ id: teamsTable.id })
      .from(teamsTable)
      .where(eq(teamsTable.competitionId, competitionId))
      .all().length;
  }

  /** Partidos de liga regular ya jugados de una temporada. */
  playedRegularGames(seasonId: string): GameRow[] {
    return this.db
      .select()
      .from(gamesTable)
      .where(and(eq(gamesTable.seasonId, seasonId), isNull(gamesTable.seriesId)))
      .all()
      .filter((game) => game.homeScore !== null && game.awayScore !== null);
  }

  /** Si el club jugó esta temporada, y hasta qué ronda llegó. */
  lastRoundOf(seasonId: string, teamId: string): number | null {
    const rows = this.db
      .select({ round: gamesTable.round })
      .from(gamesTable)
      .where(
        and(
          eq(gamesTable.seasonId, seasonId),
          or(eq(gamesTable.homeTeamId, teamId), eq(gamesTable.awayTeamId, teamId))
        )
      )
      .orderBy(desc(gamesTable.round))
      .all();

    return rows[0]?.round ?? null;
  }

  /**
   * Hasta qué ronda de playoffs llegó el club, o `null` si no los jugó.
   *
   * Los partidos de playoff viven en la misma tabla que los de liga y se
   * distinguen por tener `seriesId`: sin ese filtro, la «última ronda» de una
   * liga sería la jornada 34 y no habría manera de contar unas semifinales.
   */
  playoffRoundsOf(seasonId: string, teamId: string): number | null {
    const rows = this.db
      .select({ round: gamesTable.round })
      .from(gamesTable)
      .where(
        and(
          eq(gamesTable.seasonId, seasonId),
          isNotNull(gamesTable.seriesId),
          or(eq(gamesTable.homeTeamId, teamId), eq(gamesTable.awayTeamId, teamId))
        )
      )
      .orderBy(desc(gamesTable.round))
      .all();

    return rows[0]?.round ?? null;
  }

  /** Equipos que participaron en una temporada, salgan o no de la tabla de hoy. */
  teamIdsInSeason(seasonId: string): string[] {
    const games = this.db
      .select({ home: gamesTable.homeTeamId, away: gamesTable.awayTeamId })
      .from(gamesTable)
      .where(eq(gamesTable.seasonId, seasonId))
      .all();

    const ids = new Set<string>();
    for (const game of games) {
      ids.add(game.home);
      ids.add(game.away);
    }
    return [...ids].sort();
  }

  /**
   * La mejor marca de la partida en una estadística, con quién y cuándo.
   *
   * Los puntos no están guardados —el acta va en crudo— así que la expresión de
   * puntos se pasa hecha: es la única forma de que el récord de anotación salga
   * de la base de datos y no de traerse un millón de filas a memoria.
   */
  bestBy(expression: ReturnType<typeof sql<number>>, limit = 1): RawRecord[] {
    return this.db
      .select({
        playerId: gamePlayerStatsTable.playerId,
        firstName: playersTable.firstName,
        lastName: playersTable.lastName,
        teamId: gamePlayerStatsTable.teamId,
        teamName: teamsTable.name,
        value: expression,
        round: gamesTable.round,
        startYear: seasonsTable.startYear
      })
      .from(gamePlayerStatsTable)
      .innerJoin(playersTable, eq(playersTable.id, gamePlayerStatsTable.playerId))
      .innerJoin(teamsTable, eq(teamsTable.id, gamePlayerStatsTable.teamId))
      .innerJoin(gamesTable, eq(gamesTable.id, gamePlayerStatsTable.gameId))
      .innerJoin(seasonsTable, eq(seasonsTable.id, gamesTable.seasonId))
      .orderBy(desc(expression))
      .limit(limit)
      .all()
      .map((row) => ({
        playerId: row.playerId,
        playerName: `${row.firstName} ${row.lastName}`,
        teamId: row.teamId,
        teamName: row.teamName,
        value: Number(row.value),
        round: row.round,
        startYear: row.startYear
      }));
  }

  /** Nombres de equipo de una tacada, para no consultar uno a uno. */
  namesOf(teamIds: readonly string[]): Map<string, string> {
    if (teamIds.length === 0) {
      return new Map();
    }
    return new Map(
      this.db
        .select({ id: teamsTable.id, name: teamsTable.name })
        .from(teamsTable)
        .where(inArray(teamsTable.id, [...teamIds]))
        .all()
        .map((row) => [row.id, row.name])
    );
  }
}
