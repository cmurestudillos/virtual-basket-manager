import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  closeSaveDatabase,
  openSaveDatabase,
  type SaveDatabase
} from '../../../database/save-database';
import { generateClubCoach } from '@shared/domain/coaches';
import { createRng, seedFromString } from '@shared/engine/basketball/rng';
import {
  coachesTable,
  competitionsTable,
  gameStateTable,
  playersTable,
  rotationSlotsTable,
  staffTable,
  teamsTable,
  teamTacticsTable
} from '../../../database/schema/save';
import { loadDataset, type Dataset } from '../dataset';
import { seedSave } from '../save-seeder';

/**
 * Test de integración contra SQLite de verdad: migraciones reales, dataset real
 * y fichero de partida real en una carpeta temporal.
 *
 * No hace falta Electron para esto — ni `save-database.ts` ni el sembrador lo
 * importan, precisamente para poder ejecutar esta comprobación sin arrancar la
 * aplicación entera.
 */

const MIGRATIONS = resolve('drizzle/save');
const SEED_DIRECTORY = resolve('resources/seed-data');

let directory: string;
let filePath: string;
let db: SaveDatabase;

beforeAll(() => {
  directory = mkdtempSync(join(tmpdir(), 'vbm-save-'));
  filePath = join(directory, 'partida.sqlite');
  db = openSaveDatabase(filePath, MIGRATIONS);

  seedSave(db, loadDataset(SEED_DIRECTORY), {
    managedTeamId: 'liga-nacional-1',
    managerName: 'Carlos'
  });
});

afterAll(() => {
  closeSaveDatabase(filePath);
  rmSync(directory, { recursive: true, force: true });
});

describe('seedSave', () => {
  // Contra el dataset y no contra un número escrito a mano: lo que se comprueba
  // aquí es que en la partida entra *todo* lo que el dataset trae, y eso tiene
  // que seguir valiendo el día que se añada otra división.
  const dataset = loadDataset(SEED_DIRECTORY);

  it('deja el mundo completo dentro del fichero de la partida', () => {
    const players = db.select().from(playersTable).all();

    expect(db.select().from(competitionsTable).all()).toHaveLength(dataset.competitions.length);
    expect(db.select().from(teamsTable).all()).toHaveLength(dataset.teams.length);
    // Las fichas del dataset, más la cantera de cada club, más los agentes
    // libres con los que arranca el mercado.
    expect(players.filter((row) => !row.isYouth && row.teamId !== null)).toHaveLength(
      dataset.players.length
    );
    expect(players.filter((row) => row.isYouth).length).toBeGreaterThanOrEqual(
      dataset.teams.length * 3
    );
    expect(players.filter((row) => row.teamId === null).length).toBeGreaterThan(10);
  });

  it('siembra cuerpo técnico a todos y un mercado de técnicos libres', () => {
    const staff = db.select().from(staffTable).all();

    // Cinco puestos por club, y los libres del mercado por encima.
    expect(staff.filter((row) => row.teamId !== null)).toHaveLength(dataset.teams.length * 5);
    expect(staff.filter((row) => row.teamId === null).length).toBeGreaterThan(5);
  });

  it('siembra el mundo entero: cada liga con sus equipos y ninguna vacía', () => {
    const teams = db.select().from(teamsTable).all();
    const competitions = db.select().from(competitionsTable).all();
    const leagues = competitions.filter((row) => row.format === 'league');

    expect(leagues.length).toBeGreaterThanOrEqual(20);
    for (const competition of leagues) {
      const size = teams.filter((row) => row.competitionId === competition.id).length;
      // Con gente, porque una liga vacía reventaría al generar su temporada. Y
      // par: el mundo ficticio no tiene jornadas de descanso; las ligas impares,
      // como la Primera FEB real, se prueban aparte (`odd-league.test.ts`).
      expect(size).toBeGreaterThanOrEqual(10);
      expect(size % 2).toBe(0);
    }

    // Y las dos divisiones españolas, que son de donde sale quién sube y baja.
    expect(teams.filter((row) => row.competitionId === 'liga-nacional')).toHaveLength(18);
    expect(teams.filter((row) => row.competitionId === 'liga-plata')).toHaveLength(18);
    // Las continentales no tienen equipos propios: los toman prestados.
    for (const competition of competitions.filter((row) => row.format === 'continental')) {
      expect(teams.filter((row) => row.competitionId === competition.id)).toHaveLength(0);
    }
  });

  it('cada país con liga tiene su copa, una y sólo una', () => {
    const competitions = db.select().from(competitionsTable).all();
    const countries = new Set(
      competitions.filter((row) => row.format === 'league').map((row) => row.country)
    );

    for (const country of countries) {
      expect(
        competitions.filter((row) => row.format === 'cup' && row.country === country),
        country
      ).toHaveLength(1);
    }
    // La española conserva su id: las partidas de antes la buscan por él.
    expect(competitions.find((row) => row.id === 'copa-nacional')?.country).toBe('ESP');
  });

  it('da pizarra por defecto a todos los equipos, no sólo al del usuario', () => {
    expect(db.select().from(teamTacticsTable).all()).toHaveLength(dataset.teams.length);
  });

  it('deja a cada equipo con una rotación de doce y cinco titulares', () => {
    const slots = db
      .select()
      .from(rotationSlotsTable)
      .where(eq(rotationSlotsTable.teamId, 'liga-nacional-5'))
      .all();

    expect(slots).toHaveLength(12);

    const starters = slots.filter((slot) => slot.depth < 5);
    expect(starters).toHaveLength(5);
    // Un titular por puesto: sin esto el motor saldría con dos pívots y ningún
    // base y el partido no se parecería a nada.
    expect(new Set(starters.map((slot) => slot.slotPosition))).toEqual(
      new Set(['PG', 'SG', 'SF', 'PF', 'C'])
    );
  });

  it('saca de titular a un jugador de cada posición natural', () => {
    const dataset = loadDataset(SEED_DIRECTORY);

    for (const team of dataset.teams) {
      const starters = db
        .select()
        .from(rotationSlotsTable)
        .where(eq(rotationSlotsTable.teamId, team.id))
        .all()
        .filter((slot) => slot.depth < 5);

      for (const slot of starters) {
        const player = dataset.players.find((row) => row.id === slot.playerId)!;
        // Cada plantilla trae dos jugadores de cada posición, así que el hueco
        // se puede cubrir siempre con un natural: si aparece uno fuera de sitio
        // es que la elección de titulares está mezclando prioridades.
        expect(player.position).toBe(slot.slotPosition);
      }
    }
  });

  it('reparte 200 minutos objetivo por equipo, los cinco huecos de pista', () => {
    const slots = db
      .select()
      .from(rotationSlotsTable)
      .where(eq(rotationSlotsTable.teamId, 'liga-nacional-1'))
      .all();

    const total = slots.reduce((sum, slot) => sum + slot.targetMinutes, 0);
    expect(total).toBe(200);
  });

  it('guarda el estado de la partida con el equipo dirigido y la fecha del juego', () => {
    const state = db.select().from(gameStateTable).get();

    expect(state?.managedTeamId).toBe('liga-nacional-1');
    expect(state?.managerName).toBe('Carlos');
    expect(state?.seasonNumber).toBe(1);
    // Pretemporada: 1 de septiembre del año en que arranca la temporada.
    expect(state?.currentDate.getUTCMonth()).toBe(8);
  });

  it('conserva los atributos de cada jugador, incluido el que cambia de nombre', () => {
    const dataset = loadDataset(SEED_DIRECTORY);
    const expected = dataset.players[0]!;
    const row = db.select().from(playersTable).where(eq(playersTable.id, expected.id)).get();

    expect(row?.threePoint).toBe(expected.attributes.threePoint);
    expect(row?.defensiveRebound).toBe(expected.attributes.defensiveRebound);
    // `basketballIQ` en el dominio, `basketball_iq` en la tabla: es justo el
    // campo que un `spread` del objeto de atributos se dejaría por el camino.
    expect(row?.basketballIq).toBe(expected.attributes.basketballIQ);
  });
});

describe('seedSave con entrenadores reales (edición privada)', () => {
  // Un mundo pequeño —sólo España— en el que dos clubes traen a su entrenador
  // de verdad, como el dataset real en la ACB y la Primera FEB.
  const REAL_COACH = {
    firstName: 'Técnico',
    lastName: 'De Verdad',
    nationality: 'ITA',
    birthDate: '1961-04-01'
  };
  const USER_CLUB_COACH = {
    firstName: 'Otro',
    lastName: 'Real',
    nationality: 'ESP',
    birthDate: '1978-05-25'
  };
  let realDirectory: string;
  let realPath: string;
  let realDb: SaveDatabase;

  beforeAll(() => {
    const full = loadDataset(SEED_DIRECTORY);
    const competitions = full.competitions.filter((row) => row.country === 'ESP');
    const ids = new Set(competitions.map((row) => row.id));
    const teams = full.teams
      .filter((team) => ids.has(team.competitionId))
      .map((team) =>
        team.id === 'liga-nacional-2'
          ? { ...team, coach: REAL_COACH }
          : team.id === 'liga-nacional-1'
            ? { ...team, coach: USER_CLUB_COACH }
            : team
      );
    const teamIds = new Set(teams.map((team) => team.id));
    const small: Dataset = {
      ...full,
      competitions,
      teams,
      players: full.players.filter((player) => teamIds.has(player.teamId))
    };

    realDirectory = mkdtempSync(join(tmpdir(), 'vbm-save-real-'));
    realPath = join(realDirectory, 'partida.sqlite');
    realDb = openSaveDatabase(realPath, MIGRATIONS);
    seedSave(realDb, small, { managedTeamId: 'liga-nacional-1', managerName: 'Carlos' });
  });

  afterAll(() => {
    closeSaveDatabase(realPath);
    rmSync(realDirectory, { recursive: true, force: true });
  });

  it('el club lleva a su entrenador real, con su nombre, bandera y fecha', () => {
    const row = realDb
      .select()
      .from(coachesTable)
      .where(eq(coachesTable.id, 'coach-liga-nacional-2'))
      .get();
    expect(row).toMatchObject({
      teamId: 'liga-nacional-2',
      firstName: 'Técnico',
      lastName: 'De Verdad',
      nationality: 'ITA',
      retired: false
    });
    expect(row?.birthDate?.toISOString().slice(0, 10)).toBe('1961-04-01');
  });

  it('la reputación sale de la misma semilla que la de uno inventado, no de su fama', () => {
    const row = realDb
      .select()
      .from(coachesTable)
      .where(eq(coachesTable.id, 'coach-liga-nacional-2'))
      .get();
    const team = realDb.select().from(teamsTable).where(eq(teamsTable.id, 'liga-nacional-2')).get();
    const expected = generateClubCoach({
      country: team!.country,
      clubReputation: team!.reputation,
      tier: 1,
      today: new Date(Date.UTC(loadDataset(SEED_DIRECTORY).seasonStartYear, 8, 1)),
      rng: createRng(seedFromString('liga-nacional-2-entrenador')),
      real: { ...REAL_COACH, birthDate: new Date('1961-04-01T00:00:00Z') }
    });
    expect(row?.baseReputation).toBe(expected.baseReputation);
  });

  it('el real del club del usuario empieza en la bolsa, como el inventado', () => {
    const row = realDb
      .select()
      .from(coachesTable)
      .where(eq(coachesTable.id, 'coach-liga-nacional-1'))
      .get();
    expect(row).toMatchObject({ teamId: null, firstName: 'Otro', lastName: 'Real' });
  });

  it('los clubes sin entrenador real siguen con uno inventado', () => {
    const row = realDb
      .select()
      .from(coachesTable)
      .where(eq(coachesTable.id, 'coach-liga-nacional-3'))
      .get();
    expect(row?.teamId).toBe('liga-nacional-3');
    expect(row?.firstName).not.toBe('Técnico');
  });
});
