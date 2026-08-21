import { and, asc, eq, isNull, lte, or } from 'drizzle-orm';
import type { SaveDatabase } from '../../database/client';
import {
  competitionsTable,
  gamesTable,
  gameStateTable,
  seasonsTable,
  teamsTable,
  type CompetitionRow,
  type GameRow,
  type NewGameRow,
  type SeasonRow
} from '../../database/schema/save';

export class SeasonRepository {
  constructor(private readonly db: SaveDatabase) {}

  gameState(): { managedTeamId: string | null; currentDate: Date; seasonNumber: number } {
    const state = this.db.select().from(gameStateTable).get();
    if (!state) {
      throw new Error('La partida no tiene estado de juego');
    }
    return {
      managedTeamId: state.managedTeamId,
      currentDate: state.currentDate,
      seasonNumber: state.seasonNumber
    };
  }

  setCurrentDate(date: Date): void {
    this.db.update(gameStateTable).set({ currentDate: date }).run();
  }

  competitionOfTeam(teamId: string): CompetitionRow {
    const row = this.db
      .select({ competition: competitionsTable })
      .from(teamsTable)
      .innerJoin(competitionsTable, eq(competitionsTable.id, teamsTable.competitionId))
      .where(eq(teamsTable.id, teamId))
      .get();

    if (!row) {
      throw new Error(`El equipo ${teamId} no está en ninguna competición`);
    }
    return row.competition;
  }

  findSeason(competitionId: string, seasonNumber: number): SeasonRow | null {
    return (
      this.db
        .select()
        .from(seasonsTable)
        .where(
          and(
            eq(seasonsTable.competitionId, competitionId),
            eq(seasonsTable.seasonNumber, seasonNumber)
          )
        )
        .get() ?? null
    );
  }

  insertSeason(row: SeasonRow): void {
    this.db.insert(seasonsTable).values(row).run();
  }

  setCurrentRound(seasonId: string, round: number): void {
    this.db
      .update(seasonsTable)
      .set({ currentRound: round })
      .where(eq(seasonsTable.id, seasonId))
      .run();
  }

  insertGames(rows: readonly NewGameRow[]): void {
    // Una transacción para las 306 filas del calendario: insertarlas de una en
    // una fuera de transacción son 306 escrituras a disco y se nota al crear
    // la temporada.
    this.db.transaction((tx) => {
      for (const row of rows) {
        tx.insert(gamesTable).values(row).run();
      }
    });
  }

  teamIdsInCompetition(competitionId: string): string[] {
    return this.db
      .select({ id: teamsTable.id })
      .from(teamsTable)
      .where(eq(teamsTable.competitionId, competitionId))
      .orderBy(asc(teamsTable.id))
      .all()
      .map((row) => row.id);
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

  listGames(seasonId: string): GameRow[] {
    return this.db
      .select()
      .from(gamesTable)
      .where(eq(gamesTable.seasonId, seasonId))
      .orderBy(asc(gamesTable.round), asc(gamesTable.id))
      .all();
  }

  listGamesInRound(seasonId: string, round: number): GameRow[] {
    return this.db
      .select()
      .from(gamesTable)
      .where(and(eq(gamesTable.seasonId, seasonId), eq(gamesTable.round, round)))
      .orderBy(asc(gamesTable.id))
      .all();
  }

  listTeamGames(seasonId: string, teamId: string): GameRow[] {
    return this.db
      .select()
      .from(gamesTable)
      .where(
        and(
          eq(gamesTable.seasonId, seasonId),
          or(eq(gamesTable.homeTeamId, teamId), eq(gamesTable.awayTeamId, teamId))
        )
      )
      .orderBy(asc(gamesTable.round))
      .all();
  }

  /** Partidos sin jugar cuya fecha ya ha llegado o pasado. */
  listPendingGamesUpTo(seasonId: string, date: Date): GameRow[] {
    return this.db
      .select()
      .from(gamesTable)
      .where(
        and(
          eq(gamesTable.seasonId, seasonId),
          isNull(gamesTable.homeScore),
          lte(gamesTable.scheduledOn, date)
        )
      )
      .orderBy(asc(gamesTable.scheduledOn), asc(gamesTable.id))
      .all();
  }

  /** Fecha del próximo partido sin jugar, para poder saltarse los días vacíos. */
  nextScheduledDate(seasonId: string): Date | null {
    const row = this.db
      .select({ scheduledOn: gamesTable.scheduledOn })
      .from(gamesTable)
      .where(and(eq(gamesTable.seasonId, seasonId), isNull(gamesTable.homeScore)))
      .orderBy(asc(gamesTable.scheduledOn))
      .get();

    return row?.scheduledOn ?? null;
  }
}
