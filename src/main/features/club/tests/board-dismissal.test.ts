import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { START_CONFIDENCE } from '@shared/domain/board';
import {
  closeSaveDatabase,
  openSaveDatabase,
  type SaveDatabase
} from '../../../database/save-database';
import { boardTable, gameStateTable } from '../../../database/schema/save';
import { loadDataset } from '../../saves/dataset';
import { seedSave } from '../../saves/save-seeder';
import { BoardService } from '../board.service';

/**
 * Jugar sin despido.
 *
 * El consejo es la mecánica más punitiva del juego: a confianza cero se acabó
 * la partida a mitad de temporada. Quien quiera construir un club a diez años
 * vista tiene que poder quitarla, y eso es un ajuste de la partida —se elige al
 * crearla— no un cambio en lo que opina el consejo. Por eso aquí se comprueba
 * las dos cosas: que sin despido nadie te echa, y que la confianza sigue
 * bajando igual, porque de ella salen cosas que no son el despido.
 */

const MIGRATIONS = resolve('drizzle/save');
const SEED_DIRECTORY = resolve('resources/seed-data');
const MANAGED_TEAM = 'liga-nacional-1';
const RIVAL = 'liga-nacional-2';

let directory: string;
let filePath: string;
let db: SaveDatabase;

function openSave(dismissalEnabled: boolean): BoardService {
  directory = mkdtempSync(join(tmpdir(), 'vbm-board-'));
  filePath = join(directory, 'partida.sqlite');
  db = openSaveDatabase(filePath, MIGRATIONS);
  seedSave(db, loadDataset(SEED_DIRECTORY), {
    managedTeamId: MANAGED_TEAM,
    managerName: 'Carlos',
    dismissalEnabled
  });

  const board = new BoardService(() => db);
  board.ensureForSeason(1, 18);
  return board;
}

/** Deja al consejo a punto de echarte y pierde otro partido. */
function loseOnTheBrink(board: BoardService): void {
  db.update(boardTable).set({ confidence: 1 }).run();
  board.afterManagedGame({
    homeTeamId: RIVAL,
    awayTeamId: MANAGED_TEAM,
    homeScore: 99,
    awayScore: 50
  });
}

function boardRow(): { confidence: number; dismissed: boolean } {
  const row = db.select().from(boardTable).get()!;
  return { confidence: row.confidence, dismissed: row.dismissed };
}

afterEach(() => {
  closeSaveDatabase(filePath);
  rmSync(directory, { recursive: true, force: true });
});

describe('con despido, que es lo de siempre', () => {
  it('a confianza cero te echan', () => {
    const board = openSave(true);

    loseOnTheBrink(board);

    expect(boardRow().dismissed).toBe(true);
    expect(board.isDismissed()).toBe(true);
  });
});

describe('sin despido', () => {
  it('la partida arranca con el ajuste guardado', () => {
    openSave(false);
    expect(db.select().from(gameStateTable).get()!.dismissalEnabled).toBe(false);
  });

  it('el consejo pierde la paciencia pero no te echa', () => {
    const board = openSave(false);

    loseOnTheBrink(board);

    const row = boardRow();
    expect(row.dismissed).toBe(false);
    expect(board.isDismissed()).toBe(false);
    // La confianza sí baja: el objetivo tiene que seguir significando algo.
    expect(row.confidence).toBeLessThan(START_CONFIDENCE);
  });

  it('aguanta una mala racha entera sin que se acabe la partida', () => {
    const board = openSave(false);

    for (let jornada = 0; jornada < 20; jornada += 1) {
      board.afterManagedGame({
        homeTeamId: RIVAL,
        awayTeamId: MANAGED_TEAM,
        homeScore: 95,
        awayScore: 60
      });
    }

    expect(boardRow().confidence).toBe(0);
    expect(board.isDismissed()).toBe(false);
  });
});
