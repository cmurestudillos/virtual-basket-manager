import { randomUUID } from 'node:crypto';
import { isNotNull } from 'drizzle-orm';
import type { InboxMessage, InboxView, PressConference } from '@shared/contracts/inbox.contract';
import { MAX_SUPPORT, MIN_SUPPORT } from '@shared/domain/attendance';
import {
  diffSnapshots,
  expiringContractDrafts,
  type ClubSnapshot,
  type InboxCategory,
  type InboxDraft,
  type InboxNames,
  type InboxRoute
} from '@shared/domain/inbox';
import {
  PRESS_ANSWERS,
  PRESS_TONE_LABELS,
  currentStreak,
  pressAnswer,
  pressQuestion,
  pressReaction,
  pressTopicFor,
  type PressTone,
  type PressTopic
} from '@shared/domain/press';
import type { SaveDatabase } from '../../database/save-database';
import {
  teamsTable,
  type GameRow,
  type InboxMessageRow,
  type PressConferenceRow
} from '../../database/schema/save';
import { BoardService } from '../club/board.service';
import { CareerRepository } from '../career/career.repository';
import { ClubRepository } from '../club/club.repository';
import { InboxRepository } from './inbox.repository';
import { nationalSquad } from '../national/national-squad';

export class PressConferenceNotFoundError extends Error {
  constructor(id: string) {
    super(`No existe la rueda de prensa ${id}`);
    this.name = 'PressConferenceNotFoundError';
  }
}

export class PressConferenceClosedError extends Error {
  constructor() {
    super('Esa rueda de prensa ya no se puede contestar');
    this.name = 'PressConferenceClosedError';
  }
}

/** Partidos que se miran hacia atrás para saber la racha. */
const STREAK_WINDOW = 12;

/**
 * La bandeja y la prensa.
 *
 * Nada de aquí se entera de lo que pasa en el momento en que pasa: los avisos
 * salen de comparar la última foto del club con la de ahora, y la foto se
 * saca **al leer la bandeja**. Es el mismo truco que usa la carrera para enterarse
 * del despido, y por la misma razón: así ni la temporada ni el consejo ni el
 * mercado tienen que saber que existe una bandeja, y las reglas de qué es
 * noticia viven todas en un sitio.
 *
 * El precio es que lo que empieza y acaba entre dos lecturas no se ve: una
 * contusión de tres días que cabe entera en un «ir a la jornada» no deja aviso.
 * Es un precio razonable —esa lesión no le quitó ningún partido a nadie—, y la
 * pantalla lee la bandeja después de cada avance, así que el hueco es pequeño.
 */
export class InboxService {
  /** Ver el porqué del resolutor en {@link SeasonService}. */
  constructor(private readonly resolveDb: () => SaveDatabase) {}

  /** La bandeja al día. */
  get(): InboxView {
    this.sync();
    const repository = new InboxRepository(this.resolveDb());
    return {
      messages: repository.messages().map(toMessage),
      unread: repository.unreadCount()
    };
  }

  unreadCount(): number {
    this.sync();
    return new InboxRepository(this.resolveDb()).unreadCount();
  }

  markRead(id: string): InboxView {
    new InboxRepository(this.resolveDb()).markRead(id);
    return this.get();
  }

  markAllRead(): InboxView {
    new InboxRepository(this.resolveDb()).markAllRead();
    return this.get();
  }

  /**
   * Compara la foto guardada con la de ahora y apunta lo que haya cambiado.
   *
   * La primera vez no hay con qué comparar, así que sólo se guarda la foto: una
   * partida recién creada no empieza con doce avisos de «llega al club».
   */
  sync(): void {
    const db = this.resolveDb();
    const repository = new InboxRepository(db);
    const state = repository.gameState();
    if (!state.managedTeamId) {
      return;
    }

    const current = this.snapshot(
      repository,
      state.managedTeamId,
      state.seasonNumber,
      state.currentDate
    );
    const saved = parseSnapshot(state.snapshot);
    if (!saved) {
      repository.saveSnapshot(JSON.stringify(current));
      return;
    }

    // Sin banquillo, la plantilla que se compara es la del club que ya no
    // diriges: sus lesiones y fichajes no son asunto tuyo. El despido y los
    // campeones sí siguen siendo noticia.
    const offTheBench = current.dismissed || new CareerRepository(db).isUnemployed();

    const drafts: InboxDraft[] = diffSnapshots(
      saved,
      current,
      this.names(repository, saved, current)
    );

    if (offTheBench) {
      const clubNews = new Set<InboxCategory>(['injury', 'recovery', 'squad', 'contract']);
      for (let index = drafts.length - 1; index >= 0; index -= 1) {
        if (clubNews.has(drafts[index]!.category)) {
          drafts.splice(index, 1);
        }
      }
    }

    // Temporada nueva: los contratos que acaban este año, avisados a tiempo.
    if (
      !offTheBench &&
      current.seasonNumber !== saved.seasonNumber &&
      current.teamId === saved.teamId
    ) {
      drafts.push(...this.expiringContracts(repository, current, state.currentDate));
    }

    const messages = drafts.map((draft) =>
      toRow(draft, state.currentDate, state.seasonNumber, null)
    );

    // Partido nuevo del mismo club: quizá toca rueda de prensa.
    if (
      !offTheBench &&
      current.teamId === saved.teamId &&
      current.lastGameId &&
      current.lastGameId !== saved.lastGameId
    ) {
      const press = this.maybePress(db, repository, current, state.currentDate);
      if (press) {
        messages.push(press);
      }
    }

    repository.insertMessages(messages);
    repository.saveSnapshot(JSON.stringify(current));
    repository.trim();
  }

  // ------------------------------------------------------------------------
  // Ruedas de prensa
  // ------------------------------------------------------------------------

  getPress(id: string): PressConference | null {
    const row = new InboxRepository(this.resolveDb()).findPress(id);
    return row ? toPress(row) : null;
  }

  /**
   * Contesta a la prensa, y lo que digas se nota.
   *
   * La confianza pasa por el consejo —así respeta el despido— y el ambiente por
   * el club, dentro de su escala. El aviso de la rueda se da por leído.
   */
  answerPress(id: string, tone: PressTone): PressConference {
    const db = this.resolveDb();
    const repository = new InboxRepository(db);
    const row = repository.findPress(id);
    if (!row) {
      throw new PressConferenceNotFoundError(id);
    }
    if (row.expired || row.answerTone) {
      throw new PressConferenceClosedError();
    }

    const { effect } = pressAnswer(row.topic as PressTopic, tone);
    const state = repository.gameState();

    if (effect.confidence !== 0) {
      new BoardService(() => db).adjustConfidence(effect.confidence);
    }
    if (effect.support !== 0 && state.managedTeamId) {
      const club = new ClubRepository(db);
      const team = club.findTeam(state.managedTeamId);
      if (team) {
        const support = Math.max(
          MIN_SUPPORT,
          Math.min(MAX_SUPPORT, team.fanSupport + effect.support)
        );
        club.setFanSupport(state.managedTeamId, support);
      }
    }

    repository.answerPress(id, tone, pressReaction(effect));
    repository.markPressMessageRead(id);

    return toPress(repository.findPress(id) as PressConferenceRow);
  }

  // ------------------------------------------------------------------------

  /** Los del club que están en la lista de su selección para la ventana que toca. */
  private calledUp(squad: readonly string[], today: Date): Record<string, string> {
    const db = this.resolveDb();
    const called: Record<string, string> = {};
    const members = new Set(squad);
    for (const team of db.select().from(teamsTable).where(isNotNull(teamsTable.nationalOf)).all()) {
      for (const player of nationalSquad(db, team.id, today)) {
        if (members.has(player.id)) {
          called[player.id] = team.id;
        }
      }
    }
    return called;
  }

  /** La foto del club: sólo lo que da lugar a un aviso. */
  private snapshot(
    repository: InboxRepository,
    teamId: string,
    seasonNumber: number,
    today: Date
  ): ClubSnapshot {
    const squad = repository.squad(teamId);
    const board = repository.board(teamId);
    const games = repository.playedGames(teamId);

    const injured: ClubSnapshot['injured'] = {};
    for (const player of squad) {
      if (player.injuryDaysLeft > 0) {
        injured[player.id] = {
          name: player.injuryName ?? 'Lesión',
          days: player.injuryDaysLeft
        };
      }
    }

    const champions: ClubSnapshot['champions'] = {};
    for (const row of repository.champions(seasonNumber)) {
      champions[row.seasonId] = row.championTeamId;
    }

    return {
      teamId,
      competitionId: repository.team(teamId)?.competitionId ?? '',
      seasonNumber,
      date: today.getTime(),
      injured,
      squad: squad.map((player) => player.id).sort(),
      confidence: board?.confidence ?? 60,
      dismissed: board?.dismissed ?? false,
      champions,
      lastGameId: games[games.length - 1]?.id ?? null,
      calledUp: this.calledUp(
        squad.map((player) => player.id),
        today
      )
    };
  }

  /** Los nombres que necesitan los avisos, leídos de una vez. */
  private names(
    repository: InboxRepository,
    before: ClubSnapshot,
    after: ClubSnapshot
  ): InboxNames {
    const playerIds = new Set([
      ...before.squad,
      ...after.squad,
      ...Object.keys(before.injured),
      ...Object.keys(after.injured)
    ]);
    const players = repository.playerNames([...playerIds]);
    const teams = repository.teamNames();
    const competitions = repository.competitions();
    const seasons = repository.seasonCompetitions();

    return {
      player: (id) => players.get(id) ?? 'Un jugador',
      team: (id) => teams.get(id) ?? 'Otro equipo',
      competition: (id) => competitions.get(id)?.name ?? 'la competición',
      tier: (id) => competitions.get(id)?.tier ?? 1,
      seasonCompetition: (id) => seasons.get(id) ?? ''
    };
  }

  private expiringContracts(
    repository: InboxRepository,
    snapshot: ClubSnapshot,
    today: Date
  ): InboxDraft[] {
    // Acaba «este año» el que vence antes del próximo verano.
    const nextSummer = new Date(Date.UTC(today.getUTCFullYear() + 1, 6, 1));
    const expiring = repository
      .squad(snapshot.teamId)
      .filter((player) => player.contractUntil && player.contractUntil < nextSummer)
      .map((player) => ({ playerId: player.id, name: `${player.firstName} ${player.lastName}` }));

    return expiringContractDrafts(expiring, snapshot.seasonNumber);
  }

  /**
   * Si el último partido dio que hablar, abre una rueda de prensa y devuelve
   * su aviso. La anterior sin contestar caduca: sólo vale la última.
   */
  private maybePress(
    db: SaveDatabase,
    repository: InboxRepository,
    snapshot: ClubSnapshot,
    today: Date
  ) {
    const games = repository.playedGames(snapshot.teamId);
    const last = games[games.length - 1];
    if (!last || repository.lastPressGameId() === last.id) {
      return null;
    }

    const results = games.slice(-STREAK_WINDOW).map((game) => wonBy(game, snapshot.teamId));
    const isHome = last.homeTeamId === snapshot.teamId;
    const own = (isHome ? last.homeScore : last.awayScore) ?? 0;
    const rival = (isHome ? last.awayScore : last.homeScore) ?? 0;
    const rivalId = isHome ? last.awayTeamId : last.homeTeamId;

    const context = {
      won: own > rival,
      margin: own - rival,
      streak: currentStreak(results),
      isPlayoff: last.seriesId !== null,
      confidence: new InboxRepository(db).board(snapshot.teamId)?.confidence ?? 60,
      opponentName: repository.teamNames().get(rivalId) ?? 'el rival'
    };

    const topic = pressTopicFor(context);
    if (!topic) {
      return null;
    }

    repository.expireOpenPress();
    const id = randomUUID();
    const question = pressQuestion(topic, context);
    repository.insertPress({
      id,
      gameId: last.id,
      createdOn: today,
      topic,
      question,
      answerTone: null,
      reaction: null,
      expired: false
    });

    return toRow(
      { category: 'press', title: 'Rueda de prensa', body: question, route: null },
      today,
      snapshot.seasonNumber,
      id
    );
  }
}

function wonBy(game: GameRow, teamId: string): boolean {
  const home = game.homeScore ?? 0;
  const away = game.awayScore ?? 0;
  return game.homeTeamId === teamId ? home > away : away > home;
}

function parseSnapshot(json: string | null): ClubSnapshot | null {
  if (!json) {
    return null;
  }
  try {
    const parsed = JSON.parse(json) as ClubSnapshot;
    // Una foto de una versión anterior sin algún campo se completa, no se tira:
    // tirarla haría que el siguiente vistazo no avisara de nada.
    return {
      ...parsed,
      date: parsed.date ?? 0,
      lastGameId: parsed.lastGameId ?? null,
      champions: parsed.champions ?? {},
      calledUp: parsed.calledUp ?? {}
    };
  } catch {
    return null;
  }
}

function toRow(
  draft: InboxDraft,
  createdOn: Date,
  seasonNumber: number,
  pressConferenceId: string | null
) {
  return {
    id: randomUUID(),
    createdOn,
    seasonNumber,
    category: draft.category,
    title: draft.title,
    body: draft.body,
    routeName: draft.route?.name ?? null,
    routeParams: draft.route?.params ? JSON.stringify(draft.route.params) : null,
    read: false,
    pressConferenceId
  };
}

function toMessage(row: InboxMessageRow): InboxMessage {
  let route: InboxRoute | null = null;
  if (row.routeName) {
    route = { name: row.routeName };
    if (row.routeParams) {
      try {
        route.params = JSON.parse(row.routeParams) as Record<string, string>;
      } catch {
        // Sin parámetros legibles se lleva a la pantalla igualmente.
      }
    }
  }
  return {
    id: row.id,
    createdOn: row.createdOn.getTime(),
    category: row.category as InboxCategory,
    title: row.title,
    body: row.body,
    route,
    read: row.read,
    pressConferenceId: row.pressConferenceId
  };
}

function toPress(row: PressConferenceRow): PressConference {
  const topic = row.topic as PressTopic;
  return {
    id: row.id,
    createdOn: row.createdOn.getTime(),
    question: row.question,
    options: PRESS_ANSWERS[topic].map((answer) => ({
      tone: answer.tone,
      toneLabel: PRESS_TONE_LABELS[answer.tone],
      text: answer.text
    })),
    answeredTone: (row.answerTone as PressTone | null) ?? null,
    reaction: row.reaction,
    expired: row.expired
  };
}
