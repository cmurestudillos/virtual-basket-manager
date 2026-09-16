import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  closeSaveDatabase,
  openSaveDatabase,
  type SaveDatabase
} from '../../../database/save-database';
import {
  boardTable,
  careerSpellsTable,
  gameStateTable,
  gamesTable,
  playersTable,
  pressConferencesTable,
  teamsTable
} from '../../../database/schema/save';
import { loadDataset } from '../../saves/dataset';
import { seedSave } from '../../saves/save-seeder';
import { BoardService } from '../../club/board.service';
import { MatchService } from '../../match/match.service';
import { SeasonService } from '../../season/season.service';
import {
  InboxService,
  PressConferenceClosedError,
  PressConferenceNotFoundError
} from '../inbox.service';

/**
 * La bandeja contra una partida de verdad.
 *
 * Lo que pasa se provoca tocando la base —una lesión, un fichaje, un consejo
 * impaciente— y se comprueba que la bandeja lo cuenta al mirarla, que es
 * exactamente como funciona: no escucha a nadie, compara fotos.
 */

const MIGRATIONS = resolve('drizzle/save');
const SEED_DIRECTORY = resolve('resources/seed-data');
const MANAGED_TEAM = 'liga-nacional-1';

let directory: string;
let filePath: string;
let db: SaveDatabase;
let inbox: InboxService;
let season: SeasonService;
let match: MatchService;

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'vbm-inbox-'));
  filePath = join(directory, 'partida.sqlite');
  db = openSaveDatabase(filePath, MIGRATIONS);
  seedSave(db, loadDataset(SEED_DIRECTORY), {
    managedTeamId: MANAGED_TEAM,
    managerName: 'Carlos'
  });

  const resolveDb = (): SaveDatabase => db;
  season = new SeasonService(resolveDb);
  match = new MatchService(resolveDb);
  inbox = new InboxService(resolveDb);
  season.getCurrent();
});

afterEach(() => {
  closeSaveDatabase(filePath);
  rmSync(directory, { recursive: true, force: true });
});

/** Un día más en el calendario, como si hubiera pasado el tiempo. */
function advanceClock(): void {
  const state = db.select().from(gameStateTable).get()!;
  db.update(gameStateTable)
    .set({ currentDate: new Date(state.currentDate.getTime() + 24 * 60 * 60 * 1000) })
    .run();
}

function firstTeamPlayer(): string {
  return db
    .select()
    .from(playersTable)
    .all()
    .find((row) => row.teamId === MANAGED_TEAM && !row.isYouth)!.id;
}

function playNextUserGame(): string {
  for (let guard = 0; guard < 60; guard += 1) {
    const result = season.advanceToNextGame();
    if (result.status === 'userGame') {
      match.start(result.gameId);
      let state = match.advancePeriod(result.gameId);
      while (!state.finished) {
        state = match.advancePeriod(result.gameId);
      }
      return result.gameId;
    }
  }
  throw new Error('no llegó ningún partido');
}

describe('la primera vez', () => {
  it('una partida recién creada no empieza llena de avisos', () => {
    const view = inbox.get();

    expect(view.messages).toHaveLength(0);
    expect(view.unread).toBe(0);
  });
});

describe('lo que pasa, se cuenta', () => {
  beforeEach(() => {
    // La foto de partida: a partir de aquí, lo que cambie es noticia.
    inbox.get();
  });

  it('una lesión llega a la bandeja y lleva a la ficha del jugador', () => {
    const playerId = firstTeamPlayer();
    db.update(playersTable)
      .set({ injuryDaysLeft: 21, injuryName: 'Rotura fibrilar' })
      .where(eq(playersTable.id, playerId))
      .run();

    const view = inbox.get();
    const aviso = view.messages.find((message) => message.category === 'injury');

    expect(aviso).toBeDefined();
    expect(aviso!.body).toContain('Rotura fibrilar');
    expect(aviso!.route).toEqual({ name: 'player', params: { playerId } });
    expect(aviso!.read).toBe(false);
    expect(view.unread).toBe(1);
  });

  it('mirar dos veces no repite el aviso', () => {
    const playerId = firstTeamPlayer();
    db.update(playersTable)
      .set({ injuryDaysLeft: 10, injuryName: 'Esguince de tobillo' })
      .where(eq(playersTable.id, playerId))
      .run();

    inbox.get();
    const segunda = inbox.get();

    expect(segunda.messages.filter((message) => message.category === 'injury')).toHaveLength(1);
  });

  it('lo que el usuario mueve en su plantilla sin avanzar el día no se le cuenta', () => {
    const playerId = firstTeamPlayer();
    db.update(playersTable)
      .set({ teamId: 'liga-nacional-2' })
      .where(eq(playersTable.id, playerId))
      .run();

    expect(inbox.get().messages).toHaveLength(0);
  });

  it('un jugador que se lleva otro club es noticia', () => {
    const playerId = firstTeamPlayer();
    db.update(playersTable)
      .set({ teamId: 'liga-nacional-2' })
      .where(eq(playersTable.id, playerId))
      .run();
    // Lo ha movido el mundo, no el usuario: eso sólo pasa con el reloj en marcha.
    advanceClock();

    const titulos = inbox.get().messages.map((message) => message.title);

    expect(titulos.some((title) => title.includes('deja el club'))).toBe(true);
  });

  it('el consejo avisa al cruzar la raya de peligro', () => {
    new BoardService(() => db).ensureForSeason(1, 18);
    db.update(boardTable).set({ confidence: 60 }).run();
    inbox.get();

    db.update(boardTable).set({ confidence: 20 }).run();

    expect(inbox.get().messages.map((message) => message.title)).toContain(
      'El consejo se impacienta'
    );
  });

  it('se marca como leído uno, o todos a la vez', () => {
    const playerId = firstTeamPlayer();
    db.update(playersTable)
      .set({ injuryDaysLeft: 10, injuryName: 'Contusión' })
      .where(eq(playersTable.id, playerId))
      .run();
    db.update(boardTable).set({ confidence: 60 }).run();

    const view = inbox.get();
    const primero = view.messages[0]!;

    expect(inbox.markRead(primero.id).messages.find((m) => m.id === primero.id)!.read).toBe(true);
    expect(inbox.markAllRead().unread).toBe(0);
  });
});

describe('sin banquillo', () => {
  it('las lesiones del club que dejaste no son noticia, pero el mundo sigue contando', () => {
    // Partida de carrera con la etapa cerrada: el entrenador ya no dirige a nadie.
    db.update(gameStateTable).set({ careerMode: true }).run();
    inbox.get();
    db.update(careerSpellsTable).set({ endSeason: 1, endReason: 'left' }).run();

    const playerId = firstTeamPlayer();
    db.update(playersTable)
      .set({ injuryDaysLeft: 30, injuryName: 'Rotura fibrilar' })
      .where(eq(playersTable.id, playerId))
      .run();
    advanceClock();

    expect(inbox.get().messages.some((message) => message.category === 'injury')).toBe(false);
  });
});

describe('ruedas de prensa', () => {
  beforeEach(() => {
    inbox.get();
  });

  it('un partido normal no trae rueda de prensa', () => {
    const gameId = playNextUserGame();
    // Se deja el marcador en un partido corriente: ganar de cinco.
    const game = db.select().from(gamesTable).where(eq(gamesTable.id, gameId)).get()!;
    const own = game.homeTeamId === MANAGED_TEAM;
    db.update(gamesTable)
      .set(own ? { homeScore: 80, awayScore: 75 } : { homeScore: 75, awayScore: 80 })
      .where(eq(gamesTable.id, gameId))
      .run();

    const view = inbox.get();

    expect(view.messages.some((message) => message.category === 'press')).toBe(false);
  });

  it('una paliza sí, con la pregunta hecha a medida', () => {
    const gameId = playNextUserGame();
    const game = db.select().from(gamesTable).where(eq(gamesTable.id, gameId)).get()!;
    const own = game.homeTeamId === MANAGED_TEAM;
    db.update(gamesTable)
      .set(own ? { homeScore: 60, awayScore: 92 } : { homeScore: 92, awayScore: 60 })
      .where(eq(gamesTable.id, gameId))
      .run();

    const aviso = inbox.get().messages.find((message) => message.category === 'press');

    expect(aviso).toBeDefined();
    expect(aviso!.body).toContain('32');
    expect(aviso!.pressConferenceId).not.toBeNull();

    const rueda = inbox.getPress(aviso!.pressConferenceId!)!;
    expect(rueda.options).toHaveLength(3);
    expect(rueda.answeredTone).toBeNull();
    expect(rueda.expired).toBe(false);
  });

  it('contestar mueve la grada y el consejo, y no se puede contestar dos veces', () => {
    new BoardService(() => db).ensureForSeason(1, 18);
    const gameId = playNextUserGame();
    const game = db.select().from(gamesTable).where(eq(gamesTable.id, gameId)).get()!;
    const own = game.homeTeamId === MANAGED_TEAM;
    db.update(gamesTable)
      .set(own ? { homeScore: 60, awayScore: 92 } : { homeScore: 92, awayScore: 60 })
      .where(eq(gamesTable.id, gameId))
      .run();
    const pressId = inbox.get().messages.find((m) => m.category === 'press')!.pressConferenceId!;

    const gradaAntes = db.select().from(teamsTable).where(eq(teamsTable.id, MANAGED_TEAM)).get()!
      .fanSupport;
    db.update(boardTable).set({ confidence: 50 }).run();

    // Tras una paliza, exigir a los jugadores enciende a la grada y suma algo con el consejo.
    const contestada = inbox.answerPress(pressId, 'combative');

    expect(contestada.answeredTone).toBe('combative');
    expect(contestada.reaction).not.toBeNull();
    const gradaDespues = db.select().from(teamsTable).where(eq(teamsTable.id, MANAGED_TEAM)).get()!
      .fanSupport;
    expect(gradaDespues).toBe(gradaAntes + 2);
    expect(db.select().from(boardTable).get()!.confidence).toBe(51);

    // El aviso de la rueda de prensa queda leído.
    const aviso = inbox.get().messages.find((m) => m.pressConferenceId === pressId)!;
    expect(aviso.read).toBe(true);

    expect(() => inbox.answerPress(pressId, 'humble')).toThrow(PressConferenceClosedError);
  });

  it('una rueda de prensa inventada no existe', () => {
    expect(inbox.getPress('inventada')).toBeNull();
    expect(() => inbox.answerPress('inventada', 'humble')).toThrow(PressConferenceNotFoundError);
  });

  it('al llegar otra, la que quedó sin contestar caduca', () => {
    const paliza = (gameId: string): void => {
      const game = db.select().from(gamesTable).where(eq(gamesTable.id, gameId)).get()!;
      const own = game.homeTeamId === MANAGED_TEAM;
      db.update(gamesTable)
        .set(own ? { homeScore: 55, awayScore: 90 } : { homeScore: 90, awayScore: 55 })
        .where(eq(gamesTable.id, gameId))
        .run();
    };

    paliza(playNextUserGame());
    inbox.get();
    paliza(playNextUserGame());
    inbox.get();

    const ruedas = db.select().from(pressConferencesTable).all();
    expect(ruedas).toHaveLength(2);
    expect(ruedas.filter((row) => row.expired)).toHaveLength(1);
    expect(() => inbox.answerPress(ruedas.find((row) => row.expired)!.id, 'humble')).toThrow(
      PressConferenceClosedError
    );
  });
});
