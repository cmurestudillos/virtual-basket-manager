import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { and, eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { overallForPosition } from '@shared/domain/attributes';
import type { Position } from '@shared/domain/positions';
import {
  closeSaveDatabase,
  openSaveDatabase,
  type SaveDatabase
} from '../../../database/save-database';
import { gameStateTable, playersTable, type PlayerRow } from '../../../database/schema/save';
import { MarketService, RenewalRefusedError } from '../../market/market.service';
import { buildEngineTeam } from '../../match/engine-input';
import { toPlayerSummary } from '../../players/players.mapper';
import { loadDataset } from '../../saves/dataset';
import { seedSave } from '../../saves/save-seeder';
import { FitnessService } from '../fitness.service';

/**
 * La moral dentro de una partida: lo que la mueve y lo que cambia.
 */

const MIGRATIONS = resolve('drizzle/save');
const SEED_DIRECTORY = resolve('resources/seed-data');
const TEAM = 'liga-nacional-1';
const DAY_MS = 24 * 60 * 60 * 1000;

let directory: string;
let filePath: string;
let db: SaveDatabase;
let fitness: FitnessService;

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'vbm-moral-'));
  filePath = join(directory, 'partida.sqlite');
  db = openSaveDatabase(filePath, MIGRATIONS);
  seedSave(db, loadDataset(SEED_DIRECTORY), { managedTeamId: TEAM, managerName: 'Carlos' });
  fitness = new FitnessService(() => db);
});

afterEach(() => {
  closeSaveDatabase(filePath);
  rmSync(directory, { recursive: true, force: true });
});

/** La plantilla, de mejor a peor. */
function rankedRoster(): PlayerRow[] {
  const today = db.select().from(gameStateTable).get()!.currentDate;
  return db
    .select()
    .from(playersTable)
    .where(and(eq(playersTable.teamId, TEAM), eq(playersTable.isYouth, false)))
    .all()
    .sort((a, b) => toPlayerSummary(b, today).overall - toPlayerSummary(a, today).overall);
}

function moraleOf(playerId: string): number {
  return db.select().from(playersTable).where(eq(playersTable.id, playerId)).get()!.morale;
}

describe('lo que la mueve', () => {
  it('el mejor de la plantilla sin jugar se enfada; el último con minutos, contento', () => {
    const roster = rankedRoster();
    const star = roster[0]!;
    const last = roster.at(-1)!;

    fitness.applyGameEffects(
      'partido-de-prueba',
      [
        { playerId: star.id, secondsPlayed: 0, teamId: TEAM, won: true, margin: 5 },
        { playerId: last.id, secondsPlayed: 600, teamId: TEAM, won: true, margin: 5 }
      ],
      new Date(Date.UTC(2025, 9, 5))
    );

    expect(moraleOf(star.id)).toBeLessThan(star.morale);
    expect(moraleOf(last.id)).toBeGreaterThan(last.morale);
  });

  it('con los días vuelve a lo normal, avance como avance el reloj', () => {
    const [player] = rankedRoster();
    db.update(playersTable).set({ morale: 40 }).where(eq(playersTable.id, player!.id)).run();
    const start = new Date(Date.UTC(2025, 9, 1));

    for (let day = 0; day < 9; day += 1) {
      fitness.advanceDays(
        new Date(start.getTime() + day * DAY_MS),
        new Date(start.getTime() + (day + 1) * DAY_MS)
      );
    }
    const dayByDay = moraleOf(player!.id);

    db.update(playersTable).set({ morale: 40 }).where(eq(playersTable.id, player!.id)).run();
    fitness.advanceDays(start, new Date(start.getTime() + 9 * DAY_MS));
    // El entrenamiento del lunes también mueve el ánimo; sin él, la cuenta es
    // la misma se avance como se avance.
    expect(moraleOf(player!.id)).toBe(dayByDay);
    expect(dayByDay).toBeGreaterThan(40);
  });

  it('que te llame tu selección sube el ánimo', () => {
    const [player] = rankedRoster();
    fitness.boostCalledUp([player!.id]);
    expect(moraleOf(player!.id)).toBeGreaterThan(player!.morale);
  });
});

describe('lo que cambia', () => {
  it('en pista, el eufórico juega por encima de sus medias y el hundido por debajo', () => {
    const [player] = rankedRoster();
    const attributeInGame = () =>
      buildEngineTeam(db, TEAM).players.find((row) => row.id === player!.id)!.attributes;

    db.update(playersTable).set({ morale: 70 }).where(eq(playersTable.id, player!.id)).run();
    const normal = attributeInGame();
    db.update(playersTable).set({ morale: 100 }).where(eq(playersTable.id, player!.id)).run();
    const happy = attributeInGame();
    db.update(playersTable).set({ morale: 5 }).where(eq(playersTable.id, player!.id)).run();
    const angry = attributeInGame();

    const overall = (attributes: typeof normal) =>
      overallForPosition(attributes, player!.position as Position);
    expect(overall(happy)).toBeGreaterThan(overall(normal));
    expect(overall(angry)).toBeLessThan(overall(normal));
  });

  it('el descontento pide más por renovar y el enfadado no renueva', () => {
    const market = new MarketService(() => db);
    const [player] = rankedRoster();
    const demand = () =>
      market.listContracts().find((row) => row.playerId === player!.id)!.renewalWageCents;

    db.update(playersTable).set({ morale: 70 }).where(eq(playersTable.id, player!.id)).run();
    const normal = demand();
    db.update(playersTable).set({ morale: 30 }).where(eq(playersTable.id, player!.id)).run();
    expect(demand()).toBeGreaterThan(normal);

    db.update(playersTable).set({ morale: 10 }).where(eq(playersTable.id, player!.id)).run();
    const entry = market.listContracts().find((row) => row.playerId === player!.id)!;
    expect(entry.refusesRenewal).toBe(true);
    expect(() =>
      market.renew({ playerId: player!.id, wageCents: entry.renewalWageCents * 2, years: 2 })
    ).toThrow(RenewalRefusedError);
  });
});
