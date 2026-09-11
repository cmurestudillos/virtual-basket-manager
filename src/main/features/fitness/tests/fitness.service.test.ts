import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { conditionAfterRest } from '@shared/domain/conditioning';
import {
  closeSaveDatabase,
  openSaveDatabase,
  type SaveDatabase
} from '../../../database/save-database';
import { boardTable, playersTable, type PlayerRow } from '../../../database/schema/save';
import { loadDataset } from '../../saves/dataset';
import { seedSave } from '../../saves/save-seeder';
import { MatchService } from '../../match/match.service';
import { SeasonService } from '../../season/season.service';
import { FitnessService } from '../fitness.service';

/**
 * Estado físico contra SQLite de verdad: lo que deja un partido, lo que cura el
 * calendario y lo que mueve una semana de entrenamiento.
 */

const MIGRATIONS = resolve('drizzle/save');
const SEED_DIRECTORY = resolve('resources/seed-data');
const MANAGED_TEAM = 'team-1';
const RIVAL_TEAM = 'team-2';

let directory: string;
let filePath: string;
let db: SaveDatabase;
let fitness: FitnessService;
let season: SeasonService;
let match: MatchService;

function roster(teamId = MANAGED_TEAM): PlayerRow[] {
  return db.select().from(playersTable).where(eq(playersTable.teamId, teamId)).all();
}

function player(id: string): PlayerRow {
  return db.select().from(playersTable).where(eq(playersTable.id, id)).get() as PlayerRow;
}

function totalAttributes(teamId = MANAGED_TEAM): number {
  return roster(teamId).reduce(
    (sum, row) => sum + row.threePoint + row.midRange + row.freeThrow + row.close,
    0
  );
}

/** Juega el próximo partido del usuario, cuarto a cuarto. */
function playUserGame(): string {
  const next = season.getNextGame();
  if (!next) {
    throw new Error('no hay partido que jugar');
  }
  match.start(next.gameId);
  let state = match.advancePeriod(next.gameId);
  while (!state.finished) {
    state = match.advancePeriod(next.gameId);
  }
  return next.gameId;
}

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'vbm-fitness-'));
  filePath = join(directory, 'partida.sqlite');
  db = openSaveDatabase(filePath, MIGRATIONS);
  seedSave(db, loadDataset(SEED_DIRECTORY), {
    managedTeamId: MANAGED_TEAM,
    managerName: 'Carlos'
  });

  const resolveDb = (): SaveDatabase => db;
  fitness = new FitnessService(resolveDb);
  season = new SeasonService(resolveDb);
  match = new MatchService(resolveDb);
});

afterEach(() => {
  closeSaveDatabase(filePath);
  rmSync(directory, { recursive: true, force: true });
});

describe('plan de entrenamiento', () => {
  it('la partida arranca con el plan por defecto y la plantilla sana', () => {
    const plan = fitness.getPlan(MANAGED_TEAM);

    expect(plan.intensity).toBe(5);
    expect(plan.focus).toBe('balanced');
    expect(plan.players).toHaveLength(12);
    expect(plan.injuredCount).toBe(0);
    expect(plan.isManaged).toBe(true);
    expect(plan.players.every((entry) => entry.effectiveFocus === 'balanced')).toBe(true);
  });

  it('guarda intensidad, foco del bloque y focos individuales', () => {
    const antes = fitness.getPlan(MANAGED_TEAM);
    const tirador = antes.players[0]!.playerId;

    const guardado = fitness.savePlan({
      teamId: MANAGED_TEAM,
      intensity: 8,
      focus: 'defense',
      players: [{ playerId: tirador, focus: 'shooting' }]
    });

    expect(guardado.intensity).toBe(8);
    expect(guardado.focus).toBe('defense');

    const reread = fitness.getPlan(MANAGED_TEAM);
    const suyo = reread.players.find((entry) => entry.playerId === tirador);
    expect(suyo?.focus).toBe('shooting');
    expect(suyo?.effectiveFocus).toBe('shooting');
    // Los demás siguen al bloque.
    expect(reread.players.filter((entry) => entry.effectiveFocus === 'defense')).toHaveLength(11);
  });

  it('no deja tocar el plan de un rival, aunque sí mirarlo', () => {
    expect(fitness.getPlan(RIVAL_TEAM).isManaged).toBe(false);
    expect(() =>
      fitness.savePlan({ teamId: RIVAL_TEAM, intensity: 9, focus: 'physical', players: [] })
    ).toThrow(/no lo dirige el usuario/);
  });

  it('una intensidad fuera de la escala no llega a la base de datos', () => {
    expect(() =>
      fitness.savePlan({ teamId: MANAGED_TEAM, intensity: 11, focus: 'balanced', players: [] })
    ).toThrow();
  });
});

describe('desgaste de partido', () => {
  it('el que juega se cansa y el que no juega llega igual', { timeout: 60_000 }, () => {
    const antes = roster();
    expect(antes.every((row) => row.condition === 100)).toBe(true);

    const gameId = playUserGame();
    const acta = match.get(gameId)!;
    const side = acta.managedSide === 'home' ? acta.home : acta.away;

    const jugado = side.boxScores.find((line) => line.secondsPlayed > 1200)!;
    const sinJugar = side.boxScores.find((line) => line.secondsPlayed === 0);

    // Cuánto baja depende del preparador físico que tenga el club, así que lo
    // que se fija es la dirección: el que juega se cansa y el que no, no.
    expect(player(jugado.playerId).condition).toBeLessThan(100);
    if (sinJugar) {
      expect(player(sinJugar.playerId).condition).toBe(100);
      expect(player(jugado.playerId).condition).toBeLessThan(player(sinJugar.playerId).condition);
    }
  });

  it('los partidos de la IA también pasan factura', { timeout: 60_000 }, () => {
    season.advanceToNextGame();
    playUserGame();
    season.advanceDay();

    const cansados = db
      .select()
      .from(playersTable)
      .all()
      .filter((row) => row.condition < 100);

    // Nueve partidos de jornada: mucha más gente que los doce del usuario.
    expect(cansados.length).toBeGreaterThan(50);
  });
});

describe('descanso y calendario', () => {
  it('avanzar el reloj recupera forma', { timeout: 60_000 }, () => {
    const gameId = playUserGame();
    const acta = match.get(gameId)!;
    const side = acta.managedSide === 'home' ? acta.home : acta.away;
    const titular = side.boxScores[0]!.playerId;

    const cansado = player(titular);
    fitness.advanceDays(new Date(Date.UTC(2025, 8, 1)), new Date(Date.UTC(2025, 8, 4)));

    expect(player(titular).condition).toBe(
      conditionAfterRest(cansado.condition, 3, cansado.stamina)
    );
  });

  it('recupera hacia cien sin pasarse', () => {
    db.update(playersTable).set({ condition: 60 }).run();

    // Del martes al sábado: sin lunes de por medio, aquí sólo se descansa.
    fitness.advanceDays(new Date(Date.UTC(2025, 8, 2)), new Date(Date.UTC(2025, 8, 6)));
    const conditions = roster().map((row) => row.condition);

    expect(Math.max(...conditions)).toBeLessThanOrEqual(100);
    expect(Math.min(...conditions)).toBeGreaterThan(60);
  });

  it('las bajas bajan con los días y el jugador vuelve solo', () => {
    const lesionado = roster()[0]!;
    db.update(playersTable)
      .set({ injuryDaysLeft: 5, injuryName: 'Esguince de tobillo' })
      .where(eq(playersTable.id, lesionado.id))
      .run();

    fitness.advanceDays(new Date(Date.UTC(2025, 8, 1)), new Date(Date.UTC(2025, 8, 4)));
    expect(player(lesionado.id).injuryDaysLeft).toBe(2);
    expect(player(lesionado.id).injuryName).toBe('Esguince de tobillo');

    fitness.advanceDays(new Date(Date.UTC(2025, 8, 4)), new Date(Date.UTC(2025, 8, 9)));
    expect(player(lesionado.id).injuryDaysLeft).toBe(0);
    expect(player(lesionado.id).injuryName).toBeNull();
  });
});

describe('lesiones', () => {
  it('un lesionado no se viste: no aparece en el acta', { timeout: 60_000 }, () => {
    const fuera = roster()[0]!;
    db.update(playersTable)
      .set({ injuryDaysLeft: 20, injuryName: 'Rotura fibrilar' })
      .where(eq(playersTable.id, fuera.id))
      .run();

    const gameId = playUserGame();
    const acta = match.get(gameId)!;
    const side = acta.managedSide === 'home' ? acta.home : acta.away;

    expect(side.boxScores).toHaveLength(11);
    expect(side.boxScores.some((line) => line.playerId === fuera.id)).toBe(false);
    // Sigue en la enfermería, y puede que no esté solo: el propio partido tiene
    // su riesgo, así que aquí se comprueba el suyo y no un total exacto.
    expect(player(fuera.id).injuryDaysLeft).toBeGreaterThan(0);
    expect(fitness.getPlan(MANAGED_TEAM).injuredCount).toBeGreaterThanOrEqual(1);
  });

  it('una temporada deja lesiones por toda la liga', { timeout: 180_000 }, () => {
    // El consejo, fuera: si la partida sale mal y hay despido, el reloj se para
    // a mitad de temporada y este test dejaría de comprobar lo que dice.
    season.getCurrent();
    db.delete(boardTable).run();

    for (let guard = 0; guard < 600; guard += 1) {
      const result = season.advanceToNextGame();
      if (result.status === 'seasonOver' || result.status === 'dismissed') {
        break;
      }
      if (result.status === 'userGame') {
        playUserGame();
      }
    }

    const conHistorial = db
      .select()
      .from(playersTable)
      .all()
      .filter((row) => row.injuryDaysLeft > 0);

    // No es una liga de cristal ni una de hierro: al acabar la temporada hay
    // gente en la enfermería, pero no media liga.
    expect(conHistorial.length).toBeGreaterThan(0);
    expect(conHistorial.length).toBeLessThan(40);
  });
});

describe('entrenamiento semanal', () => {
  it('con foco de tiro la plantilla mejora el tiro', () => {
    fitness.savePlan({
      teamId: MANAGED_TEAM,
      intensity: 8,
      focus: 'shooting',
      players: []
    });
    const antes = totalAttributes();

    for (let week = 0; week < 12; week += 1) {
      fitness.runTrainingWeek(new Date(Date.UTC(2025, 8, 1 + week * 7)));
    }

    expect(totalAttributes()).toBeGreaterThan(antes);
  });

  it('entrenar cansa, y la semana de recuperación devuelve forma', () => {
    const objetivo = roster()[0]!;
    db.update(playersTable).set({ condition: 60 }).where(eq(playersTable.id, objetivo.id)).run();

    fitness.savePlan({ teamId: MANAGED_TEAM, intensity: 10, focus: 'physical', players: [] });
    fitness.runTrainingWeek(new Date(Date.UTC(2025, 8, 1)));
    const trasEntrenar = player(objetivo.id).condition;
    expect(trasEntrenar).toBeLessThan(60);

    fitness.savePlan({ teamId: MANAGED_TEAM, intensity: 10, focus: 'recovery', players: [] });
    fitness.runTrainingWeek(new Date(Date.UTC(2025, 8, 8)));

    expect(player(objetivo.id).condition).toBeGreaterThan(trasEntrenar);
  });

  it('el lesionado no entrena', () => {
    const lesionado = roster()[0]!;
    db.update(playersTable)
      .set({ injuryDaysLeft: 20, injuryName: 'Rotura fibrilar', condition: 50 })
      .where(eq(playersTable.id, lesionado.id))
      .run();

    fitness.savePlan({ teamId: MANAGED_TEAM, intensity: 10, focus: 'physical', players: [] });
    fitness.runTrainingWeek(new Date(Date.UTC(2025, 8, 1)));

    expect(player(lesionado.id).condition).toBe(50);
  });

  it('el reloj entrena solo al cruzar un lunes', () => {
    const antes = totalAttributes();
    fitness.savePlan({ teamId: MANAGED_TEAM, intensity: 10, focus: 'shooting', players: [] });

    // Del lunes 1 de septiembre de 2025 al lunes siguiente: una semana entera.
    fitness.advanceDays(new Date(Date.UTC(2025, 8, 1)), new Date(Date.UTC(2025, 8, 8)));

    expect(roster().some((row) => row.condition < 100)).toBe(true);
    expect(totalAttributes()).toBeGreaterThanOrEqual(antes);
  });
});

describe('cambio de temporada', () => {
  it('el verano devuelve a todos a cien y cura lo corto', () => {
    const [corta, larga] = roster();
    db.update(playersTable)
      .set({ injuryDaysLeft: 10, injuryName: 'Esguince de tobillo', condition: 40 })
      .where(eq(playersTable.id, corta!.id))
      .run();
    db.update(playersTable)
      .set({ injuryDaysLeft: 150, injuryName: 'Lesión de rodilla', condition: 40 })
      .where(eq(playersTable.id, larga!.id))
      .run();

    fitness.startNewSeason(new Date(Date.UTC(2026, 5, 20)), new Date(Date.UTC(2026, 8, 1)));

    expect(player(corta!.id).condition).toBe(100);
    expect(player(corta!.id).injuryDaysLeft).toBe(0);
    expect(player(corta!.id).injuryName).toBeNull();
    // Una lesión de cinco meses no se cura por irse de vacaciones.
    expect(player(larga!.id).injuryDaysLeft).toBeGreaterThan(0);
  });
});
