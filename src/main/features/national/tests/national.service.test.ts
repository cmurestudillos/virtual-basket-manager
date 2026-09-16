import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { and, eq, isNotNull, lt } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  NATIONAL_SQUAD_SIZE,
  WORLD_CUP_TEAMS,
  callupDate,
  dutyPeriod,
  qualifierDate
} from '@shared/domain/national-teams';
import {
  closeSaveDatabase,
  openSaveDatabase,
  type SaveDatabase
} from '../../../database/save-database';
import {
  boardTable,
  gamesTable,
  gameStateTable,
  nationalCallupsTable,
  nationalGroupsTable,
  playersTable,
  seasonsTable,
  teamsTable
} from '../../../database/schema/save';
import { CareerService } from '../../career/career.service';
import { BoardService } from '../../club/board.service';
import { MarketRepository } from '../../market/market.repository';
import { buildEngineTeam } from '../../match/engine-input';
import { RotationService } from '../../rotation/rotation.service';
import { loadDataset } from '../../saves/dataset';
import { seedSave } from '../../saves/save-seeder';
import { SeasonNotFinishedError, SeasonService } from '../../season/season.service';
import {
  QUALIFIERS_COMPETITION_ID,
  WORLD_CUP_COMPETITION_ID,
  playersOnNationalDuty
} from '../national-squad';
import { NationalService } from '../national.service';

/**
 * Selecciones dentro de una partida de verdad.
 *
 * Los partidos de club que no importan se dan por jugados escribiendo el
 * resultado: aquí se comprueba el calendario de selecciones, no una liga.
 */

const MIGRATIONS = resolve('drizzle/save');
const SEED_DIRECTORY = resolve('resources/seed-data');
const MANAGED_TEAM = 'liga-nacional-1';
const SPAIN = 'seleccion-esp';

let directory: string;
let filePath: string;
let db: SaveDatabase;
let season: SeasonService;
let national: NationalService;

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'vbm-selecciones-'));
  filePath = join(directory, 'partida.sqlite');
  db = openSaveDatabase(filePath, MIGRATIONS);
  seedSave(db, loadDataset(SEED_DIRECTORY), { managedTeamId: MANAGED_TEAM, managerName: 'Carlos' });
  season = new SeasonService(() => db);
  national = new NationalService(() => db);
  season.getCurrent();
  // El consejo, fuera: aquí no se mide el banquillo del club.
  db.delete(boardTable).run();
});

afterEach(() => {
  closeSaveDatabase(filePath);
  rmSync(directory, { recursive: true, force: true });
});

function startYear(): number {
  return season.getCurrent().startYear;
}

function setDate(date: Date): void {
  db.update(gameStateTable).set({ currentDate: date }).run();
}

/** Da por jugados los partidos de club anteriores a una fecha. */
function playClubGamesBefore(date: Date): void {
  const nationalSeasons = new Set(national.seasonIds(1));
  for (const game of db.select().from(gamesTable).where(lt(gamesTable.scheduledOn, date)).all()) {
    if (!nationalSeasons.has(game.seasonId) && game.homeScore === null) {
      db.update(gamesTable)
        .set({ homeScore: 80, awayScore: 75 })
        .where(eq(gamesTable.id, game.id))
        .run();
    }
  }
}

describe('el curso de selecciones', () => {
  it('nace con la temporada: 21 selecciones, que no son clubes', () => {
    const teams = db.select().from(teamsTable).where(isNotNull(teamsTable.nationalOf)).all();
    expect(teams).toHaveLength(21);
    expect(new MarketRepository(db).listTeams().some((team) => team.nationalOf)).toBe(false);
  });

  it('la clasificación son cinco grupos de cuatro a ida y vuelta, sin el anfitrión', () => {
    const overview = national.getOverview();
    const qualifiers = overview.qualifiers!;

    expect(qualifiers.groups).toHaveLength(5);
    for (const group of qualifiers.groups) {
      expect(group.standings).toHaveLength(4);
      expect(group.fixtures).toHaveLength(12);
    }
    expect(qualifiers.hostName).not.toBeNull();
    const grouped = qualifiers.groups.flatMap((group) =>
      group.standings.map((row) => row.teamName)
    );
    expect(grouped).not.toContain(qualifiers.hostName);
  });

  it('las convocatorias llegan en su fecha, con doce por selección', () => {
    const year = startYear();
    setDate(new Date(callupDate(year, 'november').getTime() - 24 * 60 * 60 * 1000));
    season.getCurrent();
    expect(db.select().from(nationalCallupsTable).all()).toHaveLength(0);

    setDate(callupDate(year, 'november'));
    season.getCurrent();
    const callups = db.select().from(nationalCallupsTable).all();
    const byTeam = new Map<string, number>();
    for (const row of callups) {
      byTeam.set(row.nationalTeamId, (byTeam.get(row.nationalTeamId) ?? 0) + 1);
    }
    expect(byTeam.size).toBe(20);
    for (const count of byTeam.values()) {
      expect(count).toBeGreaterThanOrEqual(8);
      expect(count).toBeLessThanOrEqual(NATIONAL_SQUAD_SIZE);
    }
  });

  it('el convocado se pierde el domingo con su club', () => {
    const year = startYear();
    setDate(callupDate(year, 'november'));
    season.getCurrent();

    const { from, to } = dutyPeriod(year, 'november');
    const sunday = new Date(from.getTime() + 2 * 24 * 60 * 60 * 1000);
    const onDuty = playersOnNationalDuty(db, sunday);
    expect(onDuty.size).toBeGreaterThan(0);
    expect(playersOnNationalDuty(db, new Date(to.getTime() + 2 * 24 * 60 * 60 * 1000)).size).toBe(
      0
    );

    const called = db.select().from(playersTable).where(isNotNull(playersTable.teamId)).all();
    const club = called.find((row) => onDuty.has(row.id))!.teamId as string;
    const lineup = buildEngineTeam(db, club, sunday).players.map((player) => player.id);
    expect(lineup.some((id) => onDuty.has(id))).toBe(false);
    // Y fuera de la ventana vuelve a estar.
    const back = buildEngineTeam(db, club, new Date(to.getTime() + 6 * 24 * 60 * 60 * 1000));
    expect(back.players.some((player) => onDuty.has(player.id))).toBe(true);
  });

  it(
    'sin selección que dirigir, el verano se juega solo al cambiar de temporada',
    { timeout: 300_000 },
    () => {
      for (const row of db.select().from(seasonsTable).all()) {
        if (![QUALIFIERS_COMPETITION_ID, WORLD_CUP_COMPETITION_ID].includes(row.competitionId)) {
          db.update(seasonsTable)
            .set({ stage: 'finished' })
            .where(eq(seasonsTable.id, row.id))
            .run();
        }
      }

      const next = season.startNextSeason();
      expect(next.seasonNumber).toBe(2);

      const worldCup = db
        .select()
        .from(seasonsTable)
        .where(
          and(
            eq(seasonsTable.competitionId, WORLD_CUP_COMPETITION_ID),
            eq(seasonsTable.seasonNumber, 1)
          )
        )
        .get()!;
      expect(worldCup.stage).toBe('finished');
      expect(worldCup.championTeamId).not.toBeNull();
      expect(
        db
          .select()
          .from(nationalGroupsTable)
          .where(eq(nationalGroupsTable.seasonId, worldCup.id))
          .all()
      ).toHaveLength(WORLD_CUP_TEAMS);
      const knockout = db
        .select()
        .from(gamesTable)
        .where(eq(gamesTable.seasonId, worldCup.id))
        .all()
        .filter((game) => game.round >= 4);
      expect(knockout).toHaveLength(7);

      // Con el Mundial jugado se abre el mercado de seleccionadores: nunca más
      // de tres, y quien coge una ahora empieza a contar en el curso nuevo.
      const vacancies = national.vacancies(99);
      expect(vacancies.length).toBeLessThanOrEqual(3);
      if (vacancies[0]) {
        national.takeTeam(vacancies[0].teamId);
        expect(national.spells()[0]?.startSeason).toBe(2);
      }

      // Y el curso siguiente trae su propia clasificación.
      season.getCurrent();
      expect(national.getOverview().qualifiers?.seasonNumber).toBe(2);
      expect(national.getOverview().champions).toHaveLength(1);
    }
  );
});

describe('dirigir una selección', () => {
  beforeEach(() => national.takeTeam(SPAIN));

  it('el reloj se para en su partido, como en el del club', () => {
    const friday = qualifierDate(startYear(), 1);
    playClubGamesBefore(friday);
    setDate(friday);

    // El anfitrión del primer Mundial es Argentina, así que España juega la
    // clasificación desde noviembre.
    expect(national.getOverview().qualifiers!.hostName).toBe('Argentina');
    const result = season.advanceDay();

    expect(result.status).toBe('userGame');
    const game = db
      .select()
      .from(gamesTable)
      .where(eq(gamesTable.id, (result as { gameId: string }).gameId))
      .get()!;
    expect([game.homeTeamId, game.awayTeamId]).toContain(SPAIN);
  });

  it('la lista se da en su fecha y se puede cambiar hasta el partido', () => {
    const year = startYear();
    expect(national.getCallup()?.editable).toBe(false);

    setDate(callupDate(year, 'november'));
    season.getCurrent();
    const view = national.getCallup()!;
    expect(view.editable).toBe(true);

    const blocked = view.candidates.find((row) => !row.released);
    const fit = view.candidates.filter((row) => row.released && row.injuryDaysLeft === 0);
    if (blocked) {
      const refused = national.saveCallup({
        playerIds: [...fit.slice(0, 7).map((row) => row.playerId), blocked.playerId]
      });
      expect(refused.ok).toBe(false);
    }

    const chosen = fit.slice(-8).map((row) => row.playerId);
    const saved = national.saveCallup({ playerIds: chosen });
    expect(saved.ok).toBe(true);
    expect(
      saved
        .view!.candidates.filter((row) => row.selected)
        .map((row) => row.playerId)
        .sort()
    ).toEqual([...chosen].sort());

    // La alineación de la selección es la de sus convocados.
    const rotation = new RotationService(() => db).get(SPAIN);
    expect(rotation.slots.map((slot) => slot.playerId).sort()).toEqual([...chosen].sort());
    expect(rotation.isManaged).toBe(true);
  });

  it('con partidos de selección pendientes la temporada no se cierra', () => {
    for (const row of db.select().from(seasonsTable).all()) {
      if (![QUALIFIERS_COMPETITION_ID, WORLD_CUP_COMPETITION_ID].includes(row.competitionId)) {
        db.update(seasonsTable).set({ stage: 'finished' }).where(eq(seasonsTable.id, row.id)).run();
      }
    }

    expect(national.userHasPendingGames(1)).toBe(true);
    expect(season.getCurrent().pendingLeagues).toContain('Tu selección');
    expect(() => season.startNextSeason()).toThrow(SeasonNotFinishedError);
  });

  it('dejarla la cierra, y sin selección el reloj ya no para en sus partidos', () => {
    expect(national.leaveTeam()).toBe(true);
    expect(national.userTeamId()).toBeNull();
    expect(national.getCallup()).toBeNull();
  });
});

describe('en el paro, con selección', () => {
  it('sin club, el reloj sigue corriendo para dirigir a la selección', () => {
    // Una partida de carrera, con el entrenador destituido del club.
    closeSaveDatabase(filePath);
    rmSync(directory, { recursive: true, force: true });
    directory = mkdtempSync(join(tmpdir(), 'vbm-selecciones-'));
    filePath = join(directory, 'partida.sqlite');
    db = openSaveDatabase(filePath, MIGRATIONS);
    seedSave(db, loadDataset(SEED_DIRECTORY), {
      managedTeamId: MANAGED_TEAM,
      managerName: 'Carlos',
      careerMode: true
    });
    season = new SeasonService(() => db);
    national = new NationalService(() => db);
    season.getCurrent();
    new BoardService(() => db).ensureForSeason(1, 18);
    db.update(boardTable).set({ confidence: 0, dismissed: true }).run();
    expect(new CareerService(() => db).getStatus().unemployed).toBe(true);

    // Sin selección, el reloj normal no corre.
    expect(season.advanceDay().status).toBe('dismissed');

    national.takeTeam(SPAIN);
    expect(season.advanceDay().status).not.toBe('dismissed');
    expect(new CareerService(() => db).getStatus().nationalTeamName).toBe('España');
  });
});
