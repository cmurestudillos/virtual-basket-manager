import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  closeSaveDatabase,
  openSaveDatabase,
  type SaveDatabase
} from '../../../database/save-database';
import { gamesTable, gamePlayerStatsTable } from '../../../database/schema/save';
import { loadDataset } from '../../saves/dataset';
import { seedSave } from '../../saves/save-seeder';
import { MatchService } from '../../match/match.service';
import { SeasonService } from '../season.service';

/**
 * Temporada entera contra SQLite de verdad, sin Electron.
 *
 * Es la comprobación que importa de la fase 1: calendario, avance del reloj,
 * simulación de los partidos de la IA, parada en el partido del usuario,
 * guardado del acta y clasificación, todo junto. Cualquiera de esas piezas
 * puede pasar sus tests unitarios y aun así no encajar con las demás.
 */

const MIGRATIONS = resolve('drizzle/save');
const SEED_DIRECTORY = resolve('resources/seed-data');
const MANAGED_TEAM = 'team-1';

let directory: string;
let filePath: string;
let db: SaveDatabase;
let season: SeasonService;
let match: MatchService;

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'vbm-season-'));
  filePath = join(directory, 'partida.sqlite');
  db = openSaveDatabase(filePath, MIGRATIONS);
  seedSave(db, loadDataset(SEED_DIRECTORY), {
    managedTeamId: MANAGED_TEAM,
    managerName: 'Carlos'
  });

  const resolveDb = (): SaveDatabase => db;
  season = new SeasonService(resolveDb);
  match = new MatchService(resolveDb);
});

afterEach(() => {
  closeSaveDatabase(filePath);
  rmSync(directory, { recursive: true, force: true });
});

/** Juega el partido del usuario cuarto a cuarto, como haría él a botonazos. */
function playUserGame(gameId: string): number {
  match.start(gameId);
  let state = match.advancePeriod(gameId);
  let guard = 0;
  while (!state.finished && guard < 10) {
    state = match.advancePeriod(gameId);
    guard += 1;
  }
  return state.playedPeriods;
}

describe('SeasonService', () => {
  it('crea el calendario de la temporada la primera vez que se le pregunta', () => {
    const current = season.getCurrent();

    expect(current.competitionName).toBe('Liga Nacional');
    expect(current.seasonNumber).toBe(1);
    expect(current.totalRounds).toBe(34);
    expect(db.select().from(gamesTable).all()).toHaveLength(306); // 34 * 9
  });

  it('no vuelve a generar el calendario en llamadas siguientes', () => {
    const first = season.getCurrent();
    season.getStandings();
    const second = season.getCurrent();

    expect(second.id).toBe(first.id);
    expect(db.select().from(gamesTable).all()).toHaveLength(306);
  });

  it('para en seco cuando le toca jugar al equipo del usuario', () => {
    const result = season.advanceToNextGame();

    expect(result.status).toBe('userGame');
    if (result.status === 'userGame') {
      const fixture = season.listFixtures(1).find((entry) => entry.gameId === result.gameId);
      expect(fixture?.involvesManaged).toBe(true);
    }
  });

  it('se salta la pretemporada hasta la primera jornada', () => {
    // La partida empieza el 1 de septiembre y la liga arranca a finales de mes:
    // avanzar un día en pretemporada no juega nada, sólo pasa el día.
    const result = season.advanceDay();

    expect(result.status).toBe('advanced');
    if (result.status === 'advanced') {
      expect(result.playedGameIds).toHaveLength(0);
      expect(new Date(result.date).getUTCDate()).toBe(2);
    }
  });

  it('no deja avanzar el día mientras el partido del usuario siga sin jugarse', () => {
    const first = season.advanceToNextGame();
    const second = season.advanceDay();

    expect(first.status).toBe('userGame');
    expect(second).toEqual(first);
  });

  it('juega el resto de la jornada cuando el usuario ya ha jugado el suyo', () => {
    const stop = season.advanceToNextGame();
    expect(stop.status).toBe('userGame');
    if (stop.status !== 'userGame') return;

    const periods = playUserGame(stop.gameId);
    expect(periods).toBeGreaterThanOrEqual(4);

    const after = season.advanceDay();
    expect(after.status).toBe('advanced');
    if (after.status === 'advanced') {
      // Los otros ocho partidos de la jornada, ya sin el del usuario.
      expect(after.playedGameIds).toHaveLength(8);
    }
  });

  // Son los 306 partidos de liga más los del cuadro, todos simulados posesión a
  // posesión y con su acta escrita en SQLite: no cabe en el tiempo por defecto.
  it('juega una temporada completa de 34 jornadas', { timeout: 180_000 }, () => {
    let guard = 0;
    for (;;) {
      guard += 1;
      expect(guard).toBeLessThan(500);

      const result = season.advanceToNextGame();
      if (result.status === 'seasonOver') {
        break;
      }
      if (result.status === 'userGame') {
        playUserGame(result.gameId);
      }
    }

    const games = db.select().from(gamesTable).all();
    // La liga regular son 306; el resto, ya jugados, son los de los playoffs.
    expect(games.filter((game) => game.seriesId === null)).toHaveLength(306);
    expect(games.every((game) => game.homeScore !== null)).toBe(true);

    // Hasta 24 fichas por partido, y menos cuando hay gente en la enfermería:
    // un lesionado no se viste, así que no aparece en el acta.
    const lines = db.select().from(gamePlayerStatsTable).all();
    expect(lines.length).toBeLessThanOrEqual(games.length * 24);
    expect(lines.length).toBeGreaterThan(games.length * 21);

    const standings = season.getStandings();
    expect(standings).toHaveLength(18);
    expect(standings.every((row) => row.played === 34)).toBe(true);
    // Victorias y derrotas se reparten: 18 equipos x 34 partidos / 2.
    const totalWins = standings.reduce((sum, row) => sum + row.won, 0);
    expect(totalWins).toBe(306);
    // La liga no acaba con todos iguales: hay campeón y hay colista.
    expect(standings[0]!.won).toBeGreaterThan(standings[17]!.won);
  });

  it('la clasificación cuadra puntos a favor con puntos en contra', () => {
    season.advanceToNextGame();
    const stop = season.advanceDay();
    if (stop.status === 'userGame') {
      playUserGame(stop.gameId);
    }
    season.advanceDay();

    const standings = season.getStandings();
    const scored = standings.reduce((sum, row) => sum + row.pointsFor, 0);
    const conceded = standings.reduce((sum, row) => sum + row.pointsAgainst, 0);

    expect(scored).toBe(conceded);
  });

  it('el próximo partido del usuario es siempre suyo y está sin jugar', () => {
    const next = season.getNextGame();

    expect(next).not.toBeNull();
    expect(next?.involvesManaged).toBe(true);
    expect(next?.played).toBe(false);
    expect(next?.round).toBe(1);
  });

  it('guarda el acta del partido que juega el usuario', () => {
    const stop = season.advanceToNextGame();
    if (stop.status !== 'userGame') throw new Error('debería haber parado');

    playUserGame(stop.gameId);
    const acta = match.get(stop.gameId);

    expect(acta).not.toBeNull();
    expect(acta?.finished).toBe(true);
    expect(acta?.managedSide).not.toBeNull();
    expect(acta?.home.boxScores).toHaveLength(12);
    // El marcador del acta cuadra con la suma de los puntos de cada jugador.
    const homePoints = acta!.home.boxScores.reduce((sum, line) => sum + line.points, 0);
    expect(homePoints).toBe(acta!.home.score);
    // Y con la suma de los parciales por cuarto.
    const fromPeriods = acta!.periods.reduce((sum, period) => sum + period.home, 0);
    expect(fromPeriods).toBe(acta!.home.score);
  });

  it('reproduce el mismo partido si se abandona a medias y se vuelve a empezar', () => {
    const stop = season.advanceToNextGame();
    if (stop.status !== 'userGame') throw new Error('debería haber parado');

    // Primera pasada: se juega un cuarto y se abandona (cerrar la aplicación).
    match.start(stop.gameId);
    const primerCuarto = match.advancePeriod(stop.gameId).periods[0];

    // Segunda pasada: el partido sigue sin jugar y sale exactamente igual.
    match.start(stop.gameId);
    const otraVez = match.advancePeriod(stop.gameId).periods[0];

    expect(otraVez).toEqual(primerCuarto);
  });
});
