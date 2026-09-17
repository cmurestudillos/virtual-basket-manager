import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { and, eq, gte, lte, or } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ZodError } from 'zod';
import type { CalendarMonth } from '@shared/contracts/calendar.contract';
import { monthRange } from '@shared/domain/calendar-month';
import { qualifierDate } from '@shared/domain/national-teams';
import {
  closeSaveDatabase,
  openSaveDatabase,
  type SaveDatabase
} from '../../../database/save-database';
import {
  boardTable,
  competitionsTable,
  gamesTable,
  seasonsTable,
  teamsTable
} from '../../../database/schema/save';
import { loadDataset } from '../../saves/dataset';
import { seedSave } from '../../saves/save-seeder';
import { NationalService } from '../../national/national.service';
import { SeasonService } from '../../season/season.service';
import { CalendarService } from '../calendar.service';

/**
 * El calendario mensual contra SQLite de verdad: los partidos del usuario de
 * todas sus competiciones, y ni uno de los demás.
 */

const MIGRATIONS = resolve('drizzle/save');
const SEED_DIRECTORY = resolve('resources/seed-data');
const MANAGED_TEAM = 'liga-nacional-1';
const SPAIN = 'seleccion-esp';

let directory: string;
let filePath: string;
let db: SaveDatabase;
let season: SeasonService;
let calendar: CalendarService;
let startYear: number;

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'vbm-calendario-'));
  filePath = join(directory, 'partida.sqlite');
  db = openSaveDatabase(filePath, MIGRATIONS);
  seedSave(db, loadDataset(SEED_DIRECTORY), { managedTeamId: MANAGED_TEAM, managerName: 'Carlos' });

  const resolveDb = (): SaveDatabase => db;
  season = new SeasonService(resolveDb);
  calendar = new CalendarService(resolveDb);
  startYear = season.getCurrent().startYear;
  // El consejo, fuera: aquí se mira el calendario, no el banquillo.
  db.delete(boardTable).run();
});

afterEach(() => {
  closeSaveDatabase(filePath);
  rmSync(directory, { recursive: true, force: true });
});

/** Los partidos de la base en un mes que juega un equipo. */
function gamesOf(teamId: string, year: number, month: number) {
  const { from, to } = monthRange({ year, month });
  return db
    .select()
    .from(gamesTable)
    .where(
      and(
        gte(gamesTable.scheduledOn, from),
        lte(gamesTable.scheduledOn, to),
        or(eq(gamesTable.homeTeamId, teamId), eq(gamesTable.awayTeamId, teamId))
      )
    )
    .all();
}

function onlyUserGames(month: CalendarMonth, teamIds: readonly string[]): boolean {
  return month.games.every((game) => teamIds.includes(game.team.teamId));
}

/** Monta una Copa con un partido del club y otro entre dos clubes ajenos. */
function insertCup(): { ownGameId: string; otherGameId: string } {
  const league = db.select().from(teamsTable).where(eq(teamsTable.id, MANAGED_TEAM)).get()!;
  const country = db
    .select()
    .from(competitionsTable)
    .where(eq(competitionsTable.id, league.competitionId))
    .get()!.country;
  const cup = db
    .select()
    .from(competitionsTable)
    .where(and(eq(competitionsTable.format, 'cup'), eq(competitionsTable.country, country)))
    .get()!;
  const rivals = db
    .select()
    .from(teamsTable)
    .where(eq(teamsTable.competitionId, league.competitionId))
    .all()
    .map((row) => row.id)
    .filter((id) => id !== MANAGED_TEAM);

  const seasonId = randomUUID();
  db.insert(seasonsTable)
    .values({
      id: seasonId,
      competitionId: cup.id,
      seasonNumber: 1,
      startYear,
      currentRound: 1,
      stage: 'playoffs',
      championTeamId: null
    })
    .run();

  const date = new Date(Date.UTC(startYear + 1, 0, 14));
  const ownGameId = randomUUID();
  const otherGameId = randomUUID();
  db.insert(gamesTable)
    .values([
      {
        id: ownGameId,
        seasonId,
        round: 1,
        scheduledOn: date,
        homeTeamId: rivals[0]!,
        awayTeamId: MANAGED_TEAM,
        neutralVenue: true
      },
      {
        id: otherGameId,
        seasonId,
        round: 1,
        scheduledOn: date,
        homeTeamId: rivals[1]!,
        awayTeamId: rivals[2]!,
        neutralVenue: true
      }
    ])
    .run();
  return { ownGameId, otherGameId };
}

describe('CalendarService', () => {
  it('un mes de liga: los partidos del club, con rival, pabellón y jornada', () => {
    const october = calendar.getMonth({ year: startYear, month: 10 });
    const expected = gamesOf(MANAGED_TEAM, startYear, 10);

    expect(october.year).toBe(startYear);
    expect(october.month).toBe(10);
    expect(october.scopes).toEqual(['club']);
    expect(october.games.length).toBeGreaterThan(0);
    expect(october.games.map((game) => game.gameId).sort()).toEqual(
      expected.map((game) => game.id).sort()
    );
    expect(onlyUserGames(october, [MANAGED_TEAM])).toBe(true);

    for (const game of october.games) {
      const row = expected.find((entry) => entry.id === game.gameId)!;
      const home = db.select().from(teamsTable).where(eq(teamsTable.id, row.homeTeamId)).get()!;
      const competition = db
        .select({ format: competitionsTable.format, name: competitionsTable.name })
        .from(seasonsTable)
        .innerJoin(competitionsTable, eq(competitionsTable.id, seasonsTable.competitionId))
        .where(eq(seasonsTable.id, row.seasonId))
        .get()!;
      expect(game.scope).toBe('club');
      expect(game.competitionName).toBe(competition.name);
      if (competition.format === 'league') {
        expect(game.kind).toBe('league');
        expect(game.roundLabel).toBe(`Jornada ${row.round}`);
      } else {
        // En octubre ya hay Europa entre semana: con su color y sin repetir su nombre.
        expect(game.kind).toBe('continental');
        expect(game.roundLabel.startsWith(competition.name)).toBe(false);
      }
      expect(game.side).toBe(row.homeTeamId === MANAGED_TEAM ? 'home' : 'away');
      expect(game.rival.teamId).toBe(game.side === 'home' ? row.awayTeamId : row.homeTeamId);
      expect(game.rival.name).not.toBe(game.rival.teamId);
      expect(game.venue).toBe(home.pavilionName);
      expect(game.played).toBe(false);
      expect(game.won).toBeNull();
    }
    expect(october.events.map((event) => event.kind)).toContain('payroll');
  });

  it('un partido jugado lleva el marcador y si lo ganó el usuario', () => {
    const [first] = gamesOf(MANAGED_TEAM, startYear, 10).sort(
      (a, b) => a.scheduledOn.getTime() - b.scheduledOn.getTime()
    );
    const userHome = first!.homeTeamId === MANAGED_TEAM;
    db.update(gamesTable)
      .set({ homeScore: userHome ? 70 : 90, awayScore: userHome ? 90 : 70, overtimes: 1 })
      .where(eq(gamesTable.id, first!.id))
      .run();

    const game = calendar
      .getMonth({ year: startYear, month: 10 })
      .games.find((entry) => entry.gameId === first!.id)!;

    expect(game.played).toBe(true);
    expect(game.won).toBe(false);
    expect(game.overtimes).toBe(1);
    expect([game.homeScore, game.awayScore]).toEqual(userHome ? [70, 90] : [90, 70]);
  });

  it('la Copa sale con su color y su ronda; el partido de otros clubes, no', () => {
    const cup = insertCup();

    const january = calendar.getMonth({ year: startYear + 1, month: 1 });
    const ids = january.games.map((game) => game.gameId);
    const own = january.games.find((game) => game.gameId === cup.ownGameId)!;

    expect(ids).toContain(cup.ownGameId);
    expect(ids).not.toContain(cup.otherGameId);
    expect(onlyUserGames(january, [MANAGED_TEAM])).toBe(true);
    expect(own.kind).toBe('cup');
    expect(own.competitionName).toBe('Copa Nacional');
    expect(own.roundLabel).toBe('Cuartos de final');
    expect(own.side).toBe('away');
    expect(own.neutralVenue).toBe(true);
    // Y por días, en orden.
    const days = january.games.map((game) => game.scheduledOn);
    expect(days).toEqual([...days].sort((a, b) => a - b));
  });

  it('con selección, sus partidos van aparte y se puede elegir banquillo', () => {
    new NationalService(() => db).takeTeam(SPAIN);
    const firstQualifier = qualifierDate(startYear, 1);

    const november = calendar.getMonth({
      year: firstQualifier.getUTCFullYear(),
      month: firstQualifier.getUTCMonth() + 1
    });
    const national = november.games.filter((game) => game.scope === 'national');

    expect(november.scopes).toEqual(['club', 'national']);
    expect(national.length).toBeGreaterThan(0);
    expect(national.every((game) => game.team.teamId === SPAIN && game.kind === 'national')).toBe(
      true
    );
    expect(national.every((game) => game.rival.nationOf !== null)).toBe(true);
    expect(onlyUserGames(november, [MANAGED_TEAM, SPAIN])).toBe(true);
    expect(november.events.some((event) => event.kind === 'national-window-start')).toBe(true);
  });

  it('sólo la temporada en curso: fuera de ella da el mes más cercano', () => {
    const before = calendar.getMonth({ year: startYear - 3, month: 2 });
    const after = calendar.getMonth({ year: startYear + 5, month: 2 });

    expect([before.year, before.month]).toEqual([startYear, 9]);
    expect([after.year, after.month]).toEqual([startYear + 1, 8]);
    expect(before.first).toEqual({ year: startYear, month: 9 });
    expect(before.last).toEqual({ year: startYear + 1, month: 8 });
    expect(before.events.map((event) => event.kind)).toContain('season-start');
  });

  it('valida la petición', () => {
    expect(() => calendar.getMonth({ year: startYear, month: 13 })).toThrow(ZodError);
    expect(() => calendar.getMonth({ year: 2025.5, month: 1 })).toThrow(ZodError);
  });
});
