import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { and, eq, isNotNull, or } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { NO_SCOUT_ERROR } from '@shared/domain/staff';
import {
  closeSaveDatabase,
  openSaveDatabase,
  type SaveDatabase
} from '../../../database/save-database';
import { gamesTable, seasonsTable, staffTable, teamsTable } from '../../../database/schema/save';
import { loadDataset } from '../../saves/dataset';
import { seedSave } from '../../saves/save-seeder';
import { SeasonService } from '../../season/season.service';
import { NationalTeamProfileError, TeamProfileService, teamOverall } from '../team-profile.service';

/**
 * La ficha de un club contra una partida sembrada de verdad. Lo que importa es
 * la visibilidad que decidió el usuario: del club propio se ve todo; de uno
 * ajeno, nunca la caja ni la moral, la media con la niebla del ojeador y la
 * pizarra sólo con un analista competente.
 */

const MIGRATIONS = resolve('drizzle/save');
const SEED_DIRECTORY = resolve('resources/seed-data');
const MANAGED_TEAM = 'liga-nacional-1';
const RIVAL_TEAM = 'liga-nacional-2';

let directory: string;
let filePath: string;
let db: SaveDatabase;
let season: SeasonService;
let profiles: TeamProfileService;

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'vbm-ficha-'));
  filePath = join(directory, 'partida.sqlite');
  db = openSaveDatabase(filePath, MIGRATIONS);
  seedSave(db, loadDataset(SEED_DIRECTORY), {
    managedTeamId: MANAGED_TEAM,
    managerName: 'Carlos'
  });

  const resolveDb = (): SaveDatabase => db;
  season = new SeasonService(resolveDb);
  profiles = new TeamProfileService(resolveDb);
  // La temporada se crea al primer vistazo, como en el juego.
  season.getCurrent();
});

afterEach(() => {
  closeSaveDatabase(filePath);
  rmSync(directory, { recursive: true, force: true });
});

/** Pone el puesto del club del usuario al nivel pedido; 0 lo deja vacante. */
function setStaffLevel(role: 'scout' | 'analyst', level: number): void {
  const filter = and(eq(staffTable.teamId, MANAGED_TEAM), eq(staffTable.role, role));
  if (level === 0) {
    db.update(staffTable).set({ teamId: null }).where(filter).run();
    return;
  }
  db.update(staffTable).set({ level }).where(filter).run();
}

/** El primer partido del curso entre el usuario y el rival. */
function gameBetweenUs() {
  return db
    .select()
    .from(gamesTable)
    .where(
      or(
        and(eq(gamesTable.homeTeamId, MANAGED_TEAM), eq(gamesTable.awayTeamId, RIVAL_TEAM)),
        and(eq(gamesTable.homeTeamId, RIVAL_TEAM), eq(gamesTable.awayTeamId, MANAGED_TEAM))
      )
    )
    .all()[0]!;
}

describe('la ficha de un club ajeno', () => {
  it('enseña el club, su liga, su plantilla con sueldo y contrato, y ni caja ni moral', () => {
    const profile = profiles.get(RIVAL_TEAM)!;

    expect(profile.isManaged).toBe(false);
    expect(profile.name).not.toBe('');
    expect(profile.pavilionCapacity).toBeGreaterThan(0);
    expect(profile.competitionName).not.toBe('');
    expect(profile.coach).toBeNull();
    expect(profile.objective.label).not.toBe('');
    expect(profile.standing?.teamId).toBe(RIVAL_TEAM);
    expect(profile.leagueTeams).toBeGreaterThan(1);
    expect(profile.squad.length).toBeGreaterThanOrEqual(10);
    for (const player of profile.squad) {
      expect(player.morale).toBeNull();
      expect(player.wageCents).toBeGreaterThan(0);
      expect(player.contractYearsLeft).toBeGreaterThanOrEqual(0);
    }
    // Ni la caja ni las nóminas del club viajan en la ficha.
    const json = JSON.stringify(profile);
    expect(json).not.toMatch(/budget|balance|seasonWages/i);
  });

  it('la media, los atributos y el potencial llevan el margen del ojeador', () => {
    setStaffLevel('scout', 3);
    const fogged = profiles.get(RIVAL_TEAM)!;

    expect(fogged.uncertainty).toBeGreaterThan(0);
    expect(fogged.overall).not.toBeNull();
    expect(fogged.squad.every((player) => player.uncertainty === fogged.uncertainty)).toBe(true);
    expect(fogged.overall).toBe(teamOverall(fogged.squad.map((player) => player.overall)));

    // Sin ojeador no se sabe ni la media del equipo.
    setStaffLevel('scout', 0);
    const blind = profiles.get(RIVAL_TEAM)!;
    expect(blind.uncertainty).toBe(NO_SCOUT_ERROR);
    expect(blind.overall).toBeNull();
  });

  it('la pizarra y el quinteto sólo llegan con un analista competente', () => {
    setStaffLevel('analyst', 1);
    const withoutReport = profiles.get(RIVAL_TEAM)!;
    expect(withoutReport.report).toBeNull();

    setStaffLevel('analyst', 3);
    const report = profiles.get(RIVAL_TEAM)!.report;
    expect(report).not.toBeNull();
    expect(report!.tactics.teamId).toBe(RIVAL_TEAM);
    expect(report!.tactics.offensiveSystem).not.toBe('');
    expect(report!.usualFive).toHaveLength(5);

    setStaffLevel('analyst', 0);
    expect(profiles.get(RIVAL_TEAM)!.report).toBeNull();
  });

  it('cuenta el cara a cara con el club del usuario, este curso y de siempre', () => {
    const before = profiles.get(RIVAL_TEAM)!.headToHead!;
    expect(before.games.length).toBeGreaterThan(0);
    expect(before.played).toBe(0);

    // Se da por jugado el primero de los dos, con victoria del usuario.
    const game = gameBetweenUs();
    const managedHome = game.homeTeamId === MANAGED_TEAM;
    db.update(gamesTable)
      .set({ homeScore: managedHome ? 88 : 70, awayScore: managedHome ? 70 : 88 })
      .where(eq(gamesTable.id, game.id))
      .run();

    const after = profiles.get(RIVAL_TEAM)!;
    expect(after.headToHead).toMatchObject({ played: 1, managedWins: 1, teamWins: 0 });
    expect(after.headToHead!.games.find((row) => row.gameId === game.id)?.played).toBe(true);
    // Y es su último resultado: una derrota por 18.
    expect(after.form.at(-1)).toMatchObject({ gameId: game.id, won: false, score: [70, 88] });
    expect(after.games.find((row) => row.gameId === game.id)?.kind).toBe('league');
  });

  it('su palmarés sale de las temporadas que acabó campeón', () => {
    expect(profiles.get(RIVAL_TEAM)!.totalTrophies).toBe(0);

    const current = season.getCurrent();
    db.update(seasonsTable)
      .set({ championTeamId: RIVAL_TEAM })
      .where(eq(seasonsTable.id, current.id))
      .run();

    const profile = profiles.get(RIVAL_TEAM)!;
    expect(profile.totalTrophies).toBe(1);
    expect(profile.trophies[0]).toMatchObject({
      competitionId: current.competitionId,
      seasons: [current.seasonNumber]
    });
  });
});

describe('la ficha del club propio', () => {
  it('se ve entera: sin niebla, con la moral y con su pizarra aunque no haya analista', () => {
    setStaffLevel('analyst', 0);
    setStaffLevel('scout', 0);
    const profile = profiles.get(MANAGED_TEAM)!;

    expect(profile.isManaged).toBe(true);
    expect(profile.uncertainty).toBe(0);
    expect(profile.overall).not.toBeNull();
    expect(profile.squad.every((player) => player.uncertainty === 0)).toBe(true);
    expect(profile.squad.every((player) => typeof player.morale === 'number')).toBe(true);
    expect(profile.report?.usualFive).toHaveLength(5);
    // Contra uno mismo no hay cara a cara.
    expect(profile.headToHead).toBeNull();
  });
});

describe('lo que no es una ficha', () => {
  it('un club que no existe no tiene ficha y una selección se rechaza', () => {
    expect(profiles.get('no-existe')).toBeNull();

    const national = db.select().from(teamsTable).where(isNotNull(teamsTable.nationalOf)).get();
    expect(national).toBeDefined();
    expect(() => profiles.get(national!.id)).toThrow(NationalTeamProfileError);
  });

  it('la media de un equipo es la de sus ocho mejores', () => {
    expect(teamOverall([])).toBeNull();
    expect(teamOverall([90, 80, 70, 70, 70, 70, 70, 70, 10, 10])).toBe(74);
  });
});
