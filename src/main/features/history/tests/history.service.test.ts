import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { HistoryView } from '@shared/contracts/history.contract';
import {
  closeSaveDatabase,
  openSaveDatabase,
  type SaveDatabase
} from '../../../database/save-database';
import { boardTable, seasonsTable } from '../../../database/schema/save';
import { loadDataset } from '../../saves/dataset';
import { seedSave } from '../../saves/save-seeder';
import { MatchService } from '../../match/match.service';
import { SeasonService } from '../../season/season.service';
import { HistoryService } from '../history.service';

/**
 * El historial, sobre una temporada jugada de verdad.
 *
 * Se juega la temporada entera —es caro, pero es la única forma de que el
 * puesto, el balance y el campeón salgan de partidos reales y no de filas
 * puestas a mano— y luego se comprueba que lo que cuenta la pantalla es lo que
 * de verdad pasó.
 */

const MIGRATIONS = resolve('drizzle/save');
const SEED_DIRECTORY = resolve('resources/seed-data');
const MANAGED_TEAM = 'liga-nacional-1';

let directory: string;
let filePath: string;
let db: SaveDatabase;
let view: HistoryView;
let championTeamId: string | null;

beforeAll(() => {
  directory = mkdtempSync(join(tmpdir(), 'vbm-history-'));
  filePath = join(directory, 'partida.sqlite');
  db = openSaveDatabase(filePath, MIGRATIONS);
  seedSave(db, loadDataset(SEED_DIRECTORY), {
    managedTeamId: MANAGED_TEAM,
    managerName: 'Carlos'
  });

  const resolveDb = (): SaveDatabase => db;
  const season = new SeasonService(resolveDb);
  const match = new MatchService(resolveDb);

  // Sin consejo: un despido a mitad de curso pararía el reloj y no habría
  // temporada que contar.
  season.getCurrent();
  db.delete(boardTable).run();

  for (let guard = 0; guard < 600; guard += 1) {
    const result = season.advanceToNextGame();
    if (result.status === 'seasonOver' || result.status === 'dismissed') {
      break;
    }
    if (result.status === 'userGame') {
      match.start(result.gameId);
      let state = match.advancePeriod(result.gameId);
      while (!state.finished) {
        state = match.advancePeriod(result.gameId);
      }
    }
  }

  const league = db
    .select()
    .from(seasonsTable)
    .all()
    .find((row) => row.competitionId === 'liga-nacional')!;
  championTeamId = league.championTeamId;

  view = new HistoryService(resolveDb).get();
}, 300_000);

afterAll(() => {
  closeSaveDatabase(filePath);
  rmSync(directory, { recursive: true, force: true });
});

describe('temporada a temporada', () => {
  it('cuenta la temporada jugada con su puesto y su balance', () => {
    expect(view.teamName.length).toBeGreaterThan(0);
    expect(view.seasons).toHaveLength(1);

    const season = view.seasons[0]!;
    expect(season.seasonNumber).toBe(1);
    expect(season.years).toMatch(/^\d{4}-\d{2}$/);
    expect(season.competitionId).toBe('liga-nacional');
    expect(season.tier).toBe(1);
    expect(season.teams).toBe(18);
    expect(season.position).toBeGreaterThanOrEqual(1);
    expect(season.position).toBeLessThanOrEqual(18);
    // Treinta y cuatro jornadas, ni una más ni una menos.
    expect(season.won + season.lost).toBe(34);
  });

  it('dice quién fue el campeón, sea quien sea', () => {
    const season = view.seasons[0]!;
    expect(season.championTeamName).not.toBeNull();
    expect(season.championTeamName!.length).toBeGreaterThan(0);
  });

  it('no se inventa competiciones que el club no jugó', () => {
    const season = view.seasons[0]!;
    // La liga no aparece entre «y además»: es la columna principal.
    expect(season.others.some((other) => other.competitionName === 'Liga Nacional')).toBe(false);
    // Y lo que sí aparezca tiene que llevar su resultado escrito.
    for (const other of season.others) {
      expect(other.outcome.length).toBeGreaterThan(0);
    }
  });
});

describe('palmarés', () => {
  it('sólo recoge lo que ha ganado el club dirigido', () => {
    const wonLeague = championTeamId === MANAGED_TEAM;
    const hasLeagueTrophy = view.trophies.some(
      (trophy) => trophy.competitionId === 'liga-nacional'
    );

    expect(hasLeagueTrophy).toBe(wonLeague);
    expect(view.totalTrophies).toBe(
      view.trophies.reduce((sum, trophy) => sum + trophy.seasons.length, 0)
    );
    // Cada título va con la temporada en la que se ganó.
    for (const trophy of view.trophies) {
      expect(trophy.seasons).toHaveLength(trophy.years.length);
    }
  });
});

describe('récords', () => {
  it('saca las mejores marcas de la partida', () => {
    expect(view.records.length).toBeGreaterThan(0);

    const puntos = view.records.find((record) => record.label.includes('puntos'));
    expect(puntos).toBeDefined();
    // Una temporada entera da partidos de más de treinta puntos, pero nadie
    // mete cien: si esto se dispara, el que está roto es el motor.
    expect(puntos!.value).toBeGreaterThan(25);
    expect(puntos!.value).toBeLessThan(80);
    expect(puntos!.playerName.length).toBeGreaterThan(0);
    expect(puntos!.context).toMatch(/Jornada \d+/);
  });
});
