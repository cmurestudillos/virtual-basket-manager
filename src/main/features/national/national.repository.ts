import { and, asc, eq, inArray, isNotNull, isNull } from 'drizzle-orm';
import type { SaveDatabase } from '../../database/save-database';
import {
  competitionsTable,
  gamesTable,
  gameStateTable,
  nationalCallupsTable,
  nationalGroupsTable,
  nationalSpellsTable,
  playersTable,
  rotationSlotsTable,
  seasonsTable,
  teamsTable,
  type CompetitionRow,
  type GameRow,
  type NationalGroupRow,
  type NationalSpellRow,
  type NewGameRow,
  type NewRotationSlotRow,
  type NewTeamRow,
  type PlayerRow,
  type SeasonRow,
  type TeamRow
} from '../../database/schema/save';

/** Las consultas de las selecciones. */
export class NationalRepository {
  constructor(private readonly db: SaveDatabase) {}

  gameState(): {
    seasonNumber: number;
    currentDate: Date;
    dismissalEnabled: boolean;
    careerMode: boolean;
    managedTeamId: string | null;
  } {
    const state = this.db.select().from(gameStateTable).get();
    if (!state) {
      throw new Error('La partida no tiene estado de juego');
    }
    return {
      seasonNumber: state.seasonNumber,
      currentDate: state.currentDate,
      dismissalEnabled: state.dismissalEnabled,
      careerMode: state.careerMode,
      managedTeamId: state.managedTeamId
    };
  }

  // --- Competiciones y temporadas -------------------------------------------

  listCompetitions(): CompetitionRow[] {
    return this.db.select().from(competitionsTable).all();
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

  insertCompetition(row: CompetitionRow): void {
    this.db.insert(competitionsTable).values(row).run();
  }

  findSeasonOf(competitionId: string, seasonNumber: number): SeasonRow | null {
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

  seasonsOf(competitionId: string): SeasonRow[] {
    return this.db
      .select()
      .from(seasonsTable)
      .where(eq(seasonsTable.competitionId, competitionId))
      .orderBy(asc(seasonsTable.seasonNumber))
      .all();
  }

  insertSeason(row: SeasonRow): void {
    this.db.insert(seasonsTable).values(row).run();
  }

  setStage(seasonId: string, stage: string): void {
    this.db.update(seasonsTable).set({ stage }).where(eq(seasonsTable.id, seasonId)).run();
  }

  setChampion(seasonId: string, teamId: string): void {
    this.db
      .update(seasonsTable)
      .set({ championTeamId: teamId })
      .where(eq(seasonsTable.id, seasonId))
      .run();
  }

  insertGroups(rows: readonly NationalGroupRow[]): void {
    for (const row of rows) {
      this.db.insert(nationalGroupsTable).values(row).run();
    }
  }

  groupsOf(seasonId: string): NationalGroupRow[] {
    return this.db
      .select()
      .from(nationalGroupsTable)
      .where(eq(nationalGroupsTable.seasonId, seasonId))
      .orderBy(asc(nationalGroupsTable.groupName), asc(nationalGroupsTable.pot))
      .all();
  }

  insertGames(rows: readonly NewGameRow[]): void {
    for (const row of rows) {
      this.db.insert(gamesTable).values(row).run();
    }
  }

  listGames(seasonId: string): GameRow[] {
    return this.db
      .select()
      .from(gamesTable)
      .where(eq(gamesTable.seasonId, seasonId))
      .orderBy(asc(gamesTable.scheduledOn), asc(gamesTable.id))
      .all();
  }

  // --- Selecciones y jugadores ------------------------------------------------

  nationalTeams(): TeamRow[] {
    return this.db
      .select()
      .from(teamsTable)
      .where(isNotNull(teamsTable.nationalOf))
      .orderBy(asc(teamsTable.id))
      .all();
  }

  findTeam(teamId: string): TeamRow | null {
    return this.db.select().from(teamsTable).where(eq(teamsTable.id, teamId)).get() ?? null;
  }

  insertTeam(row: NewTeamRow): void {
    this.db.insert(teamsTable).values(row).run();
  }

  setReputation(teamId: string, reputation: number): void {
    this.db.update(teamsTable).set({ reputation }).where(eq(teamsTable.id, teamId)).run();
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

  /** Los jugadores de primer equipo, con o sin club: la cantera no va a la selección. */
  seniorPlayers(): PlayerRow[] {
    return this.db.select().from(playersTable).where(eq(playersTable.isYouth, false)).all();
  }

  playersByIds(ids: readonly string[]): PlayerRow[] {
    if (ids.length === 0) {
      return [];
    }
    return this.db
      .select()
      .from(playersTable)
      .where(inArray(playersTable.id, [...ids]))
      .all();
  }

  /** Club y liga de cada club, para saber si suelta a sus jugadores. */
  clubLeagues(): Map<string, { name: string; country: string; competitionName: string }> {
    return new Map(
      this.db
        .select({ team: teamsTable, competition: competitionsTable })
        .from(teamsTable)
        .innerJoin(competitionsTable, eq(competitionsTable.id, teamsTable.competitionId))
        .where(isNull(teamsTable.nationalOf))
        .all()
        .map((row) => [
          row.team.id,
          {
            name: row.team.name,
            country: row.competition.country,
            competitionName: row.competition.name
          }
        ])
    );
  }

  /** Los clubes que juegan alguna competición continental en un curso. */
  continentalClubIds(seasonNumber: number): Set<string> {
    const rows = this.db
      .select({ home: gamesTable.homeTeamId, away: gamesTable.awayTeamId })
      .from(gamesTable)
      .innerJoin(seasonsTable, eq(seasonsTable.id, gamesTable.seasonId))
      .innerJoin(competitionsTable, eq(competitionsTable.id, seasonsTable.competitionId))
      .where(
        and(
          eq(seasonsTable.seasonNumber, seasonNumber),
          eq(competitionsTable.format, 'continental')
        )
      )
      .all();
    return new Set(rows.flatMap((row) => [row.home, row.away]));
  }

  // --- Convocatorias ----------------------------------------------------------

  callups(seasonNumber: number, window: string): { teamId: string; playerId: string }[] {
    return this.db
      .select({
        teamId: nationalCallupsTable.nationalTeamId,
        playerId: nationalCallupsTable.playerId
      })
      .from(nationalCallupsTable)
      .where(
        and(
          eq(nationalCallupsTable.seasonNumber, seasonNumber),
          eq(nationalCallupsTable.window, window)
        )
      )
      .all();
  }

  replaceCallups(
    teamId: string,
    seasonNumber: number,
    window: string,
    playerIds: readonly string[]
  ): void {
    this.db.transaction((tx) => {
      tx.delete(nationalCallupsTable)
        .where(
          and(
            eq(nationalCallupsTable.nationalTeamId, teamId),
            eq(nationalCallupsTable.seasonNumber, seasonNumber),
            eq(nationalCallupsTable.window, window)
          )
        )
        .run();
      for (const playerId of playerIds) {
        tx.insert(nationalCallupsTable)
          .values({
            id: `${teamId}-${seasonNumber}-${window}-${playerId}`,
            nationalTeamId: teamId,
            playerId,
            seasonNumber,
            window
          })
          .run();
      }
    });
  }

  replaceRotation(teamId: string, rows: readonly NewRotationSlotRow[]): void {
    this.db.transaction((tx) => {
      tx.delete(rotationSlotsTable).where(eq(rotationSlotsTable.teamId, teamId)).run();
      for (const row of rows) {
        tx.insert(rotationSlotsTable).values(row).run();
      }
    });
  }

  // --- Etapas del usuario -----------------------------------------------------

  spells(): NationalSpellRow[] {
    return this.db
      .select()
      .from(nationalSpellsTable)
      .orderBy(asc(nationalSpellsTable.startSeason))
      .all();
  }

  openSpell(): NationalSpellRow | null {
    return (
      this.db
        .select()
        .from(nationalSpellsTable)
        .where(isNull(nationalSpellsTable.endSeason))
        .get() ?? null
    );
  }

  insertSpell(row: NationalSpellRow): void {
    this.db.insert(nationalSpellsTable).values(row).run();
  }

  closeSpell(id: string, endSeason: number, endReason: string): void {
    this.db
      .update(nationalSpellsTable)
      .set({ endSeason, endReason })
      .where(eq(nationalSpellsTable.id, id))
      .run();
  }
}
