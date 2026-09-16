import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { and, eq, isNotNull, isNull } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  closeSaveDatabase,
  openSaveDatabase,
  type SaveDatabase
} from '../../../database/save-database';
import { MAX_ROSTER } from '@shared/domain/youth';
import {
  boardTable,
  gamesTable,
  playersTable,
  seasonsTable,
  teamsTable
} from '../../../database/schema/save';
import { DraftService } from '../../draft/draft.service';
import { loadDataset } from '../../saves/dataset';
import { seedSave } from '../../saves/save-seeder';
import { SeasonService } from '../season.service';

/**
 * La liga americana con formato NBA.
 *
 * Los resultados se escriben a mano —gana siempre el mejor clasificado— para
 * poder recorrer en segundos lo que en partidos de verdad serían meses: aquí se
 * comprueba la estructura, no el baloncesto.
 */

const MIGRATIONS = resolve('drizzle/save');
const SEED_DIRECTORY = resolve('resources/seed-data');
const MANAGED_TEAM = 'usa-1-1';

let directory: string;
let filePath: string;
let db: SaveDatabase;
let season: SeasonService;

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'vbm-nba-'));
  filePath = join(directory, 'partida.sqlite');
  db = openSaveDatabase(filePath, MIGRATIONS);
  seedSave(db, loadDataset(SEED_DIRECTORY), { managedTeamId: MANAGED_TEAM, managerName: 'Carlos' });
  season = new SeasonService(() => db);
  season.getCurrent();
  db.delete(boardTable).run();
});

afterEach(() => {
  closeSaveDatabase(filePath);
  rmSync(directory, { recursive: true, force: true });
});

function leagueSeasonId(): string {
  return db
    .select()
    .from(seasonsTable)
    .where(and(eq(seasonsTable.competitionId, 'usa-1'), eq(seasonsTable.seasonNumber, 1)))
    .get()!.id;
}

/** Juega a mano los partidos pendientes de la liga: gana el de mejor número de equipo. */
function playPending(seasonId: string, onlyRegular: boolean): number {
  const strength = (teamId: string) => Number(teamId.split('-').pop());
  const pending = db
    .select()
    .from(gamesTable)
    .where(and(eq(gamesTable.seasonId, seasonId), isNull(gamesTable.homeScore)))
    .all()
    .filter((game) => !onlyRegular || game.seriesId === null);
  for (const game of pending) {
    const homeWins = strength(game.homeTeamId) < strength(game.awayTeamId);
    db.update(gamesTable)
      .set({ homeScore: homeWins ? 101 : 90, awayScore: homeWins ? 90 : 101 })
      .where(eq(gamesTable.id, game.id))
      .run();
    // Una serie decidida borra sus partidos sobrantes: hay que dejar que lo haga.
    if (game.seriesId) {
      season.getStandings('usa-1');
    }
  }
  return pending.length;
}

describe('estructura', () => {
  it('dos conferencias de quince con tres divisiones de cinco', () => {
    const standings = season.getStandings('usa-1');
    expect(standings).toHaveLength(30);
    for (const conference of ['east', 'west']) {
      const rows = standings.filter((row) => row.conference === conference);
      expect(rows).toHaveLength(15);
      expect(new Set(rows.map((row) => row.division)).size).toBe(3);
      expect(rows.filter((row) => row.zone === 'playoffs')).toHaveLength(6);
      expect(rows.filter((row) => row.zone === 'playIn')).toHaveLength(4);
      expect(rows.some((row) => row.zone === 'relegation')).toBe(false);
    }
  });

  it('la liga sale marcada como NBA', () => {
    const league = season.listLeagues().find((row) => row.competitionId === 'usa-1');
    expect(league?.nbaFormat).toBe(true);
    expect(league?.playoffTeams).toBe(16);
  });
});

describe('postemporada', () => {
  it(
    'play-in, cuatro rondas al mejor de siete y campeón; y nadie baja',
    { timeout: 120_000 },
    () => {
      const seasonId = leagueSeasonId();
      playPending(seasonId, true);

      // Fin de la regular: el play-in, cuatro partidos a partido único.
      season.getStandings('usa-1');
      let bracket = season.getPlayoffs('usa-1')!;
      expect(bracket.rounds[0]!.name).toBe('Play-in');
      expect(bracket.rounds[0]!.series).toHaveLength(4);

      // Los cuatro primeros deciden quién juega por el octavo.
      playPending(seasonId, false);
      season.getStandings('usa-1');
      bracket = season.getPlayoffs('usa-1')!;
      expect(bracket.rounds[0]!.series).toHaveLength(6);

      playPending(seasonId, false);
      season.getStandings('usa-1');
      bracket = season.getPlayoffs('usa-1')!;
      const firstRound = bracket.rounds.find((round) => round.name === 'Primera ronda')!;
      expect(firstRound.series).toHaveLength(8);
      expect(firstRound.bestOf).toBe(7);

      for (let guard = 0; guard < 10; guard += 1) {
        if (playPending(seasonId, false) === 0) {
          break;
        }
        season.getStandings('usa-1');
      }

      bracket = season.getPlayoffs('usa-1')!;
      expect(bracket.rounds.map((round) => round.name)).toEqual([
        'Play-in',
        'Primera ronda',
        'Semifinales de conferencia',
        'Finales de conferencia',
        'Finales'
      ]);
      expect(bracket.championTeamId).not.toBeNull();
      // Las finales cruzan conferencias.
      const finals = bracket.rounds.at(-1)!.series[0]!;
      const standings = season.getStandings('usa-1');
      const conferenceOf = (teamId: string) =>
        standings.find((row) => row.teamId === teamId)?.conference;
      expect(conferenceOf(finals.higherSeedTeamId)).not.toBe(conferenceOf(finals.lowerSeedTeamId));

      // El draft se abre con la temporada acabada: dos rondas de treinta, cuatro
      // elecciones sorteadas y una clase con más prospectos que elecciones.
      const draft = new DraftService(() => db);
      let view = draft.get()!;
      expect(view.status).toBe('open');
      expect(view.picks).toHaveLength(60);
      expect(view.picks.filter((row) => row.lotteryWinner)).toHaveLength(4);
      expect(view.prospects.length).toBeGreaterThan(60);
      // El campeón elige el último de cada ronda: no juega la lotería.
      expect(view.picks.findIndex((row) => row.isUser)).toBeGreaterThanOrEqual(14);

      view = draft.simulateToUser()!;
      expect(view.userOnTheClock).toBe(true);
      const rosterBefore = db
        .select()
        .from(playersTable)
        .where(eq(playersTable.teamId, MANAGED_TEAM))
        .all().length;
      const chosen = view.prospects[0]!.playerId;
      if (view.rosterFull) {
        draft.pass();
      } else {
        draft.pick(chosen);
        const rookie = db.select().from(playersTable).where(eq(playersTable.id, chosen)).get()!;
        expect(rookie.teamId).toBe(MANAGED_TEAM);
        expect(rookie.draftClass).toBeNull();
        expect(rookie.wageCents).toBeGreaterThan(0);
        expect(
          db.select().from(playersTable).where(eq(playersTable.teamId, MANAGED_TEAM)).all().length
        ).toBe(rosterBefore + 1);
      }

      view = draft.simulateAll()!;
      expect(view.status).toBe('done');
      for (const teamId of new Set(view.picks.map((row) => row.teamId))) {
        const roster = db
          .select()
          .from(playersTable)
          .where(and(eq(playersTable.teamId, teamId), eq(playersTable.isYouth, false)))
          .all();
        expect(roster.length).toBeLessThanOrEqual(MAX_ROSTER);
      }

      // Sin descensos: con la temporada acabada, nadie cambia de liga.
      const before = db
        .select()
        .from(teamsTable)
        .where(eq(teamsTable.competitionId, 'usa-1'))
        .all()
        .map((team) => team.id)
        .sort();
      for (const row of db.select().from(seasonsTable).all()) {
        db.update(seasonsTable).set({ stage: 'finished' }).where(eq(seasonsTable.id, row.id)).run();
      }
      season.startNextSeason();
      // Los que nadie eligió ya son agentes libres.
      expect(
        db.select().from(playersTable).where(isNotNull(playersTable.draftClass)).all()
      ).toHaveLength(0);
      const after = db
        .select()
        .from(teamsTable)
        .where(eq(teamsTable.competitionId, 'usa-1'))
        .all()
        .map((team) => team.id)
        .sort();
      expect(after).toEqual(before);
    }
  );
});
