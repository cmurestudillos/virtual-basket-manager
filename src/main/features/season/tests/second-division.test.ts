import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  closeSaveDatabase,
  openSaveDatabase,
  type SaveDatabase
} from '../../../database/save-database';
import { loadDataset } from '../../saves/dataset';
import { seedSave } from '../../saves/save-seeder';
import { BoardService } from '../../club/board.service';
import { SeasonService } from '../season.service';

/**
 * Dirigir en segunda división.
 *
 * Es una partida entera distinta —otro calendario, otro objetivo, sin Copa— y
 * la única forma de saber que funciona es empezar una con un club de plata en
 * vez de comprobar sólo el camino de vuelta desde primera.
 */

const MIGRATIONS = resolve('drizzle/save');
const SEED_DIRECTORY = resolve('resources/seed-data');
/** El primero de la segunda división del dataset. */
const MANAGED_TEAM = 'liga-plata-1';

let directory: string;
let filePath: string;
let db: SaveDatabase;
let season: SeasonService;
let board: BoardService;

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'vbm-plata-'));
  filePath = join(directory, 'partida.sqlite');
  db = openSaveDatabase(filePath, MIGRATIONS);
  seedSave(db, loadDataset(SEED_DIRECTORY), {
    managedTeamId: MANAGED_TEAM,
    managerName: 'Carlos'
  });

  const resolveDb = (): SaveDatabase => db;
  season = new SeasonService(resolveDb);
  board = new BoardService(resolveDb);
});

afterEach(() => {
  closeSaveDatabase(filePath);
  rmSync(directory, { recursive: true, force: true });
});

describe('dirigir en segunda', () => {
  it('la partida arranca en la liga del club, no siempre en la primera', () => {
    const current = season.getCurrent();

    expect(current.competitionName).toBe('Liga Plata');
    expect(current.tier).toBe(2);
    expect(current.totalRounds).toBe(34);
    // Sin cuadro: en segunda lo que se juega es subir.
    expect(current.playoffTeams).toBe(0);
  });

  it('se ve la división de al lado, marcada como la que no es tuya', () => {
    const leagues = season.listLeagues();

    expect(leagues.map((row) => row.tier)).toEqual([1, 2]);
    expect(leagues[0]?.isManaged).toBe(false);
    expect(leagues[1]?.isManaged).toBe(true);
  });

  it('la clasificación de segunda marca ascenso arriba y nada abajo', () => {
    const standings = season.getStandings();

    expect(standings).toHaveLength(18);
    expect(standings.filter((row) => row.zone === 'promotion')).toHaveLength(2);
    expect(standings.some((row) => row.zone === 'relegation')).toBe(false);
    expect(standings.some((row) => row.isManaged)).toBe(true);
  });

  it('y la de primera, que se juega igual aunque el usuario no esté en ella', () => {
    const primera = season.getStandings('liga-nacional');

    expect(primera).toHaveLength(18);
    expect(primera.some((row) => row.isManaged)).toBe(false);
    expect(primera.filter((row) => row.zone === 'relegation')).toHaveLength(2);
    expect(primera.filter((row) => row.zone === 'playoffs')).toHaveLength(8);
  });

  it('el consejo pide ascender, no un título que no existe', () => {
    season.getCurrent();
    const view = board.get(1, 18);

    expect(view.objective).toBe('promotion');
    expect(view.targetPosition).toBe(2);
  });

  it('el calendario del usuario es el de su división', () => {
    const fixtures = season.listTeamFixtures(MANAGED_TEAM);

    expect(fixtures).toHaveLength(34);
    expect(fixtures.every((fixture) => fixture.involvesManaged)).toBe(true);
  });

  it('la Copa no se ha sorteado todavía: es de la máxima categoría', () => {
    expect(season.getCup()).toBeNull();
  });
});
