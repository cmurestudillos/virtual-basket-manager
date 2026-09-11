import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  closeSaveDatabase,
  openSaveDatabase,
  type SaveDatabase
} from '../../../database/save-database';
import { loadDataset } from '../../saves/dataset';
import { seedSave } from '../../saves/save-seeder';
import { MatchService } from '../../match/match.service';
import { SeasonService } from '../../season/season.service';
import { StatsService } from '../stats.service';

/**
 * Estadística de temporada sobre una liga de verdad: se juegan unas cuantas
 * jornadas y se comprueba que las medias cuadran con las actas.
 *
 * La liga se juega una sola vez para todo el fichero (`beforeAll`): son nueve
 * partidos por jornada y repetirlos en cada test multiplicaría por diez lo que
 * tarda la suite sin comprobar nada nuevo.
 */

const MIGRATIONS = resolve('drizzle/save');
const SEED_DIRECTORY = resolve('resources/seed-data');
const MANAGED_TEAM = 'team-1';
const ROUNDS_PLAYED = 4;

let directory: string;
let filePath: string;
let db: SaveDatabase;
let stats: StatsService;

beforeAll(() => {
  directory = mkdtempSync(join(tmpdir(), 'vbm-stats-'));
  filePath = join(directory, 'partida.sqlite');
  db = openSaveDatabase(filePath, MIGRATIONS);
  seedSave(db, loadDataset(SEED_DIRECTORY), {
    managedTeamId: MANAGED_TEAM,
    managerName: 'Carlos'
  });

  const season = new SeasonService(() => db);
  const match = new MatchService(() => db);
  stats = new StatsService(() => db);

  for (let round = 0; round < ROUNDS_PLAYED; round += 1) {
    let result = season.advanceToNextGame();
    // El calendario se para en el partido del usuario: lo juega él a botonazos.
    while (result.status === 'userGame') {
      match.start(result.gameId);
      let state = match.advancePeriod(result.gameId);
      while (!state.finished) {
        state = match.advancePeriod(result.gameId);
      }
      result = season.advanceToNextGame();
    }
  }
}, 120_000);

afterAll(() => {
  closeSaveDatabase(filePath);
  rmSync(directory, { recursive: true, force: true });
});

describe('StatsService', () => {
  it('devuelve las medias de la plantilla ordenadas por valoración', () => {
    const table = stats.teamSeason(MANAGED_TEAM);

    expect(table.length).toBeGreaterThanOrEqual(10);
    expect(table.every((row) => row.teamId === MANAGED_TEAM)).toBe(true);
    expect(table[0]?.games).toBeGreaterThan(0);

    const efficiencies = table.map((row) => row.efficiencyPerGame);
    expect([...efficiencies].sort((a, b) => b - a)).toEqual(efficiencies);
  });

  it('las medias cuadran con los totales y los porcentajes nunca son NaN', () => {
    const jugador = stats.teamSeason(MANAGED_TEAM).find((row) => row.games > 0);

    expect(jugador).toBeDefined();
    expect(jugador?.pointsPerGame).toBeCloseTo(
      Math.round((jugador!.points / jugador!.games) * 10) / 10,
      5
    );
    expect(Number.isNaN(jugador!.threePointPercentage)).toBe(false);
    expect(jugador!.twoPointPercentage).toBeLessThanOrEqual(100);
  });

  it('los líderes salen por media y con el mínimo de partidos de la liga', () => {
    const board = stats.leaders('points', 5);

    expect(board.category).toBe('points');
    expect(board.label).toBe('Puntos');
    expect(board.minimumGames).toBe(Math.ceil(ROUNDS_PLAYED / 2));
    expect(board.entries.length).toBeLessThanOrEqual(5);
    expect(board.entries.map((entry) => entry.rank)).toEqual(
      board.entries.map((_, index) => index + 1)
    );

    const values = board.entries.map((entry) => entry.value);
    expect([...values].sort((a, b) => b - a)).toEqual(values);
    expect(board.entries.every((entry) => entry.player.games >= board.minimumGames)).toBe(true);
    expect(board.entries[0]?.value).toBe(board.entries[0]?.player.pointsPerGame);
  });

  it('cada categoría ordena por lo suyo', () => {
    const rebotes = stats.leaders('rebounds', 3);
    const asistencias = stats.leaders('assists', 3);

    expect(rebotes.entries[0]?.value).toBe(rebotes.entries[0]?.player.reboundsPerGame);
    expect(asistencias.entries[0]?.value).toBe(asistencias.entries[0]?.player.assistsPerGame);
  });

  it('una categoría inventada no llega al repositorio', () => {
    expect(() => stats.leaders('altura')).toThrow();
  });
});
