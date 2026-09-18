import { and, asc, eq, isNotNull, isNull, like } from 'drizzle-orm';
import type { SaveDatabase } from '../../database/save-database';
import {
  coachesTable,
  coachSeasonsTable,
  competitionsTable,
  gamesTable,
  gameStateTable,
  seasonsTable,
  teamsTable,
  type CoachRow,
  type CoachSeasonRow,
  type CompetitionRow,
  type NewCoachRow,
  type NewCoachSeasonRow,
  type SeasonRow,
  type TeamRow
} from '../../database/schema/save';

/** Un partido jugado, sólo con lo que miran las cuentas de los entrenadores. */
export interface CoachGame {
  id: string;
  seasonId: string;
  round: number;
  scheduledOn: Date;
  homeTeamId: string;
  awayTeamId: string;
  homeScore: number;
  awayScore: number;
  seriesId: string | null;
}

/** Las cifras de un tramo al congelarlo. */
export interface FrozenStint {
  endDate: Date;
  endReason: string | null;
  games: number;
  wins: number;
  position: number | null;
  teams: number;
  tier: number;
  clubReputation: number;
  titleNames: string[];
  points: number;
}

/** Las consultas de los entrenadores y sus tramos. */
export class CoachRepository {
  constructor(private readonly db: SaveDatabase) {}

  gameState(): {
    managedTeamId: string | null;
    managerName: string;
    managerNationality: string;
    currentDate: Date;
    seasonNumber: number;
    careerMode: boolean;
  } | null {
    const state = this.db.select().from(gameStateTable).get();
    if (!state) {
      return null;
    }
    return {
      managedTeamId: state.managedTeamId,
      managerName: state.managerName,
      managerNationality: state.managerNationality,
      currentDate: state.currentDate,
      seasonNumber: state.seasonNumber,
      careerMode: state.careerMode
    };
  }

  // --- Entrenadores -----------------------------------------------------------

  isEmpty(): boolean {
    return this.db.select({ id: coachesTable.id }).from(coachesTable).limit(1).get() === undefined;
  }

  all(): CoachRow[] {
    return this.db.select().from(coachesTable).orderBy(asc(coachesTable.id)).all();
  }

  findById(coachId: string): CoachRow | null {
    return this.db.select().from(coachesTable).where(eq(coachesTable.id, coachId)).get() ?? null;
  }

  /** Quién se sienta en el banquillo de cada club. */
  benches(): Map<string, CoachRow> {
    return new Map(
      this.db
        .select()
        .from(coachesTable)
        .where(isNotNull(coachesTable.teamId))
        .all()
        .map((row) => [row.teamId as string, row])
    );
  }

  /** El número más alto de los libres, para seguir la cuenta de los ids. */
  lastFreeIndex(prefix: string): number {
    return this.db
      .select({ id: coachesTable.id })
      .from(coachesTable)
      .where(like(coachesTable.id, `${prefix}%`))
      .all()
      .reduce((max, row) => Math.max(max, Number(row.id.slice(prefix.length)) || 0), 0);
  }

  insertCoaches(rows: readonly NewCoachRow[]): void {
    if (rows.length === 0) {
      return;
    }
    this.db.transaction((tx) => {
      for (const row of rows) {
        tx.insert(coachesTable).values(row).run();
      }
    });
  }

  setTeam(coachId: string, teamId: string | null): void {
    this.db.update(coachesTable).set({ teamId }).where(eq(coachesTable.id, coachId)).run();
  }

  retire(coachId: string): void {
    this.db
      .update(coachesTable)
      .set({ teamId: null, retired: true })
      .where(eq(coachesTable.id, coachId))
      .run();
  }

  updateCoach(coachId: string, fields: Partial<NewCoachRow>): void {
    this.db.update(coachesTable).set(fields).where(eq(coachesTable.id, coachId)).run();
  }

  // --- Tramos -----------------------------------------------------------------

  /** Los tramos que siguen abiertos: uno por entrenador con banquillo. */
  openStints(): CoachSeasonRow[] {
    return this.db.select().from(coachSeasonsTable).where(isNull(coachSeasonsTable.endDate)).all();
  }

  stintsOfSeason(seasonNumber: number): CoachSeasonRow[] {
    return this.db
      .select()
      .from(coachSeasonsTable)
      .where(eq(coachSeasonsTable.seasonNumber, seasonNumber))
      .orderBy(asc(coachSeasonsTable.startDate))
      .all();
  }

  stintsOfCoach(coachId: string): CoachSeasonRow[] {
    return this.db
      .select()
      .from(coachSeasonsTable)
      .where(eq(coachSeasonsTable.coachId, coachId))
      .orderBy(asc(coachSeasonsTable.seasonNumber), asc(coachSeasonsTable.startDate))
      .all();
  }

  /** Los tramos de cursos cerrados: de ahí salen la reputación y el palmarés. */
  closedStints(): CoachSeasonRow[] {
    return this.db
      .select()
      .from(coachSeasonsTable)
      .where(eq(coachSeasonsTable.closed, true))
      .orderBy(asc(coachSeasonsTable.seasonNumber), asc(coachSeasonsTable.startDate))
      .all();
  }

  /** Cursos con tramos sin congelar, por si alguno se quedó atrás. */
  unfrozenSeasons(): number[] {
    return [
      ...new Set(
        this.db
          .select({ seasonNumber: coachSeasonsTable.seasonNumber })
          .from(coachSeasonsTable)
          .where(eq(coachSeasonsTable.closed, false))
          .all()
          .map((row) => row.seasonNumber)
      )
    ].sort((a, b) => a - b);
  }

  insertStints(rows: readonly NewCoachSeasonRow[]): void {
    if (rows.length === 0) {
      return;
    }
    this.db.transaction((tx) => {
      for (const row of rows) {
        tx.insert(coachSeasonsTable).values(row).run();
      }
    });
  }

  closeStint(stintId: string, endDate: Date, endReason: string | null): void {
    this.db
      .update(coachSeasonsTable)
      .set({ endDate, endReason })
      .where(eq(coachSeasonsTable.id, stintId))
      .run();
  }

  /** Apunta las cifras de un tramo al cerrar el curso: ya no se recalculan. */
  freezeStints(rows: readonly { id: string; figures: FrozenStint }[]): void {
    if (rows.length === 0) {
      return;
    }
    this.db.transaction((tx) => {
      for (const { id, figures } of rows) {
        tx.update(coachSeasonsTable)
          .set({
            closed: true,
            endDate: figures.endDate,
            endReason: figures.endReason,
            games: figures.games,
            wins: figures.wins,
            position: figures.position,
            teams: figures.teams,
            tier: figures.tier,
            clubReputation: figures.clubReputation,
            titles: figures.titleNames.length,
            titleNames: JSON.stringify(figures.titleNames),
            points: figures.points
          })
          .where(eq(coachSeasonsTable.id, id))
          .run();
      }
    });
  }

  // --- El mundo ---------------------------------------------------------------

  /** Los clubes de liga con su competición: las selecciones no tienen entrenador de la IA. */
  leagueClubs(): { team: TeamRow; competition: CompetitionRow }[] {
    return this.db
      .select({ team: teamsTable, competition: competitionsTable })
      .from(teamsTable)
      .innerJoin(competitionsTable, eq(competitionsTable.id, teamsTable.competitionId))
      .where(and(isNull(teamsTable.nationalOf), eq(competitionsTable.format, 'league')))
      .orderBy(asc(teamsTable.id))
      .all();
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

  teams(): Map<string, TeamRow> {
    return new Map(
      this.db
        .select()
        .from(teamsTable)
        .all()
        .map((row) => [row.id, row])
    );
  }

  seasonsOf(seasonNumber: number): SeasonRow[] {
    return this.db
      .select()
      .from(seasonsTable)
      .where(eq(seasonsTable.seasonNumber, seasonNumber))
      .all();
  }

  /** Año de arranque de cada curso de la partida. */
  startYears(): Map<number, number> {
    const years = new Map<number, number>();
    for (const row of this.db
      .select({ seasonNumber: seasonsTable.seasonNumber, startYear: seasonsTable.startYear })
      .from(seasonsTable)
      .all()) {
      years.set(row.seasonNumber, row.startYear);
    }
    return years;
  }

  /**
   * Los partidos jugados de un curso, de todas las competiciones. Sin el acta
   * ni la retransmisión, que pesan y aquí no se miran.
   */
  playedGames(seasonNumber: number): CoachGame[] {
    return this.db
      .select({
        id: gamesTable.id,
        seasonId: gamesTable.seasonId,
        round: gamesTable.round,
        scheduledOn: gamesTable.scheduledOn,
        homeTeamId: gamesTable.homeTeamId,
        awayTeamId: gamesTable.awayTeamId,
        homeScore: gamesTable.homeScore,
        awayScore: gamesTable.awayScore,
        seriesId: gamesTable.seriesId
      })
      .from(gamesTable)
      .innerJoin(seasonsTable, eq(seasonsTable.id, gamesTable.seasonId))
      .where(
        and(
          eq(seasonsTable.seasonNumber, seasonNumber),
          isNotNull(gamesTable.homeScore),
          isNotNull(gamesTable.awayScore)
        )
      )
      .all() as CoachGame[];
  }

  /** Los partidos de liga regular jugados de una temporada. */
  playedRegularGames(seasonId: string): CoachGame[] {
    return this.playedGamesWhere(
      and(eq(gamesTable.seasonId, seasonId), isNull(gamesTable.seriesId))
    );
  }

  /** Clubes de una liga. */
  teamIdsInCompetition(competitionId: string): string[] {
    return this.db
      .select({ id: teamsTable.id })
      .from(teamsTable)
      .where(eq(teamsTable.competitionId, competitionId))
      .orderBy(asc(teamsTable.id))
      .all()
      .map((row) => row.id);
  }

  private playedGamesWhere(condition: ReturnType<typeof and>): CoachGame[] {
    return this.db
      .select({
        id: gamesTable.id,
        seasonId: gamesTable.seasonId,
        round: gamesTable.round,
        scheduledOn: gamesTable.scheduledOn,
        homeTeamId: gamesTable.homeTeamId,
        awayTeamId: gamesTable.awayTeamId,
        homeScore: gamesTable.homeScore,
        awayScore: gamesTable.awayScore,
        seriesId: gamesTable.seriesId
      })
      .from(gamesTable)
      .where(and(condition, isNotNull(gamesTable.homeScore), isNotNull(gamesTable.awayScore)))
      .all() as CoachGame[];
  }
}
