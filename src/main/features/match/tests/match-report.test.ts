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
import { SeasonService } from '../../season/season.service';
import { GameNotFoundError, MatchService } from '../match.service';
import { MatchReportService } from '../match-report.service';

/**
 * La previa y la jornada contra una partida sembrada de verdad: lo que importa
 * es que salgan de lo que hay guardado —la rotación, las actas, la tabla— y no
 * de algo que la pantalla se invente.
 */

const MIGRATIONS = resolve('drizzle/save');
const SEED_DIRECTORY = resolve('resources/seed-data');
const MANAGED_TEAM = 'liga-nacional-1';

let directory: string;
let filePath: string;
let db: SaveDatabase;
let season: SeasonService;
let match: MatchService;
let report: MatchReportService;
let gameId: string;

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'vbm-report-'));
  filePath = join(directory, 'partida.sqlite');
  db = openSaveDatabase(filePath, MIGRATIONS);
  seedSave(db, loadDataset(SEED_DIRECTORY), {
    managedTeamId: MANAGED_TEAM,
    managerName: 'Carlos'
  });

  const resolveDb = (): SaveDatabase => db;
  season = new SeasonService(resolveDb);
  match = new MatchService(resolveDb);
  report = new MatchReportService(resolveDb);
  gameId = season.getNextGame()!.gameId;
});

afterEach(() => {
  closeSaveDatabase(filePath);
  rmSync(directory, { recursive: true, force: true });
});

/** Como en el juego: se va al día del partido, se juega y después se sigue. */
function playUserGame(): void {
  expect(season.advanceToNextGame()).toMatchObject({ status: 'userGame', gameId });
  match.start(gameId);
  for (let guard = 0; guard < 10; guard += 1) {
    if (match.advancePeriod(gameId).finished) return;
  }
}

describe('la previa', () => {
  it('saca el cinco de cada equipo con su media y el pabellón del local', () => {
    const preview = report.preview(gameId);

    expect(preview.roundLabel).toBe('Jornada 1');
    expect(preview.competitionName).not.toBe('');
    expect(preview.pavilionName).not.toBe('');
    expect(preview.pavilionCapacity).toBeGreaterThan(0);
    for (const side of [preview.home, preview.away]) {
      expect(side.starters).toHaveLength(5);
      expect(new Set(side.starters.map((player) => player.playerId)).size).toBe(5);
      for (const player of side.starters) {
        expect(player.overall).toBeGreaterThan(0);
        expect(player.playerName).not.toBe('');
      }
    }
  });

  it('antes de jugar no hay medias y la referencia es el de más media', () => {
    const { home } = report.preview(gameId);

    expect(home.averages).toBeNull();
    expect(home.keyPlayer?.averages).toBeNull();
    const best = Math.max(...home.starters.map((player) => player.overall));
    expect(home.keyPlayer?.overall).toBe(best);
  });

  it('con partidos jugados trae las medias del equipo y de su referencia', () => {
    playUserGame();
    season.advanceDay();
    const next = season.getNextGame()!;
    const preview = report.preview(next.gameId);
    const managed =
      preview.home.teamId === MANAGED_TEAM ? preview.home : (preview.away as typeof preview.home);

    expect(managed.averages?.games).toBe(1);
    expect(managed.averages?.points).toBeGreaterThan(40);
    expect(managed.keyPlayer?.averages?.games).toBe(1);
  });

  it('un partido que no existe es un error', () => {
    expect(() => report.preview('no-existe')).toThrow(GameNotFoundError);
    expect(() => report.roundResults('no-existe')).toThrow(GameNotFoundError);
  });
});

describe('la jornada', () => {
  it('antes de jugar, está entera pendiente y sin mejor jugador', () => {
    const round = report.roundResults(gameId);

    expect(round.games.length).toBeGreaterThan(1);
    expect(round.pending).toBe(round.games.length);
    expect(round.mvp).toBeNull();
    expect(round.games.filter((game) => game.involvesManaged)).toHaveLength(1);
    // Liga de dieciocho: juegan todos, nadie descansa.
    expect(round.resting).toEqual([]);
  });

  it('jugada entera, trae resultados, posiciones y el mejor de la jornada', () => {
    playUserGame();
    season.advanceDay();
    const round = report.roundResults(gameId);

    expect(round.pending).toBe(0);
    for (const game of round.games) {
      expect(game.played).toBe(true);
      expect(game.homeScore).not.toBeNull();
      expect(game.homePosition).toBeGreaterThan(0);
      expect(game.awayPosition).toBeGreaterThan(0);
    }
    const positions = round.games.flatMap((game) => [game.homePosition, game.awayPosition]);
    expect(new Set(positions).size).toBe(positions.length);

    expect(round.mvp).not.toBeNull();
    // Nadie de la jornada puede tener más valoración que el mejor de la jornada.
    for (const game of round.games) {
      const state = match.get(game.gameId)!;
      for (const line of [...state.home.boxScores, ...state.away.boxScores]) {
        expect(line.efficiency).toBeLessThanOrEqual(round.mvp!.efficiency);
      }
    }
  });
});
