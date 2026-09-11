import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_TACTICS } from '@shared/domain/tactics';
import {
  closeSaveDatabase,
  openSaveDatabase,
  type SaveDatabase
} from '../../../database/save-database';
import { playersTable } from '../../../database/schema/save';
import { loadDataset } from '../../saves/dataset';
import { seedSave } from '../../saves/save-seeder';
import { TacticsService } from '../tactics.service';

const MIGRATIONS = resolve('drizzle/save');
const SEED_DIRECTORY = resolve('resources/seed-data');
const MANAGED_TEAM = 'team-1';
const RIVAL_TEAM = 'team-2';

let directory: string;
let filePath: string;
let db: SaveDatabase;
let tactics: TacticsService;

function playerOf(teamId: string): string {
  return db
    .select()
    .from(playersTable)
    .all()
    .find((row) => row.teamId === teamId)?.id as string;
}

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'vbm-tactics-'));
  filePath = join(directory, 'partida.sqlite');
  db = openSaveDatabase(filePath, MIGRATIONS);
  seedSave(db, loadDataset(SEED_DIRECTORY), {
    managedTeamId: MANAGED_TEAM,
    managerName: 'Carlos'
  });

  tactics = new TacticsService(() => db);
});

afterEach(() => {
  closeSaveDatabase(filePath);
  rmSync(directory, { recursive: true, force: true });
});

describe('TacticsService', () => {
  it('la partida arranca con la pizarra por defecto', () => {
    const board = tactics.get(MANAGED_TEAM);

    expect(board.offensiveSystem).toBe(DEFAULT_TACTICS.offensiveSystem);
    expect(board.defensiveSystem).toBe(DEFAULT_TACTICS.defensiveSystem);
    expect(board.pace).toBe(DEFAULT_TACTICS.pace);
    expect(board.focusPlayerId).toBeNull();
    expect(board.isManaged).toBe(true);
  });

  it('guarda sistemas, deslizadores y referencia ofensiva', () => {
    const estrella = playerOf(MANAGED_TEAM);

    const saved = tactics.save({
      teamId: MANAGED_TEAM,
      offensiveSystem: 'fastbreak',
      defensiveSystem: 'fullCourtPress',
      pace: 9,
      defensiveIntensity: 8,
      offensiveReboundEffort: 3,
      focusPlayerId: estrella
    });

    expect(saved.offensiveSystem).toBe('fastbreak');
    expect(saved.focusPlayerName).not.toBeNull();

    const reread = tactics.get(MANAGED_TEAM);
    expect(reread.defensiveSystem).toBe('fullCourtPress');
    expect(reread.pace).toBe(9);
    expect(reread.defensiveIntensity).toBe(8);
    expect(reread.offensiveReboundEffort).toBe(3);
    expect(reread.focusPlayerId).toBe(estrella);
  });

  it('no admite como referencia a un jugador de otro equipo', () => {
    expect(() =>
      tactics.save({
        ...DEFAULT_TACTICS,
        teamId: MANAGED_TEAM,
        focusPlayerId: playerOf(RIVAL_TEAM)
      })
    ).toThrow(/no está en la plantilla/);
  });

  it('rechaza un deslizador fuera de la escala 1-10', () => {
    expect(() => tactics.save({ ...DEFAULT_TACTICS, teamId: MANAGED_TEAM, pace: 11 })).toThrow();
    expect(() => tactics.save({ ...DEFAULT_TACTICS, teamId: MANAGED_TEAM, pace: 0 })).toThrow();
  });

  it('la pizarra de un rival se puede leer pero no escribir', () => {
    expect(tactics.get(RIVAL_TEAM).isManaged).toBe(false);
    expect(() => tactics.save({ ...DEFAULT_TACTICS, teamId: RIVAL_TEAM })).toThrow(
      /no lo dirige el usuario/
    );
  });

  it('un equipo que no existe falla en vez de devolver la pizarra por defecto', () => {
    expect(() => tactics.get('team-inventado')).toThrow(/No existe el equipo/);
  });
});
