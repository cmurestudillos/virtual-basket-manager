import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { and, eq, inArray, lte } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cupCutoffRound } from '@shared/domain/cup';
import {
  closeSaveDatabase,
  openSaveDatabase,
  type SaveDatabase
} from '../../../database/save-database';
import {
  boardTable,
  gamesTable,
  gameStateTable,
  seasonsTable,
  teamsTable
} from '../../../database/schema/save';
import { loadDataset } from '../../saves/dataset';
import { seedSave } from '../../saves/save-seeder';
import { MatchService } from '../../match/match.service';
import { SeasonNotFinishedError, SeasonService } from '../season.service';

/**
 * Jugar varios países a la vez.
 *
 * Una temporada entera de dos países cuesta minutos, así que aquí los
 * resultados se escriben a mano cuando lo que se comprueba no es el partido
 * sino lo que pasa alrededor: que Grecia tenga calendario, copa y ascensos, y
 * que el curso no se cierre mientras le quede una liga por terminar.
 */

const MIGRATIONS = resolve('drizzle/save');
const SEED_DIRECTORY = resolve('resources/seed-data');
const MANAGED_TEAM = 'liga-nacional-1';

let directory: string;
let filePath: string;
let db: SaveDatabase;
let season: SeasonService;

function openSave(activeCountries?: string[]): void {
  directory = mkdtempSync(join(tmpdir(), 'vbm-paises-'));
  filePath = join(directory, 'partida.sqlite');
  db = openSaveDatabase(filePath, MIGRATIONS);
  seedSave(db, loadDataset(SEED_DIRECTORY), {
    managedTeamId: MANAGED_TEAM,
    managerName: 'Carlos',
    activeCountries
  });
  season = new SeasonService(() => db);
  season.getCurrent();
  // El consejo, fuera: aquí se comprueba el calendario, no el banquillo.
  db.delete(boardTable).run();
}

/** Las temporadas de liga de unas competiciones en el curso en marcha. */
function seasonsOf(competitionIds: string[]) {
  return db
    .select()
    .from(seasonsTable)
    .where(inArray(seasonsTable.competitionId, competitionIds))
    .all();
}

/** Da por jugados los partidos de liga regular de unas temporadas, hasta una jornada. */
function playRegular(seasonIds: string[], upToRound = Infinity): void {
  const games = db
    .select()
    .from(gamesTable)
    .where(inArray(gamesTable.seasonId, seasonIds))
    .all()
    .filter((game) => !game.seriesId && game.round <= upToRound);
  for (const game of games) {
    // El local gana por un margen que depende del partido: hay clasificación.
    const margin = (game.id.charCodeAt(0) % 9) + 1;
    db.update(gamesTable)
      .set({ homeScore: 80 + margin, awayScore: 80 })
      .where(eq(gamesTable.id, game.id))
      .run();
  }
}

function finishSeasons(competitionIds: string[]): void {
  for (const row of seasonsOf(competitionIds)) {
    db.update(seasonsTable).set({ stage: 'finished' }).where(eq(seasonsTable.id, row.id)).run();
  }
}

afterEach(() => {
  closeSaveDatabase(filePath);
  rmSync(directory, { recursive: true, force: true });
});

describe('España y Grecia', () => {
  beforeEach(() => openSave(['GRE']));

  it('las dos divisiones griegas arrancan a la vez que las españolas', () => {
    const leagues = season.listLeagues();

    expect(leagues.map((row) => row.competitionId)).toEqual([
      'liga-nacional',
      'liga-plata',
      'grecia-1',
      'grecia-2'
    ]);
    expect(leagues.map((row) => row.countryName)).toEqual(['España', 'España', 'Grecia', 'Grecia']);
    expect(leagues.filter((row) => row.isManaged)).toHaveLength(1);
    expect(leagues.find((row) => row.competitionId === 'grecia-1')?.totalRounds).toBeGreaterThan(0);
  });

  it('las ligas que no se eligieron no tienen temporada', () => {
    expect(seasonsOf(['italia-1', 'turquia-1', 'alemania-1'])).toHaveLength(0);
  });

  it('la clasificación griega marca sus propias zonas', () => {
    const primera = season.getStandings('grecia-1');
    const segunda = season.getStandings('grecia-2');

    expect(primera).toHaveLength(14);
    expect(primera.filter((row) => row.zone === 'playoffs')).toHaveLength(8);
    expect(primera.filter((row) => row.zone === 'relegation')).toHaveLength(2);
    expect(segunda.filter((row) => row.zone === 'promotion')).toHaveLength(2);
    expect(segunda.some((row) => row.zone === 'relegation')).toBe(false);
  });

  it('una liga que no se juega devuelve la del usuario, no un error', () => {
    expect(season.getStandings('italia-1')).toHaveLength(18);
    expect(season.listFixtures(1, 'italia-1')).toEqual(season.listFixtures(1));
  });

  it('el reloj juega los partidos griegos los mismos días que los españoles', () => {
    const match = new MatchService(() => db);
    for (let guard = 0; guard < 10; guard += 1) {
      const result = season.advanceToNextGame();
      if (result.status !== 'userGame') {
        continue;
      }
      match.start(result.gameId);
      let state = match.advancePeriod(result.gameId);
      while (!state.finished) {
        state = match.advancePeriod(result.gameId);
      }
      break;
    }
    season.advanceDay();

    const spanish = season.listFixtures(1);
    const greek = season.listFixtures(1, 'grecia-1');
    expect(greek[0]?.scheduledOn).toBe(spanish[0]?.scheduledOn);
    expect(spanish.every((game) => game.played)).toBe(true);
    expect(greek.every((game) => game.played)).toBe(true);
    expect(season.listFixtures(1, 'grecia-2').every((game) => game.played)).toBe(true);
  });

  it('Grecia tiene su copa, con los ocho primeros de su primera división al cerrar la primera vuelta', () => {
    const [greekSeason] = seasonsOf(['grecia-1']);
    const totalRounds = season
      .listLeagues()
      .find((row) => row.competitionId === 'grecia-1')!.totalRounds;
    expect(season.getCup('GRE')).toBeNull();

    playRegular([greekSeason!.id], cupCutoffRound(totalRounds));
    const bracket = season.getCup('GRE');

    expect(bracket?.competitionName).toBe('Kýpello Elládos');
    const teams = bracket!.rounds[0]!.ties.flatMap((tie) => [tie.homeTeamId, tie.awayTeamId]);
    const topEight = season
      .getStandings('grecia-1')
      .slice(0, 8)
      .map((row) => row.teamId);
    expect(new Set(teams)).toEqual(new Set(topEight));
    // Y la española sigue a lo suyo: su primera vuelta no se ha jugado.
    expect(season.getCup()).toBeNull();
  });

  it('la copa de un país que no se juega no existe', () => {
    expect(season.getCup('ITA')).toBeNull();
  });

  it('con la liga del usuario acabada, la temporada sigue mientras falte la griega', () => {
    finishSeasons(['liga-nacional', 'liga-plata']);

    const current = season.getCurrent();
    expect(current.stage).toBe('finished');
    expect(current.pendingLeagues).toEqual(['A1 Ethnikí', 'A2 Ethnikí']);
    expect(season.advanceDay().status).not.toBe('seasonOver');
    expect(() => season.startNextSeason()).toThrow(SeasonNotFinishedError);
  });

  it(
    'acabadas todas, se pasa de temporada con ascensos también en Grecia',
    { timeout: 180_000 },
    () => {
      const greek = seasonsOf(['grecia-1', 'grecia-2']);
      playRegular(greek.map((row) => row.id));
      finishSeasons(['liga-nacional', 'liga-plata', 'grecia-1', 'grecia-2']);

      const lastOfFirst = season
        .getStandings('grecia-1')
        .slice(-2)
        .map((row) => row.teamId);
      const topOfSecond = season
        .getStandings('grecia-2')
        .slice(0, 2)
        .map((row) => row.teamId);
      expect(season.getCurrent().pendingLeagues).toEqual([]);

      const next = season.startNextSeason();
      expect(next.seasonNumber).toBe(2);

      const competitionOf = (teamId: string) =>
        db.select().from(teamsTable).where(eq(teamsTable.id, teamId)).get()?.competitionId;
      for (const teamId of lastOfFirst) {
        expect(competitionOf(teamId)).toBe('grecia-2');
      }
      for (const teamId of topOfSecond) {
        expect(competitionOf(teamId)).toBe('grecia-1');
      }
      // Y el curso nuevo vuelve a tener calendario griego.
      expect(
        db
          .select()
          .from(seasonsTable)
          .where(and(eq(seasonsTable.competitionId, 'grecia-1'), lte(seasonsTable.seasonNumber, 2)))
          .all()
      ).toHaveLength(2);
    }
  );
});

describe('partidas de antes de poder elegir', () => {
  beforeEach(() => {
    openSave();
  });

  it('sin elección guardada se juega sólo el país del club', () => {
    db.update(gameStateTable).set({ activeCountries: null }).run();

    expect(season.listLeagues().map((row) => row.country)).toEqual(['ESP', 'ESP']);
    expect(season.getCurrent().pendingLeagues).toEqual(['Liga Nacional', 'Liga Plata']);
  });

  it('una partida nueva sin elegir guarda el país del club', () => {
    expect(db.select().from(gameStateTable).get()?.activeCountries).toBe('["ESP"]');
  });
});
