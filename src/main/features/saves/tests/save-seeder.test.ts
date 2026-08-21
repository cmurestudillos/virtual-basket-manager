import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  closeSaveDatabase,
  openSaveDatabase,
  type SaveDatabase
} from '../../../database/save-database';
import {
  competitionsTable,
  gameStateTable,
  playersTable,
  rotationSlotsTable,
  teamsTable,
  teamTacticsTable
} from '../../../database/schema/save';
import { loadDataset } from '../dataset';
import { seedSave } from '../save-seeder';

/**
 * Test de integración contra SQLite de verdad: migraciones reales, dataset real
 * y fichero de partida real en una carpeta temporal.
 *
 * No hace falta Electron para esto — ni `save-database.ts` ni el sembrador lo
 * importan, precisamente para poder ejecutar esta comprobación sin arrancar la
 * aplicación entera.
 */

const MIGRATIONS = resolve('drizzle/save');
const SEED_DIRECTORY = resolve('resources/seed-data');

let directory: string;
let filePath: string;
let db: SaveDatabase;

beforeAll(() => {
  directory = mkdtempSync(join(tmpdir(), 'vbm-save-'));
  filePath = join(directory, 'partida.sqlite');
  db = openSaveDatabase(filePath, MIGRATIONS);

  seedSave(db, loadDataset(SEED_DIRECTORY), {
    managedTeamId: 'team-1',
    managerName: 'Carlos'
  });
});

afterAll(() => {
  closeSaveDatabase(filePath);
  rmSync(directory, { recursive: true, force: true });
});

describe('seedSave', () => {
  it('deja el mundo completo dentro del fichero de la partida', () => {
    expect(db.select().from(competitionsTable).all()).toHaveLength(2);
    expect(db.select().from(teamsTable).all()).toHaveLength(18);
    expect(db.select().from(playersTable).all()).toHaveLength(216);
  });

  it('da pizarra por defecto a todos los equipos, no sólo al del usuario', () => {
    expect(db.select().from(teamTacticsTable).all()).toHaveLength(18);
  });

  it('deja a cada equipo con una rotación de doce y cinco titulares', () => {
    const slots = db
      .select()
      .from(rotationSlotsTable)
      .where(eq(rotationSlotsTable.teamId, 'team-5'))
      .all();

    expect(slots).toHaveLength(12);

    const starters = slots.filter((slot) => slot.depth < 5);
    expect(starters).toHaveLength(5);
    // Un titular por puesto: sin esto el motor saldría con dos pívots y ningún
    // base y el partido no se parecería a nada.
    expect(new Set(starters.map((slot) => slot.slotPosition))).toEqual(
      new Set(['PG', 'SG', 'SF', 'PF', 'C'])
    );
  });

  it('reparte 200 minutos objetivo por equipo, los cinco huecos de pista', () => {
    const slots = db
      .select()
      .from(rotationSlotsTable)
      .where(eq(rotationSlotsTable.teamId, 'team-1'))
      .all();

    const total = slots.reduce((sum, slot) => sum + slot.targetMinutes, 0);
    expect(total).toBe(200);
  });

  it('guarda el estado de la partida con el equipo dirigido y la fecha del juego', () => {
    const state = db.select().from(gameStateTable).get();

    expect(state?.managedTeamId).toBe('team-1');
    expect(state?.managerName).toBe('Carlos');
    expect(state?.seasonNumber).toBe(1);
    // Pretemporada: 1 de septiembre del año en que arranca la temporada.
    expect(state?.currentDate.getUTCMonth()).toBe(8);
  });

  it('conserva los atributos de cada jugador, incluido el que cambia de nombre', () => {
    const dataset = loadDataset(SEED_DIRECTORY);
    const expected = dataset.players[0]!;
    const row = db.select().from(playersTable).where(eq(playersTable.id, expected.id)).get();

    expect(row?.threePoint).toBe(expected.attributes.threePoint);
    expect(row?.defensiveRebound).toBe(expected.attributes.defensiveRebound);
    // `basketballIQ` en el dominio, `basketball_iq` en la tabla: es justo el
    // campo que un `spread` del objeto de atributos se dejaría por el camino.
    expect(row?.basketballIq).toBe(expected.attributes.basketballIQ);
  });
});
