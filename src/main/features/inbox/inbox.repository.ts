import { and, asc, desc, eq, inArray, isNotNull, isNull, lt, or } from 'drizzle-orm';
import type { SaveDatabase } from '../../database/save-database';
import {
  boardTable,
  competitionsTable,
  gamesTable,
  gameStateTable,
  inboxMessagesTable,
  playersTable,
  pressConferencesTable,
  seasonsTable,
  teamsTable,
  type GameRow,
  type InboxMessageRow,
  type NewInboxMessageRow,
  type NewPressConferenceRow,
  type PressConferenceRow
} from '../../database/schema/save';

/** Avisos que se conservan: más allá, los leídos más viejos se borran. */
export const INBOX_KEEP = 250;

export class InboxRepository {
  constructor(private readonly db: SaveDatabase) {}

  gameState(): {
    managedTeamId: string | null;
    currentDate: Date;
    seasonNumber: number;
    snapshot: string | null;
  } {
    const state = this.db.select().from(gameStateTable).get();
    return {
      managedTeamId: state?.managedTeamId ?? null,
      currentDate: state?.currentDate ?? new Date(),
      seasonNumber: state?.seasonNumber ?? 1,
      snapshot: state?.inboxSnapshot ?? null
    };
  }

  saveSnapshot(json: string): void {
    this.db.update(gameStateTable).set({ inboxSnapshot: json }).run();
  }

  // --- Lo que entra en la foto del club --------------------------------------

  /** El primer equipo: los juveniles no se visten y no son noticia. */
  squad(teamId: string): {
    id: string;
    firstName: string;
    lastName: string;
    injuryDaysLeft: number;
    injuryName: string | null;
    contractUntil: Date | null;
    morale: number;
  }[] {
    return this.db
      .select({
        id: playersTable.id,
        firstName: playersTable.firstName,
        lastName: playersTable.lastName,
        injuryDaysLeft: playersTable.injuryDaysLeft,
        injuryName: playersTable.injuryName,
        contractUntil: playersTable.contractUntil,
        morale: playersTable.morale
      })
      .from(playersTable)
      .where(and(eq(playersTable.teamId, teamId), eq(playersTable.isYouth, false)))
      .all();
  }

  board(teamId: string): { confidence: number; dismissed: boolean } | null {
    const row = this.db.select().from(boardTable).where(eq(boardTable.teamId, teamId)).get();
    return row ? { confidence: row.confidence, dismissed: row.dismissed } : null;
  }

  team(teamId: string): { competitionId: string; name: string } | null {
    const row = this.db.select().from(teamsTable).where(eq(teamsTable.id, teamId)).get();
    return row ? { competitionId: row.competitionId, name: row.name } : null;
  }

  /** Temporadas ya decididas de la temporada en curso, con su campeón. */
  champions(seasonNumber: number): { seasonId: string; championTeamId: string }[] {
    return this.db
      .select({ seasonId: seasonsTable.id, championTeamId: seasonsTable.championTeamId })
      .from(seasonsTable)
      .where(
        and(eq(seasonsTable.seasonNumber, seasonNumber), isNotNull(seasonsTable.championTeamId))
      )
      .all() as { seasonId: string; championTeamId: string }[];
  }

  // --- Nombres para escribir los avisos -------------------------------------

  playerNames(ids: readonly string[]): Map<string, string> {
    if (ids.length === 0) {
      return new Map();
    }
    return new Map(
      this.db
        .select({
          id: playersTable.id,
          firstName: playersTable.firstName,
          lastName: playersTable.lastName
        })
        .from(playersTable)
        .where(inArray(playersTable.id, [...ids]))
        .all()
        .map((row) => [row.id, `${row.firstName} ${row.lastName}`])
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

  competitions(): Map<string, { name: string; tier: number }> {
    return new Map(
      this.db
        .select()
        .from(competitionsTable)
        .all()
        .map((row) => [row.id, { name: row.name, tier: row.tier }])
    );
  }

  seasonCompetitions(): Map<string, string> {
    return new Map(
      this.db
        .select({ id: seasonsTable.id, competitionId: seasonsTable.competitionId })
        .from(seasonsTable)
        .all()
        .map((row) => [row.id, row.competitionId])
    );
  }

  // --- Los partidos del club, para la prensa --------------------------------

  /** Partidos jugados del club, del más antiguo al más reciente. */
  playedGames(teamId: string): GameRow[] {
    return this.db
      .select()
      .from(gamesTable)
      .where(
        and(
          or(eq(gamesTable.homeTeamId, teamId), eq(gamesTable.awayTeamId, teamId)),
          isNotNull(gamesTable.homeScore)
        )
      )
      .orderBy(asc(gamesTable.scheduledOn), asc(gamesTable.id))
      .all();
  }

  lastPressGameId(): string | null {
    return (
      this.db
        .select({ gameId: pressConferencesTable.gameId })
        .from(pressConferencesTable)
        .orderBy(desc(pressConferencesTable.createdOn))
        .limit(1)
        .get()?.gameId ?? null
    );
  }

  // --- Avisos ---------------------------------------------------------------

  insertMessages(rows: readonly NewInboxMessageRow[]): void {
    if (rows.length === 0) {
      return;
    }
    this.db.transaction((tx) => {
      for (const row of rows) {
        tx.insert(inboxMessagesTable).values(row).run();
      }
    });
  }

  messages(): InboxMessageRow[] {
    return this.db
      .select()
      .from(inboxMessagesTable)
      .orderBy(desc(inboxMessagesTable.createdOn), desc(inboxMessagesTable.id))
      .all();
  }

  unreadCount(): number {
    return this.db
      .select({ id: inboxMessagesTable.id })
      .from(inboxMessagesTable)
      .where(eq(inboxMessagesTable.read, false))
      .all().length;
  }

  markRead(id: string): void {
    this.db
      .update(inboxMessagesTable)
      .set({ read: true })
      .where(eq(inboxMessagesTable.id, id))
      .run();
  }

  markAllRead(): void {
    this.db.update(inboxMessagesTable).set({ read: true }).run();
  }

  /**
   * Recorta la bandeja a los últimos avisos.
   *
   * Sin esto crece para siempre —diez temporadas son miles de lesiones y
   * fichajes—. Sólo se borran leídos: un aviso sin leer no desaparece por viejo.
   */
  trim(): void {
    const keep = this.messages().slice(0, INBOX_KEEP);
    const oldest = keep[keep.length - 1];
    if (!oldest || keep.length < INBOX_KEEP) {
      return;
    }
    this.db
      .delete(inboxMessagesTable)
      .where(
        and(eq(inboxMessagesTable.read, true), lt(inboxMessagesTable.createdOn, oldest.createdOn))
      )
      .run();
  }

  // --- Ruedas de prensa -----------------------------------------------------

  insertPress(row: NewPressConferenceRow): void {
    this.db.insert(pressConferencesTable).values(row).run();
  }

  findPress(id: string): PressConferenceRow | null {
    return (
      this.db.select().from(pressConferencesTable).where(eq(pressConferencesTable.id, id)).get() ??
      null
    );
  }

  /** Caducan las que quedaron sin contestar: sólo vale la última. */
  expireOpenPress(): void {
    this.db
      .update(pressConferencesTable)
      .set({ expired: true })
      .where(
        and(eq(pressConferencesTable.expired, false), isNull(pressConferencesTable.answerTone))
      )
      .run();
  }

  /** El aviso que abre una rueda de prensa, para darlo por leído al contestar. */
  markPressMessageRead(pressConferenceId: string): void {
    this.db
      .update(inboxMessagesTable)
      .set({ read: true })
      .where(eq(inboxMessagesTable.pressConferenceId, pressConferenceId))
      .run();
  }

  answerPress(id: string, tone: string, reaction: string): void {
    this.db
      .update(pressConferencesTable)
      .set({ answerTone: tone, reaction })
      .where(eq(pressConferencesTable.id, id))
      .run();
  }
}
