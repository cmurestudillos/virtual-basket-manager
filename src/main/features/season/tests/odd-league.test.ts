import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { and, eq, isNull } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  closeSaveDatabase,
  openSaveDatabase,
  type SaveDatabase
} from '../../../database/save-database';
import { boardTable, gamesTable } from '../../../database/schema/save';
import { loadDataset, type Dataset } from '../../saves/dataset';
import { seedSave } from '../../saves/save-seeder';
import { EarlierRoundPendingError, MatchService } from '../../match/match.service';
import { MatchReportService } from '../../match/match-report.service';
import { SeasonService } from '../season.service';

/**
 * Una liga de número impar, con su jornada de descanso.
 *
 * Es la Primera FEB real de la edición privada: diecisiete equipos, 34 jornadas
 * y 32 partidos por equipo. El mundo ficticio no tiene ninguna, así que aquí se
 * recorta un equipo de la segunda división del dataset.
 */

const MIGRATIONS = resolve('drizzle/save');
const SEED_DIRECTORY = resolve('resources/seed-data');
const REMOVED_TEAM = 'liga-plata-18';
/**
 * Con los equipos ordenados por id, este juega la primera jornada y descansa en
 * la segunda: así la semana de descanso llega sin tener que simular media liga.
 */
const MANAGED_TEAM = 'liga-plata-9';

let directory: string;
let filePath: string;
let db: SaveDatabase;
let season: SeasonService;
let match: MatchService;

/** El dataset con un equipo menos en segunda. Copia: el original está cacheado. */
function oddDataset(): Dataset {
  const dataset = loadDataset(SEED_DIRECTORY);
  return {
    ...dataset,
    teams: dataset.teams.filter((team) => team.id !== REMOVED_TEAM),
    players: dataset.players.filter((player) => player.teamId !== REMOVED_TEAM)
  };
}

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'vbm-impar-'));
  filePath = join(directory, 'partida.sqlite');
  db = openSaveDatabase(filePath, MIGRATIONS);
  seedSave(db, oddDataset(), { managedTeamId: MANAGED_TEAM, managerName: 'Carlos' });

  const resolveDb = (): SaveDatabase => db;
  season = new SeasonService(resolveDb);
  match = new MatchService(resolveDb);
  // El consejo, fuera: un despido a destiempo pararía el reloj y no va de eso.
  season.getCurrent();
  db.delete(boardTable).run();
});

afterEach(() => {
  closeSaveDatabase(filePath);
  rmSync(directory, { recursive: true, force: true });
});

function playUserGame(gameId: string): void {
  match.start(gameId);
  for (let guard = 0; guard < 10; guard += 1) {
    if (match.advancePeriod(gameId).finished) return;
  }
}

/** Avanza hasta la primera jornada en la que descansa el club. */
function advanceToRestingRound(): number {
  for (let guard = 0; guard < 40; guard += 1) {
    const next = season.getCurrent().nextRound;
    if (next?.managedRests) {
      return next.round;
    }
    const result = season.advanceToNextGame();
    if (result.status === 'userGame') {
      playUserGame(result.gameId);
    } else {
      expect(result.status).toBe('advanced');
    }
  }
  throw new Error('El club no descansa nunca');
}

describe('liga de diecisiete equipos', () => {
  it('34 jornadas de ocho partidos y 32 partidos por equipo, dos descansos', () => {
    const current = season.getCurrent();
    expect(current.competitionName).toBe('Liga Plata');
    expect(current.totalRounds).toBe(34);

    const fixtures = season.listFixtures();
    expect(fixtures).toHaveLength(272);
    for (let round = 1; round <= 34; round += 1) {
      expect(fixtures.filter((fixture) => fixture.round === round)).toHaveLength(8);
    }

    const own = season.listTeamFixtures(MANAGED_TEAM).filter((fixture) => !fixture.seriesId);
    expect(own).toHaveLength(32);
    expect(own.filter((fixture) => fixture.homeTeamId === MANAGED_TEAM)).toHaveLength(16);
    const played = new Set(own.map((fixture) => fixture.round));
    const rests = Array.from({ length: 34 }, (_, index) => index + 1).filter(
      (round) => !played.has(round)
    );
    // Uno por vuelta.
    expect(rests).toHaveLength(2);
    expect(rests[0]).toBeLessThanOrEqual(17);
    expect(rests[1]).toBeGreaterThan(17);
  });

  it(
    'la semana de descanso se juega sin el club, y su partido espera a la jornada siguiente',
    { timeout: 120_000 },
    () => {
      const restingRound = advanceToRestingRound();
      expect(restingRound).toBe(2);

      // El próximo partido del club es el de la jornada siguiente, y no se puede
      // empezar con la de ahora sin jugar.
      const next = season.getNextGame();
      expect(next?.round).toBe(restingRound + 1);
      expect(() => match.start(next!.gameId)).toThrow(EarlierRoundPendingError);

      // Avanzar juega la jornada entera sin parar en ningún partido del usuario.
      const result = season.advanceToNextGame();
      expect(result.status).toBe('advanced');
      if (result.status !== 'advanced') return;
      const plata = new Set(season.listFixtures(restingRound).map((fixture) => fixture.gameId));
      expect(result.playedGameIds.filter((id) => plata.has(id))).toHaveLength(8);

      const after = season.getCurrent();
      expect(after.currentRound).toBe(restingRound);
      expect(after.nextRound).toMatchObject({ round: restingRound + 1, managedRests: false });

      // Con la jornada cerrada, el partido ya se juega.
      const stop = season.advanceToNextGame();
      expect(stop).toMatchObject({ status: 'userGame', gameId: next!.gameId });
      expect(() => match.start(next!.gameId)).not.toThrow();

      // Y la jornada, vista desde el partido del club, dice quién descansa.
      playUserGame(next!.gameId);
      const report = new MatchReportService(() => db).roundResults(next!.gameId);
      expect(report.games).toHaveLength(8);
      expect(report.resting).toHaveLength(1);
      expect(report.resting[0]?.teamId).not.toBe(MANAGED_TEAM);
    }
  );

  it('la liga acaba con los diecisiete en 32 partidos', () => {
    // Los resultados se escriben a mano: lo que se comprueba es el calendario y
    // el cierre de la liga, no el motor, y simular 272 partidos no añade nada.
    const seasonId = season.getCurrent().id;
    const games = db
      .select()
      .from(gamesTable)
      .where(and(eq(gamesTable.seasonId, seasonId), isNull(gamesTable.seriesId)))
      .all();
    for (const [index, game] of games.entries()) {
      // Sin empates: gana uno u otro según el partido.
      const margin = 1 + (index % 13);
      db.update(gamesTable)
        .set(
          index % 3 === 0
            ? { homeScore: 78, awayScore: 78 + margin }
            : { homeScore: 78 + margin, awayScore: 78 }
        )
        .where(eq(gamesTable.id, game.id))
        .run();
    }

    const current = season.getCurrent();
    expect(current.stage).toBe('finished');
    expect(current.nextRound).toBeNull();
    expect(current.championTeamId).not.toBeNull();

    const standings = season.getStandings();
    expect(standings).toHaveLength(17);
    expect(standings.every((row) => row.played === 32)).toBe(true);
    // 17 equipos x 32 partidos / 2.
    expect(standings.reduce((sum, row) => sum + row.won, 0)).toBe(272);
  });
});
