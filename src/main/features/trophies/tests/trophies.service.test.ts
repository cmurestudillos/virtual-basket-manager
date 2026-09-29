import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { and, eq, isNull } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { POSITIONS, type Position } from '@shared/domain/positions';
import type { PendingCelebration } from '@shared/contracts/trophies.contract';
import {
  closeSaveDatabase,
  openSaveDatabase,
  type SaveDatabase
} from '../../../database/save-database';
import {
  boardTable,
  celebrationsTable,
  gamePlayerStatsTable,
  gamesTable,
  playersTable,
  seasonAwardsTable,
  seasonsTable,
  type NewGamePlayerStatsRow
} from '../../../database/schema/save';
import { HistoryService } from '../../history/history.service';
import { NationalService } from '../../national/national.service';
import { loadDataset } from '../../saves/dataset';
import { seedSave } from '../../saves/save-seeder';
import { SeasonService } from '../../season/season.service';
import { TrophyService } from '../trophies.service';

/**
 * Trofeos dentro de una partida de verdad.
 *
 * Los resultados se escriben a mano —el equipo del usuario gana siempre, y en
 * los demás partidos gana el local— con un acta sintética por partido, para
 * recorrer en segundos una temporada entera: liga, playoffs, Copa, Europa y
 * Mundial. Aquí se comprueba quién levanta qué y cuándo sale cada pantalla, no
 * el baloncesto.
 */

const MIGRATIONS = resolve('drizzle/save');
const SEED_DIRECTORY = resolve('resources/seed-data');

interface World {
  directory: string;
  filePath: string;
  db: SaveDatabase;
  season: SeasonService;
  trophies: TrophyService;
}

function createWorld(managedTeamId: string): World {
  const directory = mkdtempSync(join(tmpdir(), 'vbm-trofeos-'));
  const filePath = join(directory, 'partida.sqlite');
  const db = openSaveDatabase(filePath, MIGRATIONS);
  seedSave(db, loadDataset(SEED_DIRECTORY), { managedTeamId, managerName: 'Carlos' });
  const season = new SeasonService(() => db);
  season.getCurrent();
  // Sin consejo: un despido pararía el reloj, y aquí no se mide el banquillo.
  db.delete(boardTable).run();
  return { directory, filePath, db, season, trophies: new TrophyService(() => db) };
}

function destroy(world: World): void {
  closeSaveDatabase(world.filePath);
  rmSync(world.directory, { recursive: true, force: true });
}

/** Seis jugadores por club —uno por puesto y el más joven— que juegan todo. */
function rosters(db: SaveDatabase): Map<string, { id: string; position: Position }[]> {
  const byTeam = new Map<string, { id: string; position: Position; birth: number }[]>();
  for (const player of db.select().from(playersTable).all()) {
    if (!player.teamId || player.isYouth) {
      continue;
    }
    const list = byTeam.get(player.teamId) ?? [];
    list.push({
      id: player.id,
      position: player.position as Position,
      birth: player.birthDate.getTime()
    });
    byTeam.set(player.teamId, list);
  }
  const rosters = new Map<string, { id: string; position: Position }[]>();
  for (const [teamId, players] of byTeam) {
    const chosen = POSITIONS.map((position) => players.find((row) => row.position === position))
      .filter((row) => row !== undefined)
      .map((row) => row!);
    const youngest = [...players].sort((a, b) => b.birth - a.birth)[0];
    if (youngest && !chosen.includes(youngest)) {
      chosen.push(youngest);
    }
    rosters.set(teamId, chosen);
  }
  return rosters;
}

/** Un número que cambia con el jugador y el partido, siempre el mismo. */
function spread(text: string, range: number): number {
  let hash = 7;
  for (let index = 0; index < text.length; index += 1) {
    hash = (hash * 31 + text.charCodeAt(index)) % 100_003;
  }
  return hash % range;
}

/**
 * Da por jugados todos los partidos que haya y mueve el calendario, hasta que
 * no quede nada que jugar. Los favoritos ganan siempre.
 */
function playEverything(world: World, favorites: readonly string[]): void {
  const squads = rosters(world.db);
  for (let pass = 0; pass < 40; pass += 1) {
    const pending = world.db.select().from(gamesTable).where(isNull(gamesTable.homeScore)).all();
    if (pending.length === 0) {
      break;
    }
    world.db.transaction((tx) => {
      for (const game of pending) {
        const homeWins = favorites.includes(game.homeTeamId)
          ? true
          : favorites.includes(game.awayTeamId)
            ? false
            : true;
        tx.update(gamesTable)
          .set({ homeScore: homeWins ? 90 : 70, awayScore: homeWins ? 70 : 90 })
          .where(eq(gamesTable.id, game.id))
          .run();
        const lines: NewGamePlayerStatsRow[] = [];
        for (const teamId of [game.homeTeamId, game.awayTeamId]) {
          for (const player of squads.get(teamId) ?? []) {
            const key = `${player.id}|${game.id}`;
            lines.push({
              id: `${game.id}-${player.id}`,
              gameId: game.id,
              playerId: player.id,
              teamId,
              secondsPlayed: 1500,
              twoPointMade: 2 + spread(key, 7),
              twoPointAttempted: 9,
              threePointMade: spread(`${key}t`, 3),
              threePointAttempted: 4,
              freeThrowMade: 2,
              freeThrowAttempted: 3,
              offensiveRebounds: spread(`${key}o`, 3),
              defensiveRebounds: 2 + spread(`${key}d`, 7),
              assists: spread(`${key}a`, 8),
              steals: spread(`${key}s`, 3),
              blocks: spread(`${key}b`, 3)
            });
          }
        }
        if (lines.length > 0) {
          tx.insert(gamePlayerStatsTable).values(lines).run();
        }
      }
    });
    world.season.getCurrent();
  }
}

function seasonOf(db: SaveDatabase, competitionId: string): string {
  return db
    .select()
    .from(seasonsTable)
    .where(and(eq(seasonsTable.competitionId, competitionId), eq(seasonsTable.seasonNumber, 1)))
    .get()!.id;
}

function awardTypes(db: SaveDatabase, seasonId: string): string[] {
  return db
    .select()
    .from(seasonAwardsTable)
    .where(eq(seasonAwardsTable.seasonId, seasonId))
    .all()
    .map((row) => row.type);
}

describe('un club que lo gana todo: liga con playoffs, Copa, Euroliga y Mundial', () => {
  const MANAGED = 'liga-nacional-1';
  const SPAIN = 'seleccion-esp';
  let world: World;
  let pending: PendingCelebration[];

  beforeAll(() => {
    world = createWorld(MANAGED);
    new NationalService(() => world.db).takeTeam(SPAIN);
    playEverything(world, [MANAGED, SPAIN]);
    pending = world.trophies.listPending();
  }, 300_000);

  afterAll(() => destroy(world));

  it('levanta la liga (con playoffs), la Copa y la Euroliga, cada una con su copa', () => {
    const titles = pending.filter((row) => row.kind === 'title');
    const byCompetition = new Map(titles.map((row) => [row.competitionId, row.trophyKind]));

    expect(byCompetition.get('liga-nacional')).toBe('league_top');
    expect(byCompetition.get('copa-nacional')).toBe('national_cup');
    expect(byCompetition.get('euroliga')).toBe('continental_top');
    for (const row of titles.filter((title) => title.competitionId !== 'mundial')) {
      expect(row.teamId).toBe(MANAGED);
    }
  });

  it('y con la selección que dirige, el Mundial', () => {
    const worldCup = pending.find((row) => row.competitionId === 'mundial');
    expect(worldCup).toMatchObject({ kind: 'title', trophyKind: 'world_cup', teamId: SPAIN });
    expect(worldCup?.nationOf).toBe('ESP');
  });

  it('la gala sale después del título de liga', () => {
    const league = pending.findIndex(
      (row) => row.kind === 'title' && row.competitionId === 'liga-nacional'
    );
    const gala = pending.findIndex((row) => row.kind === 'season_gala');
    expect(league).toBeGreaterThanOrEqual(0);
    expect(gala).toBeGreaterThan(league);
    expect(pending[gala]?.trophyKind).toBe('award');
  });

  it('lo que gana un rival no deja pantalla', () => {
    // La segunda española y la Eurocup las gana otro: ni rastro.
    const rivals = ['liga-plata', 'eurocup', 'europe-league'];
    expect(pending.some((row) => rivals.includes(row.competitionId))).toBe(false);
    expect(pending.every((row) => row.teamId === MANAGED || row.teamId === SPAIN)).toBe(true);
  });

  it('entrega los premios en todas las ligas que se juegan, no sólo en la tuya', () => {
    const own = awardTypes(world.db, seasonOf(world.db, 'liga-nacional'));
    const other = awardTypes(world.db, seasonOf(world.db, 'liga-plata'));

    for (const type of [
      'mvp',
      'top_scorer',
      'top_rebounder',
      'top_assister',
      'best_defender',
      'coach_of_year'
    ]) {
      expect(own, type).toContain(type);
      expect(other, type).toContain(type);
    }
    // Quinteto de cinco, uno por puesto.
    expect(own.filter((type) => type === 'all_league')).toHaveLength(5);
    // La final sólo existe donde hubo playoffs.
    expect(own).toContain('finals_mvp');
    expect(other).not.toContain('finals_mvp');
    // Y la gala sólo se le enseña al usuario la de su liga.
    expect(pending.filter((row) => row.kind === 'season_gala')).toHaveLength(1);
  });

  it('el MVP de la final es del campeón', () => {
    const gala = world.trophies.getGala(seasonOf(world.db, 'liga-nacional'))!;
    const finals = gala.awards.find((award) => award.type === 'finals_mvp');
    expect(finals?.teamId).toBe(MANAGED);
    expect(finals?.isManaged).toBe(true);
    expect(finals?.playerName).toBeTruthy();
    expect(gala.awards.find((award) => award.type === 'coach_of_year')?.coachName).toBeTruthy();
  });

  it('reintentar no duplica ni pantallas ni premios', () => {
    const celebrations = world.db.select().from(celebrationsTable).all().length;
    const awards = world.db.select().from(seasonAwardsTable).all().length;

    world.season.getCurrent();
    const leagueId = seasonOf(world.db, 'liga-nacional');
    world.trophies.celebrateTitle(leagueId, MANAGED, new Date());
    world.trophies.closeLeague(leagueId, {
      standings: [],
      finalRound: null,
      championTeamId: MANAGED,
      galaFor: MANAGED
    });

    expect(world.db.select().from(celebrationsTable).all()).toHaveLength(celebrations);
    expect(world.db.select().from(seasonAwardsTable).all()).toHaveLength(awards);
  });

  it('el palmarés cuenta los títulos con su copa, y el historial trae la gala', () => {
    const history = new HistoryService(() => world.db).get();
    const league = history.trophies.find((trophy) => trophy.competitionId === 'liga-nacional');
    expect(league?.trophyKind).toBe('league_top');
    expect(history.galas[0]?.competitionId).toBe('liga-nacional');
    expect(history.promotions).toEqual([]);
  });

  it('la vitrina del mánager suma los Mundiales de su selección', () => {
    const cabinet = world.trophies.getManagerCabinet();
    expect(cabinet.trophies.some((trophy) => trophy.trophyKind === 'world_cup')).toBe(true);
    expect(cabinet.totalTrophies).toBe(
      cabinet.trophies.reduce((sum, trophy) => sum + trophy.seasons.length, 0)
    );
  });

  it('una pantalla vista no vuelve a salir', () => {
    const first = world.trophies.listPending()[0]!;
    world.trophies.markSeen(first.id);
    expect(world.trophies.listPending().some((row) => row.id === first.id)).toBe(false);
  });
});

describe('un club de segunda que sube como campeón (liga sin playoffs)', () => {
  const MANAGED = 'liga-plata-1';
  let world: World;
  let pending: PendingCelebration[];

  beforeAll(() => {
    world = createWorld(MANAGED);
    playEverything(world, [MANAGED]);
    pending = world.trophies.listPending();
  }, 300_000);

  afterAll(() => destroy(world));

  it('levanta la liga de segunda en bronce, después su placa y al final la gala', () => {
    expect(pending.map((row) => [row.kind, row.trophyKind])).toEqual([
      ['title', 'league_lower'],
      ['promotion', 'promotion'],
      ['season_gala', 'award']
    ]);
    // La placa dice adónde se sube.
    expect(pending[1]?.competitionName).toBe('Liga Nacional');
  });

  it('el ascenso va en la vitrina, pero no suma títulos', () => {
    const history = new HistoryService(() => world.db).get();
    expect(history.promotions).toHaveLength(1);
    expect(history.promotions[0]).toMatchObject({
      fromCompetitionName: 'Liga Plata',
      toCompetitionName: 'Liga Nacional'
    });
    expect(history.totalTrophies).toBe(1);
  });

  it('sin playoffs no hay MVP de la final', () => {
    expect(awardTypes(world.db, seasonOf(world.db, 'liga-plata'))).not.toContain('finals_mvp');
  });
});

describe('las finales de la liga americana', () => {
  const MANAGED = 'usa-1-1';
  let world: World;
  let pending: PendingCelebration[];

  beforeAll(() => {
    world = createWorld(MANAGED);
    playEverything(world, [MANAGED]);
    pending = world.trophies.listPending();
  }, 300_000);

  afterAll(() => destroy(world));

  it('el campeón levanta el cáliz, y su final tiene MVP', () => {
    expect(pending.find((row) => row.competitionId === 'usa-1')?.trophyKind).toBe('nba_champion');
    expect(awardTypes(world.db, seasonOf(world.db, 'usa-1'))).toContain('finals_mvp');
    // Liga cerrada: ni ascensos ni placas.
    expect(pending.some((row) => row.kind === 'promotion')).toBe(false);
  });
});
