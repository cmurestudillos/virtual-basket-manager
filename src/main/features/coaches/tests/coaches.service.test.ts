import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { and, eq, inArray, isNull, lte } from 'drizzle-orm';
import { afterEach, describe, expect, it } from 'vitest';
import { MANAGER_COACH_ID } from '@shared/contracts/coaches.contract';
import { seedFromString } from '@shared/engine/basketball/rng';
import {
  closeSaveDatabase,
  openSaveDatabase,
  type SaveDatabase
} from '../../../database/save-database';
import {
  boardTable,
  coachesTable,
  coachSeasonsTable,
  competitionsTable,
  gamesTable,
  gameStateTable,
  seasonsTable,
  teamsTable
} from '../../../database/schema/save';
import { BoardService } from '../../club/board.service';
import { CareerService } from '../../career/career.service';
import { InboxService } from '../../inbox/inbox.service';
import { loadDataset } from '../../saves/dataset';
import { seedSave } from '../../saves/save-seeder';
import { SeasonService } from '../../season/season.service';
import { CoachRepository } from '../coaches.repository';
import { COACH_RANKING_PAGE_SIZE, CoachNotFoundError, CoachService } from '../coaches.service';

/**
 * Los entrenadores contra una partida sembrada de verdad: la siembra, la
 * sincronía con el usuario, el carrusel de la IA, el ranking y la ficha.
 *
 * Los resultados se escriben a mano en vez de simular: una temporada entera
 * simulada costaría minutos por test, y lo que se prueba aquí no es el motor
 * sino quién está en qué banquillo. Se escriben **al revés**: gana siempre el
 * de menos reputación, así los grandes van hundidos y el carrusel tiene a
 * quién echar.
 */

const MIGRATIONS = resolve('drizzle/save');
const SEED_DIRECTORY = resolve('resources/seed-data');
const MANAGED_TEAM = 'liga-nacional-1';
const RIVAL_TEAM = 'liga-nacional-2';

let directory: string;
let filePath: string;
let db: SaveDatabase;
let season: SeasonService;
let coaches: CoachService;

function openSave(options: { careerMode?: boolean; activeCountries?: string[] } = {}): void {
  directory = mkdtempSync(join(tmpdir(), 'vbm-entrenadores-'));
  filePath = join(directory, 'partida.sqlite');
  db = openSaveDatabase(filePath, MIGRATIONS);
  seedSave(db, loadDataset(SEED_DIRECTORY), {
    managedTeamId: MANAGED_TEAM,
    managerName: 'Carlos Mur',
    careerMode: options.careerMode ?? false,
    activeCountries: options.activeCountries
  });
  const resolveDb = (): SaveDatabase => db;
  season = new SeasonService(resolveDb);
  coaches = new CoachService(resolveDb);
  // La temporada se crea al primer vistazo, como en el juego.
  season.getCurrent();
}

afterEach(() => {
  closeSaveDatabase(filePath);
  rmSync(directory, { recursive: true, force: true });
});

/** Los clubes de liga del mundo: todos deben tener entrenador. */
function leagueClubIds(): string[] {
  return db
    .select({ id: teamsTable.id })
    .from(teamsTable)
    .innerJoin(competitionsTable, eq(competitionsTable.id, teamsTable.competitionId))
    .where(and(isNull(teamsTable.nationalOf), eq(competitionsTable.format, 'league')))
    .all()
    .map((row) => row.id);
}

function benches(): Map<string, string> {
  return new Map(
    [...new CoachRepository(db).benches().entries()].map(([teamId, coach]) => [teamId, coach.id])
  );
}

/** Nadie sin entrenador, y nadie en dos banquillos. */
function expectEveryClubCovered(): void {
  const map = benches();
  for (const teamId of leagueClubIds()) {
    expect(map.has(teamId), `${teamId} sin entrenador`).toBe(true);
  }
  // Cada entrenador con equipo tiene su tramo abierto, y sólo uno.
  const open = db.select().from(coachSeasonsTable).where(isNull(coachSeasonsTable.endDate)).all();
  expect(new Set(open.map((row) => row.coachId)).size).toBe(open.length);
  for (const [teamId, coachId] of map) {
    expect(open.find((row) => row.coachId === coachId)?.teamId).toBe(teamId);
  }
}

/**
 * Da por jugados, al revés de lo esperable, los partidos del curso hasta una
 * fecha: gana el de menos reputación, por un margen que depende del partido.
 */
function playUpsideDown(until: Date): void {
  const reputation = new Map(
    db
      .select({ id: teamsTable.id, reputation: teamsTable.reputation })
      .from(teamsTable)
      .all()
      .map((row) => [row.id, row.reputation])
  );
  const games = db
    .select()
    .from(gamesTable)
    .where(and(isNull(gamesTable.homeScore), lte(gamesTable.scheduledOn, until)))
    .all();
  db.transaction((tx) => {
    for (const game of games) {
      const home = reputation.get(game.homeTeamId) ?? 50;
      const away = reputation.get(game.awayTeamId) ?? 50;
      const homeWins = home < away || (home === away && game.homeTeamId < game.awayTeamId);
      // El margen sale de los equipos y la jornada, no del id del partido, que
      // es aleatorio: dos partidas iguales tienen que dar la misma tabla.
      const margin =
        (seedFromString(`${game.homeTeamId}|${game.awayTeamId}|${game.round}`) % 9) + 1;
      tx.update(gamesTable)
        .set(
          homeWins
            ? { homeScore: 80 + margin, awayScore: 80, playedOn: game.scheduledOn }
            : { homeScore: 80, awayScore: 80 + margin, playedOn: game.scheduledOn }
        )
        .where(eq(gamesTable.id, game.id))
        .run();
    }
  });
}

function setDate(date: Date): void {
  db.update(gameStateTable).set({ currentDate: date }).run();
}

function stints() {
  return db.select().from(coachSeasonsTable).all();
}

// ---------------------------------------------------------------------------

describe('la siembra', () => {
  it('todos los clubes de liga tienen entrenador, y el del usuario es él', () => {
    openSave();
    expectEveryClubCovered();

    const map = benches();
    expect(map.get(MANAGED_TEAM)).toBe(MANAGER_COACH_ID);
    expect(map.get(RIVAL_TEAM)).toBe(`coach-${RIVAL_TEAM}`);
    // El inventado para el club del usuario empieza en la bolsa.
    const own = db
      .select()
      .from(coachesTable)
      .where(eq(coachesTable.id, `coach-${MANAGED_TEAM}`))
      .get();
    expect(own?.teamId).toBeNull();
    // Y la bolsa tiene su tamaño (más ese).
    const free = db.select().from(coachesTable).where(isNull(coachesTable.teamId)).all();
    expect(free).toHaveLength(41);

    const manager = db
      .select()
      .from(coachesTable)
      .where(eq(coachesTable.id, MANAGER_COACH_ID))
      .get();
    expect(manager).toMatchObject({ firstName: 'Carlos', lastName: 'Mur', birthDate: null });
    // Los tramos del primer curso, abiertos desde el 1 de septiembre.
    expect(stints().every((row) => row.startDate.getTime() === Date.UTC(2025, 8, 1))).toBe(true);
  });

  it('es determinista: la misma partida da los mismos entrenadores', () => {
    openSave();
    const first = db.select().from(coachesTable).all();
    closeSaveDatabase(filePath);
    rmSync(directory, { recursive: true, force: true });

    openSave();
    const second = db.select().from(coachesTable).all();
    expect(second).toEqual(first);
  });

  it('una partida de antes de los entrenadores los inventa igual y cuenta lo ya jugado', () => {
    openSave();
    const seeded = db.select().from(coachesTable).all();
    playUpsideDown(new Date(Date.UTC(2025, 9, 12)));
    db.delete(coachSeasonsTable).run();
    db.delete(coachesTable).run();
    setDate(new Date(Date.UTC(2025, 9, 13)));

    coaches.ensure();

    expect(db.select().from(coachesTable).all()).toEqual(seeded);
    expectEveryClubCovered();
    // Los tramos arrancan con el curso, así que los partidos jugados cuentan.
    const row = coaches
      .ranking({ scope: 'competition', id: 'liga-nacional' })
      .rows.find((entry) => entry.coachId === `coach-${RIVAL_TEAM}`);
    expect(row?.seasonGames).toBe(3);
  });
});

describe('la sincronía con el usuario', () => {
  it('si le echan, su tramo se cierra como despido y el carrusel cubre su banquillo', () => {
    openSave({ careerMode: true });
    new BoardService(() => db).ensureForSeason(1, 18);
    db.update(boardTable).set({ confidence: 0, dismissed: true }).run();

    coaches.ensure();

    const manager = new CoachRepository(db).findById(MANAGER_COACH_ID);
    expect(manager?.teamId).toBeNull();
    const own = stints().find((row) => row.coachId === MANAGER_COACH_ID);
    expect(own?.endReason).toBe('dismissed');
    expect(own?.endDate).not.toBeNull();
    const successor = benches().get(MANAGED_TEAM);
    expect(successor).toBeDefined();
    expect(successor).not.toBe(MANAGER_COACH_ID);
    expectEveryClubCovered();
  });

  it('si coge un club, el entrenador que había se va a la bolsa despedido', () => {
    openSave({ careerMode: true });
    new BoardService(() => db).ensureForSeason(1, 18);
    db.update(boardTable).set({ confidence: 0, dismissed: true }).run();
    const career = new CareerService(() => db);
    const offer = career.getStatus().offers[0]!;
    const incumbent = benches().get(offer.teamId)!;

    career.accept(offer.teamId);

    expect(benches().get(offer.teamId)).toBe(MANAGER_COACH_ID);
    const repository = new CoachRepository(db);
    // Sale del club; el carrusel puede recolocarlo, pero no allí.
    expect(repository.findById(incumbent)?.teamId).not.toBe(offer.teamId);
    expect(
      stints().find((row) => row.coachId === incumbent && row.teamId === offer.teamId)?.endReason
    ).toBe('dismissed');
    expect(
      stints().find((row) => row.coachId === MANAGER_COACH_ID && row.endDate === null)?.teamId
    ).toBe(offer.teamId);
    expectEveryClubCovered();
  });

  it('si dimite, su tramo se cierra como marcha', () => {
    openSave({ careerMode: true });
    new CareerService(() => db).resign();

    coaches.ensure();

    expect(stints().find((row) => row.coachId === MANAGER_COACH_ID)?.endReason).toBe('left');
    expect(benches().get(MANAGED_TEAM)).not.toBe(MANAGER_COACH_ID);
  });
});

describe('el carrusel a mitad de temporada', () => {
  it('en las primeras jornadas no se echa a nadie', () => {
    openSave();
    playUpsideDown(new Date(Date.UTC(2025, 8, 30)));

    coaches.monthlyMoves(new Date(Date.UTC(2025, 9, 1)));

    expect(stints().some((row) => row.endReason === 'dismissed')).toBe(false);
  });

  it(
    'al cambiar de mes echa a quien va hundido, ficha a otro y lo cuenta en el correo',
    { timeout: 60_000 },
    () => {
      openSave();
      const inbox = new InboxService(() => db);
      inbox.get();
      const before = benches();
      // Hasta el último día de noviembre, con los grandes hundidos.
      const lastDay = new Date(Date.UTC(2025, 10, 30));
      playUpsideDown(lastDay);
      setDate(lastDay);

      season.advanceDay({ spectator: true });

      const firstOfDecember = Date.UTC(2025, 11, 1);
      const dismissed = stints().filter((row) => row.endReason === 'dismissed');
      expect(dismissed.length).toBeGreaterThan(0);
      for (const row of dismissed) {
        expect(row.endDate?.getTime()).toBe(firstOfDecember);
        // Su sustituto empieza ese mismo día en el mismo banquillo.
        const successor = stints().find(
          (other) => other.teamId === row.teamId && other.endDate === null
        );
        expect(successor?.startDate.getTime()).toBe(firstOfDecember);
        expect(successor?.coachId).not.toBe(row.coachId);
      }
      // Al usuario no lo toca el carrusel.
      expect(benches().get(MANAGED_TEAM)).toBe(MANAGER_COACH_ID);
      expectEveryClubCovered();

      // Cada banquillo que cambia en su liga sale en el correo; los de otras, no.
      const after = benches();
      const league = new Set(
        db
          .select({ id: teamsTable.id })
          .from(teamsTable)
          .where(eq(teamsTable.competitionId, 'liga-nacional'))
          .all()
          .map((row) => row.id)
      );
      const changed = [...league].filter((teamId) => before.get(teamId) !== after.get(teamId));
      const news = inbox.get().messages.filter((message) => message.route?.name === 'team-profile');
      expect(changed.length).toBeGreaterThan(0);
      expect(news).toHaveLength(changed.length);
      expect(new Set(news.map((message) => message.route?.params?.teamId))).toEqual(
        new Set(changed)
      );
      expect(news.every((message) => message.category === 'press')).toBe(true);
    }
  );

  it('es determinista: el mismo mes echa a los mismos', { timeout: 120_000 }, () => {
    const run = (): string[] => {
      openSave();
      playUpsideDown(new Date(Date.UTC(2025, 10, 30)));
      coaches.monthlyMoves(new Date(Date.UTC(2025, 11, 1)));
      const result = stints()
        .filter((row) => row.endReason === 'dismissed')
        .map((row) => row.coachId)
        .sort();
      closeSaveDatabase(filePath);
      rmSync(directory, { recursive: true, force: true });
      return result;
    };
    const first = run();
    const second = run();
    openSave();

    expect(first.length).toBeGreaterThan(0);
    expect(second).toEqual(first);
  });
});

describe('el verano', () => {
  it(
    'cierra los tramos, echa por objetivo, retira a los mayores, repone la bolsa y abre el curso',
    { timeout: 240_000 },
    () => {
      openSave();
      // Toda la temporada jugada al revés y las ligas acabadas sin playoffs.
      playUpsideDown(new Date(Date.UTC(2026, 5, 30)));
      const leagueSeasons = db
        .select()
        .from(seasonsTable)
        .innerJoin(competitionsTable, eq(competitionsTable.id, seasonsTable.competitionId))
        .where(eq(competitionsTable.format, 'league'))
        .all();
      db.update(seasonsTable)
        .set({ stage: 'finished' })
        .where(
          inArray(
            seasonsTable.id,
            leagueSeasons.map((row) => row.seasons.id)
          )
        )
        .run();
      season.startNextSeason();

      const first = stints().filter((row) => row.seasonNumber === 1);
      // Todo el curso 1, congelado y cerrado.
      expect(first.every((row) => row.closed && row.endDate !== null)).toBe(true);
      const rival = first.find((row) => row.coachId !== MANAGER_COACH_ID && row.games > 0)!;
      expect(rival.teams).toBeGreaterThan(0);
      // Con los grandes hundidos, alguno cae en verano.
      expect(first.some((row) => row.endReason === 'dismissed')).toBe(true);
      // Y alguno de los mayores se retira: fuera de todo banquillo y del ranking.
      const retired = db.select().from(coachesTable).where(eq(coachesTable.retired, true)).all();
      expect(retired.length).toBeGreaterThan(0);
      expect(retired.every((row) => row.teamId === null)).toBe(true);
      const ranking = coaches.ranking({});
      expect(ranking.total).toBe(db.select().from(coachesTable).all().length - retired.length);

      // El curso 2 arranca con todos los banquillos cubiertos desde el 1 de septiembre.
      expectEveryClubCovered();
      const second = stints().filter((row) => row.seasonNumber === 2);
      expect(second.every((row) => row.startDate.getTime() === Date.UTC(2026, 8, 1))).toBe(true);
      // La bolsa vuelve a su tamaño con jóvenes.
      const free = db
        .select()
        .from(coachesTable)
        .where(and(isNull(coachesTable.teamId), eq(coachesTable.retired, false)))
        .all()
        .filter((row) => row.id !== MANAGER_COACH_ID);
      expect(free.length).toBeGreaterThanOrEqual(40);
      // Los puntos del curso pasado cuentan la mitad en el ranking.
      const top = ranking.rows[0]!;
      expect(top.points).toBe(Math.round((top.currentPoints + top.previousPoints / 2) * 10) / 10);
      expect(top.previousPoints).toBeGreaterThan(0);
    }
  );
});

describe('el ranking', () => {
  it('va por puntos, pagina de 25 y trae la fila del usuario', () => {
    openSave();
    playUpsideDown(new Date(Date.UTC(2025, 10, 30)));
    setDate(new Date(Date.UTC(2025, 11, 1)));

    const page = coaches.ranking({});
    const total = db.select().from(coachesTable).all().length;

    expect(page.total).toBe(total);
    expect(page.pageSize).toBe(COACH_RANKING_PAGE_SIZE);
    expect(page.rows).toHaveLength(COACH_RANKING_PAGE_SIZE);
    expect(page.rows.map((row) => row.rank)).toEqual(
      Array.from({ length: COACH_RANKING_PAGE_SIZE }, (_, index) => index + 1)
    );
    for (let index = 1; index < page.rows.length; index += 1) {
      const previous = page.rows[index - 1]!;
      const row = page.rows[index]!;
      expect(previous.points).toBeGreaterThanOrEqual(row.points);
      if (previous.points === row.points) {
        expect(previous.reputation).toBeGreaterThanOrEqual(row.reputation);
      }
    }
    expect(page.rows[0]!.points).toBeGreaterThan(0);
    expect(page.managerRow).toMatchObject({ isManager: true, name: 'Carlos Mur', age: null });
    // La reputación del usuario es la de su carrera, también en modo mánager.
    expect(page.managerRow!.reputation).toBe(new CareerService(() => db).getStatus().reputation);
  });

  it('«donde estoy yo» devuelve la página del usuario', () => {
    openSave();
    playUpsideDown(new Date(Date.UTC(2025, 10, 30)));

    const page = coaches.ranking({ aroundManager: true });

    expect(page.page).toBe(Math.ceil(page.managerRow!.rank / COACH_RANKING_PAGE_SIZE));
    expect(page.rows.some((row) => row.isManager)).toBe(true);
  });

  it('se filtra por continente, país y liga, con sólo lo que tiene entrenadores', () => {
    openSave();

    const liga = coaches.ranking({ scope: 'competition', id: 'liga-nacional' });
    expect(liga.total).toBe(18);
    expect(liga.rows.filter((row) => row.isManager)).toHaveLength(1);

    const spain = coaches.ranking({ scope: 'country', id: 'ESP' });
    expect(spain.total).toBe(36);
    const oceania = coaches.ranking({ scope: 'continent', id: 'OCE' });
    expect(oceania.total).toBe(10);
    expect(oceania.managerRow).toBeNull();

    expect(liga.filters.competitions.map((option) => option.id)).toContain('usa-1');
    expect(liga.filters.continents.map((option) => option.label)).toEqual([
      'América',
      'Europa',
      'Oceanía'
    ]);
    expect(liga.filters.countries.find((option) => option.id === 'ESP')?.label).toBe('España');
  });

  it('los retirados no salen', () => {
    openSave();
    const total = coaches.ranking({}).total;
    db.update(coachesTable)
      .set({ retired: true })
      .where(eq(coachesTable.id, 'coach-libre-1'))
      .run();

    expect(coaches.ranking({}).total).toBe(total - 1);
  });

  it('con el mundo entero y varias ligas jugadas, tarda poco', { timeout: 120_000 }, () => {
    openSave({ activeCountries: ['FRA', 'GER', 'ITA'] });
    playUpsideDown(new Date(Date.UTC(2026, 2, 31)));

    const started = performance.now();
    const page = coaches.ranking({});
    const elapsed = performance.now() - started;
    console.info(
      `ranking() del mundo entero (${page.total} entrenadores): ${elapsed.toFixed(0)} ms`
    );

    expect(page.total).toBeGreaterThan(300);
    expect(elapsed).toBeLessThan(3000);
  });
});

describe('la ficha', () => {
  it('la del usuario, con su curso en juego y el top 5', () => {
    openSave();
    playUpsideDown(new Date(Date.UTC(2025, 9, 12)));

    const profile = coaches.getProfile();

    expect(profile).toMatchObject({
      coachId: MANAGER_COACH_ID,
      isManager: true,
      name: 'Carlos Mur',
      age: null,
      careerMode: false,
      retired: false,
      team: { teamId: MANAGED_TEAM }
    });
    expect(profile.history[0]).toMatchObject({ current: true, teamId: MANAGED_TEAM, games: 3 });
    expect(profile.current.games).toBe(3);
    expect(profile.topFive).toHaveLength(5);
    expect(profile.worldRank).toBe(profile.managerRow?.rank);
  });

  it('la de un entrenador de la IA, con edad y club', () => {
    openSave();

    const profile = coaches.getProfile(`coach-${RIVAL_TEAM}`);

    expect(profile.isManager).toBe(false);
    expect(profile.age).toBeGreaterThanOrEqual(34);
    expect(profile.age).toBeLessThanOrEqual(66);
    expect(profile.team?.teamId).toBe(RIVAL_TEAM);
    expect(profile.nationalTeamName).toBeNull();
    expect(() => coaches.getProfile('nadie')).toThrow(CoachNotFoundError);
  });
});
