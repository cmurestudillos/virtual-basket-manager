import { and, asc, eq, inArray, isNotNull, isNull } from 'drizzle-orm';
import type { SaveDatabase } from '../../database/save-database';
import {
  celebrationsTable,
  coachesTable,
  competitionsTable,
  gamePlayerStatsTable,
  gamesTable,
  gameStateTable,
  playersTable,
  seasonAwardsTable,
  seasonsTable,
  teamsTable,
  type CelebrationRow,
  type CoachRow,
  type CompetitionRow,
  type GamePlayerStatsRow,
  type NewCelebrationRow,
  type NewSeasonAwardRow,
  type PlayerRow,
  type SeasonAwardRow,
  type SeasonRow,
  type TeamRow
} from '../../database/schema/save';

/**
 * Las consultas de los trofeos: las pantallas de campeón pendientes, los
 * premios de cada temporada y las actas de las que salen.
 *
 * Única pieza de la feature que ve Drizzle.
 */
export class TrophyRepository {
  constructor(private readonly db: SaveDatabase) {}

  gameState(): {
    managedTeamId: string | null;
    managerName: string;
    managerNationality: string;
    currentDate: Date;
  } {
    const row = this.db.select().from(gameStateTable).get();
    return {
      managedTeamId: row?.managedTeamId ?? null,
      managerName: row?.managerName ?? 'Entrenador',
      managerNationality: row?.managerNationality ?? 'ESP',
      currentDate: row?.currentDate ?? new Date()
    };
  }

  findSeason(seasonId: string): SeasonRow | null {
    return this.db.select().from(seasonsTable).where(eq(seasonsTable.id, seasonId)).get() ?? null;
  }

  seasonsByIds(seasonIds: readonly string[]): SeasonRow[] {
    if (seasonIds.length === 0) {
      return [];
    }
    return this.db
      .select()
      .from(seasonsTable)
      .where(inArray(seasonsTable.id, [...seasonIds]))
      .all();
  }

  findCompetition(competitionId: string): CompetitionRow | null {
    return (
      this.db
        .select()
        .from(competitionsTable)
        .where(eq(competitionsTable.id, competitionId))
        .get() ?? null
    );
  }

  findTeam(teamId: string): TeamRow | null {
    return this.db.select().from(teamsTable).where(eq(teamsTable.id, teamId)).get() ?? null;
  }

  teams(): Map<string, TeamRow> {
    return new Map(
      this.db
        .select()
        .from(teamsTable)
        .all()
        .map((row) => [row.id, row])
    );
  }

  /** El entrenador sentado en cada banquillo ahora mismo. */
  benches(): Map<string, CoachRow> {
    const benches = new Map<string, CoachRow>();
    for (const coach of this.db
      .select()
      .from(coachesTable)
      .where(isNotNull(coachesTable.teamId))
      .all()) {
      benches.set(coach.teamId as string, coach);
    }
    return benches;
  }

  findCoach(coachId: string): CoachRow | null {
    return this.db.select().from(coachesTable).where(eq(coachesTable.id, coachId)).get() ?? null;
  }

  playersByIds(playerIds: readonly string[]): Map<string, PlayerRow> {
    if (playerIds.length === 0) {
      return new Map();
    }
    return new Map(
      this.db
        .select()
        .from(playersTable)
        .where(inArray(playersTable.id, [...playerIds]))
        .all()
        .map((row) => [row.id, row])
    );
  }

  /** Las actas de la fase regular de una liga: sin playoffs ni play-in. */
  regularLines(seasonId: string): GamePlayerStatsRow[] {
    return this.db
      .select({ line: gamePlayerStatsTable })
      .from(gamePlayerStatsTable)
      .innerJoin(gamesTable, eq(gamesTable.id, gamePlayerStatsTable.gameId))
      .where(and(eq(gamesTable.seasonId, seasonId), isNull(gamesTable.seriesId)))
      .all()
      .map((row) => row.line);
  }

  /** Las actas de una ronda del cuadro: la final, para su MVP. */
  roundLines(seasonId: string, round: number): GamePlayerStatsRow[] {
    return this.db
      .select({ line: gamePlayerStatsTable })
      .from(gamePlayerStatsTable)
      .innerJoin(gamesTable, eq(gamesTable.id, gamePlayerStatsTable.gameId))
      .where(
        and(
          eq(gamesTable.seasonId, seasonId),
          isNotNull(gamesTable.seriesId),
          eq(gamesTable.round, round)
        )
      )
      .all()
      .map((row) => row.line);
  }

  // --- Celebraciones ----------------------------------------------------------

  /** Idempotente: la misma copa de la misma temporada no se apunta dos veces. */
  insertCelebration(row: NewCelebrationRow): void {
    this.db.insert(celebrationsTable).values(row).onConflictDoNothing().run();
  }

  pendingCelebrations(): CelebrationRow[] {
    return this.db
      .select()
      .from(celebrationsTable)
      .where(isNull(celebrationsTable.seenOn))
      .orderBy(asc(celebrationsTable.happenedOn), asc(celebrationsTable.createdAt))
      .all();
  }

  markSeen(celebrationId: string, seenOn: Date): void {
    this.db
      .update(celebrationsTable)
      .set({ seenOn })
      .where(eq(celebrationsTable.id, celebrationId))
      .run();
  }

  // --- Premios ----------------------------------------------------------------

  hasAwards(seasonId: string): boolean {
    return (
      this.db
        .select({ id: seasonAwardsTable.id })
        .from(seasonAwardsTable)
        .where(eq(seasonAwardsTable.seasonId, seasonId))
        .get() !== undefined
    );
  }

  insertAwards(rows: readonly NewSeasonAwardRow[]): void {
    if (rows.length === 0) {
      return;
    }
    this.db
      .insert(seasonAwardsTable)
      .values([...rows])
      .onConflictDoNothing()
      .run();
  }

  awardsOf(seasonIds: readonly string[]): SeasonAwardRow[] {
    if (seasonIds.length === 0) {
      return [];
    }
    return this.db
      .select()
      .from(seasonAwardsTable)
      .where(inArray(seasonAwardsTable.seasonId, [...seasonIds]))
      .orderBy(asc(seasonAwardsTable.type), asc(seasonAwardsTable.slot))
      .all();
  }
}
