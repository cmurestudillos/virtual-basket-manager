import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { PlayoffBracket } from '@shared/contracts/season.contract';
import { winsNeeded } from '@shared/domain/playoffs';
import {
  closeSaveDatabase,
  openSaveDatabase,
  type SaveDatabase
} from '../../../database/save-database';
import { boardTable, gamesTable } from '../../../database/schema/save';
import { loadDataset } from '../../saves/dataset';
import { seedSave } from '../../saves/save-seeder';
import { MatchService } from '../../match/match.service';
import { SeasonService } from '../season.service';

/**
 * Los playoffs de punta a punta: se juega la liga entera, se monta el cuadro,
 * se resuelven las tres rondas y se arranca la temporada siguiente.
 *
 * Se juega una sola vez para todo el fichero: son 306 partidos de liga más los
 * del cuadro, y repetirlos en cada test no comprobaría nada nuevo.
 */

const MIGRATIONS = resolve('drizzle/save');
const SEED_DIRECTORY = resolve('resources/seed-data');
const MANAGED_TEAM = 'team-1';

let directory: string;
let filePath: string;
let db: SaveDatabase;
let season: SeasonService;
let match: MatchService;

/** Clasificación al acabar la liga regular, antes de que empiecen los playoffs. */
let regularStandings: ReturnType<SeasonService['getStandings']>;
let bracketAtStart: PlayoffBracket;
let finalBracket: PlayoffBracket;

function openSave(prefix: string): void {
  directory = mkdtempSync(join(tmpdir(), prefix));
  filePath = join(directory, 'partida.sqlite');
  db = openSaveDatabase(filePath, MIGRATIONS);
  seedSave(db, loadDataset(SEED_DIRECTORY), {
    managedTeamId: MANAGED_TEAM,
    managerName: 'Carlos'
  });

  const resolveDb = (): SaveDatabase => db;
  season = new SeasonService(resolveDb);
  match = new MatchService(resolveDb);
}

function closeSave(): void {
  closeSaveDatabase(filePath);
  rmSync(directory, { recursive: true, force: true });
}

/** Juega hasta que el calendario se queda sin partidos, incluidos los del usuario. */
function playUntilOver(onUserGame?: () => void): void {
  for (let guard = 0; guard < 600; guard += 1) {
    const result = season.advanceToNextGame();
    // El despido también para el reloj: aquí se comprueban los playoffs, no la
    // paciencia del consejo, que tiene sus propios tests.
    if (result.status === 'seasonOver' || result.status === 'dismissed') {
      return;
    }
    if (result.status === 'userGame') {
      match.start(result.gameId);
      let state = match.advancePeriod(result.gameId);
      while (!state.finished) {
        state = match.advancePeriod(result.gameId);
      }
      onUserGame?.();
    }
  }
  throw new Error('la temporada no terminó');
}

describe('playoffs', () => {
  // 306 partidos de liga más el cuadro, todos posesión a posesión.
  beforeAll(() => {
    openSave('vbm-playoffs-');
    // Ver el porqué en el test de temporada completa: el consejo se queda fuera.
    season.getCurrent();
    db.delete(boardTable).run();

    // Liga regular completa: se para en cuanto aparece el cuadro.
    for (let guard = 0; guard < 600; guard += 1) {
      const result = season.advanceToNextGame();
      if (result.status === 'userGame') {
        match.start(result.gameId);
        let state = match.advancePeriod(result.gameId);
        while (!state.finished) {
          state = match.advancePeriod(result.gameId);
        }
      }
      if (season.getCurrent().stage !== 'regular') {
        break;
      }
      if (result.status === 'seasonOver' || result.status === 'dismissed') {
        break;
      }
    }

    regularStandings = season.getStandings();
    bracketAtStart = season.getPlayoffs() as PlayoffBracket;

    playUntilOver();
    finalBracket = season.getPlayoffs() as PlayoffBracket;
  }, 300_000);

  afterAll(closeSave);

  it('al acabar la liga regular la temporada entra en playoffs', () => {
    expect(bracketAtStart).not.toBeNull();
    expect(bracketAtStart.rounds[0]?.name).toBe('Cuartos de final');
    expect(bracketAtStart.rounds[0]?.series).toHaveLength(4);
    // La ronda siguiente no existe hasta que se sepa quién la juega.
    expect(bracketAtStart.rounds).toHaveLength(1);
  });

  it('los ocho clasificados y sus cruces salen de la liga regular', () => {
    const top8 = regularStandings.slice(0, 8).map((row) => row.teamId);
    const cuartos = bracketAtStart.rounds[0]?.series ?? [];

    expect(cuartos.map((series) => [series.higherSeed, series.lowerSeed])).toEqual([
      [1, 8],
      [2, 7],
      [3, 6],
      [4, 5]
    ]);
    expect(cuartos.map((series) => series.higherSeedTeamId)).toEqual(top8.slice(0, 4));
    expect(cuartos.map((series) => series.lowerSeedTeamId)).toEqual([...top8.slice(4)].reverse());
  });

  it('el factor cancha es del mejor clasificado: abre y cierra en casa', () => {
    for (const series of bracketAtStart.rounds[0]?.series ?? []) {
      expect(series.bestOf).toBe(3);
      expect(series.games[0]?.homeTeamId).toBe(series.higherSeedTeamId);
      expect(series.games[1]?.homeTeamId).toBe(series.lowerSeedTeamId);
      expect(series.games[2]?.homeTeamId).toBe(series.higherSeedTeamId);
    }
  });

  it('las series se juegan hasta ganarlas, y ni un partido más', () => {
    for (const round of finalBracket.rounds) {
      for (const series of round.series) {
        const wins = Math.max(series.higherSeedWins, series.lowerSeedWins);
        expect(wins).toBe(winsNeeded(series.bestOf));
        // Los partidos que sobraban al decidirse la serie no se quedan colgados.
        expect(series.games.every((game) => game.played)).toBe(true);
        expect(series.games).toHaveLength(series.higherSeedWins + series.lowerSeedWins);
      }
    }
  });

  it('el cuadro avanza ronda a ronda hasta la final', () => {
    expect(finalBracket.rounds.map((round) => round.name)).toEqual([
      'Cuartos de final',
      'Semifinales',
      'Final'
    ]);
    expect(finalBracket.rounds[1]?.series).toHaveLength(2);
    expect(finalBracket.rounds[2]?.series).toHaveLength(1);
    expect(finalBracket.rounds[1]?.bestOf).toBe(5);

    // Quien juega semifinales es quien ganó su cuarto de final.
    const ganadoresCuartos = new Set(
      (finalBracket.rounds[0]?.series ?? []).map((series) => series.winnerTeamId)
    );
    for (const series of finalBracket.rounds[1]?.series ?? []) {
      expect(ganadoresCuartos.has(series.higherSeedTeamId)).toBe(true);
      expect(ganadoresCuartos.has(series.lowerSeedTeamId)).toBe(true);
    }
  });

  it('corona campeón al ganador de la final', () => {
    const current = season.getCurrent();
    const final = finalBracket.rounds[2]?.series[0];

    expect(current.stage).toBe('finished');
    expect(current.championTeamId).toBe(final?.winnerTeamId);
    expect(current.championTeamName).not.toBeNull();
    expect(finalBracket.championTeamId).toBe(current.championTeamId);
  });

  it('los playoffs no tocan la clasificación de la liga regular', () => {
    const standings = season.getStandings();

    expect(standings.every((row) => row.played === 34)).toBe(true);
    expect(standings.map((row) => row.teamId)).toEqual(regularStandings.map((row) => row.teamId));
  });

  it('el calendario de liga sigue siendo el de 34 jornadas', () => {
    expect(season.listFixtures().every((fixture) => fixture.seriesId === null)).toBe(true);
    expect(season.listFixtures()).toHaveLength(306);
    // Los partidos del cuadro sí están en la ficha del equipo.
    const managed = season.listTeamFixtures(MANAGED_TEAM);
    expect(managed.length).toBeGreaterThanOrEqual(34);
  });

  it('los partidos del equipo van en orden: primero la liga y después el cuadro', () => {
    const fixtures = season.listTeamFixtures(MANAGED_TEAM);
    const dates = fixtures.map((fixture) => fixture.scheduledOn);

    expect([...dates].sort((a, b) => a - b)).toEqual(dates);
    // Las rondas del cuadro se numeran desde 1: ordenar por jornada colaría la
    // final entre la jornada 1 y la 2, y el panel del club enseñaría como
    // últimos resultados los de febrero.
    const ultimoDeLiga = fixtures.map((fixture) => fixture.seriesId).lastIndexOf(null);
    expect(fixtures.slice(ultimoDeLiga + 1).every((fixture) => fixture.seriesId !== null)).toBe(
      true
    );
  });

  it('arranca la temporada siguiente con calendario nuevo', () => {
    // La temporada puede haber acabado con el consejo harto —los resultados
    // dependen de la semilla de cada partida— y a un destituido no le dejan
    // empezar otra. Aquí interesa el calendario, así que se le devuelve la
    // confianza; el despido se prueba en los tests del club.
    db.update(boardTable).set({ confidence: 100, dismissed: false }).run();

    const next = season.startNextSeason();

    expect(next.seasonNumber).toBe(2);
    expect(next.stage).toBe('regular');
    expect(next.championTeamId).toBeNull();
    expect(next.currentRound).toBe(1);
    expect(next.totalRounds).toBe(34);
    expect(next.startYear).toBe(2026);

    // La temporada anterior sigue guardada con su campeón y sus partidos.
    const games = db.select().from(gamesTable).all();
    expect(games.filter((game) => game.seasonId === next.id)).toHaveLength(306);
    expect(games.filter((game) => game.seriesId !== null).length).toBeGreaterThan(0);
    expect(season.getNextGame()?.round).toBe(1);
  });
});

describe('fin de temporada antes de tiempo', () => {
  beforeEach(() => openSave('vbm-fin-temporada-'));
  afterEach(closeSave);

  it('no se puede saltar a la temporada siguiente con la liga a medias', () => {
    expect(() => season.startNextSeason()).toThrow(/todavía no ha terminado/);
  });

  it('no hay cuadro de playoffs mientras dure la liga regular', () => {
    expect(season.getPlayoffs()).toBeNull();
    expect(season.getCurrent().stage).toBe('regular');
    expect(season.getCurrent().playoffTeams).toBe(8);
  });
});
