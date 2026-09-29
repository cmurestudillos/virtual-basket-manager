import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  closeSaveDatabase,
  openSaveDatabase,
  type SaveDatabase
} from '../../../database/save-database';
import { gamesTable, playersTable, seasonsTable } from '../../../database/schema/save';
import { loadDataset } from '../../saves/dataset';
import { seedSave } from '../../saves/save-seeder';
import { MatchService } from '../../match/match.service';
import { SeasonService } from '../season.service';

/**
 * La misma partida, jugada dos veces, tiene que dar lo mismo.
 *
 * El motor presume de simulación reproducible, pero los ids de temporadas,
 * partidos y jugadores generados salían de `randomUUID`, y de esos ids sale la
 * semilla de cada partido, de cada lesión y de cada semana de entreno: dos
 * partidas sembradas igual jugaban cursos distintos desde la primera jornada
 * (y `pnpm seed:finished` coronaba a un campeón distinto en cada pasada). Ahora
 * todo cuelga de la semilla de la partida (`game_state.world_seed`):
 * reproducibilidad, 2026-09-29.
 */

const MIGRATIONS = resolve('drizzle/save');
const SEED_DIRECTORY = resolve('resources/seed-data');
const MANAGED_TEAM = 'liga-nacional-1';
/** Dos jornadas con su semana de entreno: basta para que el azar se note. */
const STEPS = 3;

interface Snapshot {
  seasons: string[];
  games: string[];
  players: string[];
}

/** Siembra una partida, juega unas jornadas y devuelve lo que ha pasado. */
function playFewDays(worldSeed: string): Snapshot {
  const directory = mkdtempSync(join(tmpdir(), 'vbm-repro-'));
  const filePath = join(directory, 'partida.sqlite');
  const db = openSaveDatabase(filePath, MIGRATIONS);
  try {
    seedSave(db, loadDataset(SEED_DIRECTORY), {
      managedTeamId: MANAGED_TEAM,
      managerName: 'Carlos',
      worldSeed
    });
    const resolveDb = (): SaveDatabase => db;
    const season = new SeasonService(resolveDb);
    const match = new MatchService(resolveDb);

    for (let step = 0; step < STEPS; step += 1) {
      const result = season.advanceToNextGame();
      if (result.status === 'userGame') {
        match.start(result.gameId);
        let state = match.advancePeriod(result.gameId);
        while (!state.finished) {
          state = match.advancePeriod(result.gameId);
        }
      }
    }

    return {
      seasons: db
        .select()
        .from(seasonsTable)
        .all()
        .map((row) => row.id)
        .sort(),
      games: db
        .select()
        .from(gamesTable)
        .all()
        .filter((row) => row.homeScore !== null)
        .map(
          (row) =>
            `${row.id} ${row.homeTeamId}-${row.awayTeamId} ${row.homeScore}-${row.awayScore} ${row.seed}`
        )
        .sort(),
      players: db
        .select()
        .from(playersTable)
        .all()
        .map((row) =>
          JSON.stringify([
            row.id,
            row.teamId,
            row.close,
            row.midRange,
            row.threePoint,
            row.passing,
            row.speed,
            row.condition,
            row.morale,
            row.injuryDaysLeft
          ])
        )
        .sort()
    };
  } finally {
    closeSaveDatabase(filePath);
    rmSync(directory, { recursive: true, force: true });
  }
}

describe('reproducibilidad de la temporada', () => {
  it('la misma semilla juega las mismas jornadas, con las mismas actas y los mismos jugadores', () => {
    const first = playFewDays('prueba');
    const second = playFewDays('prueba');

    expect(first.games.length).toBeGreaterThan(0);
    expect(second.seasons).toEqual(first.seasons);
    expect(second.games).toEqual(first.games);
    expect(second.players).toEqual(first.players);
  }, 180_000);

  it('otra semilla juega otro curso: dos partidas nuevas no salen calcadas', () => {
    const first = playFewDays('prueba');
    const other = playFewDays('otra');

    const scores = (snapshot: Snapshot) =>
      snapshot.games.map((line) => line.split(' ').slice(1, 3).join(' '));
    expect(scores(other)).not.toEqual(scores(first));
  }, 180_000);
});
