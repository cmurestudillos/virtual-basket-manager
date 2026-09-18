import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { and, eq, inArray } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  closeSaveDatabase,
  openSaveDatabase,
  type SaveDatabase
} from '../../../database/save-database';
import { playersTable, staffTable } from '../../../database/schema/save';
import { NotManagedTeamError, ClubService } from '../../club/club.service';
import { MatchReportService } from '../../match/match-report.service';
import { toPlayerSummary } from '../../players/players.mapper';
import { PlayersService } from '../../players/players.service';
import { scoutPlayer, scoutingErrorFor } from '../../players/scouting';
import { loadDataset } from '../../saves/dataset';
import { seedSave } from '../../saves/save-seeder';
import { SeasonService } from '../../season/season.service';
import { StaffService } from '../../staff/staff.service';
import { TeamsService } from '../teams.service';

/**
 * Lo que un club ajeno no enseña por ningún canal: su caja, sus cuentas y la
 * moral de sus jugadores; y la previa del partido, que enseña el cinco del
 * rival con la media que cuenta el ojeador y no con la exacta.
 */

const MIGRATIONS = resolve('drizzle/save');
const SEED_DIRECTORY = resolve('resources/seed-data');
const MANAGED_TEAM = 'liga-nacional-1';
const RIVAL_TEAM = 'liga-nacional-2';

let directory: string;
let filePath: string;
let db: SaveDatabase;
let resolveDb: () => SaveDatabase;

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'vbm-visibilidad-'));
  filePath = join(directory, 'partida.sqlite');
  db = openSaveDatabase(filePath, MIGRATIONS);
  seedSave(db, loadDataset(SEED_DIRECTORY), {
    managedTeamId: MANAGED_TEAM,
    managerName: 'Carlos'
  });
  resolveDb = () => db;
});

afterEach(() => {
  closeSaveDatabase(filePath);
  rmSync(directory, { recursive: true, force: true });
});

describe('la caja y las cuentas', () => {
  it('la caja sólo sale del club propio', () => {
    const teams = new TeamsService(SEED_DIRECTORY, () => [], resolveDb);

    expect(teams.get(MANAGED_TEAM)?.budgetCents).toEqual(expect.any(Number));
    expect(teams.get(RIVAL_TEAM)?.budgetCents).toBeNull();
    const others = teams.list().filter((team) => team.id !== MANAGED_TEAM);
    expect(others.length).toBeGreaterThan(0);
    expect(others.every((team) => team.budgetCents === null)).toBe(true);
    // El entrenador sí es público: cada club lleva el suyo, y el del club propio es el usuario.
    expect(others.every((team) => team.coach !== null && !team.coach.isManager)).toBe(true);
    expect(teams.get(MANAGED_TEAM)?.coach).toMatchObject({ id: 'manager', isManager: true });
  });

  it('las finanzas de otro club se rechazan', () => {
    const club = new ClubService(resolveDb);

    expect(club.getFinances(MANAGED_TEAM).teamId).toBe(MANAGED_TEAM);
    expect(() => club.getFinances(RIVAL_TEAM)).toThrow(NotManagedTeamError);
  });
});

describe('la moral', () => {
  it('se ve la de los tuyos y no la de los jugadores de otro club; la forma, siempre', () => {
    const players = new PlayersService(resolveDb);

    const mine = players.listByTeam(MANAGED_TEAM);
    const theirs = players.listByTeam(RIVAL_TEAM);
    expect(mine.every((player) => typeof player.morale === 'number')).toBe(true);
    expect(theirs.length).toBeGreaterThan(0);
    expect(theirs.every((player) => player.morale === null)).toBe(true);
    expect(theirs.every((player) => player.condition > 0)).toBe(true);

    expect(players.get(mine[0]!.id)?.morale).toEqual(expect.any(Number));
    expect(players.get(theirs[0]!.id)?.morale).toBeNull();
  });
});

describe('la previa', () => {
  it('el cinco del rival lleva la media del ojeador y el propio, la exacta', () => {
    const season = new SeasonService(resolveDb);
    const game = season.getNextGame()!;
    const preview = new MatchReportService(resolveDb).preview(game.gameId);

    const [mine, rival] =
      preview.home.teamId === MANAGED_TEAM
        ? [preview.home, preview.away]
        : [preview.away, preview.home];
    expect(rival.teamId).not.toBe(MANAGED_TEAM);

    const ids = [...mine.starters, ...rival.starters].map((player) => player.playerId);
    const rows = new Map(
      db
        .select()
        .from(playersTable)
        .where(inArray(playersTable.id, ids))
        .all()
        .map((row) => [row.id, row])
    );
    // La media no depende de la edad: la fecha da igual para compararla.
    const exact = (playerId: string) => toPlayerSummary(rows.get(playerId)!, new Date());
    const error = scoutingErrorFor(new StaffService(resolveDb).levels(MANAGED_TEAM).scout, false);

    for (const player of mine.starters) {
      expect(player.overall).toBe(exact(player.playerId).overall);
    }
    for (const player of rival.starters) {
      expect(player.overall).toBe(scoutPlayer(exact(player.playerId), error).overall);
    }
  });

  it('sin ojeador, la media del rival se aleja de la exacta', () => {
    db.update(staffTable)
      .set({ teamId: null })
      .where(and(eq(staffTable.teamId, MANAGED_TEAM), eq(staffTable.role, 'scout')))
      .run();

    const game = new SeasonService(resolveDb).getNextGame()!;
    const preview = new MatchReportService(resolveDb).preview(game.gameId);
    const rival = preview.home.teamId === MANAGED_TEAM ? preview.away : preview.home;
    const rows = db
      .select()
      .from(playersTable)
      .where(
        inArray(
          playersTable.id,
          rival.starters.map((player) => player.playerId)
        )
      )
      .all();
    const exact = new Map(rows.map((row) => [row.id, toPlayerSummary(row, new Date()).overall]));

    expect(rival.starters.some((player) => player.overall !== exact.get(player.playerId))).toBe(
      true
    );
  });
});
