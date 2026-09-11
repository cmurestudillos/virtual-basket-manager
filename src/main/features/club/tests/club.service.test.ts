import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MIN_EXPANSION_SEATS, expansionCostCents } from '@shared/domain/finance';
import {
  closeSaveDatabase,
  openSaveDatabase,
  type SaveDatabase
} from '../../../database/save-database';
import { boardTable, financeEntriesTable, teamsTable } from '../../../database/schema/save';
import { loadDataset } from '../../saves/dataset';
import { seedSave } from '../../saves/save-seeder';
import { MatchService } from '../../match/match.service';
import { SeasonService } from '../../season/season.service';
import { BoardService } from '../board.service';
import { ClubService } from '../club.service';

/**
 * Las cuentas del club contra SQLite de verdad: lo que entra en pretemporada,
 * lo que deja cada partido en casa, lo que se va en nóminas y lo que dice el
 * consejo de todo ello.
 */

const MIGRATIONS = resolve('drizzle/save');
const SEED_DIRECTORY = resolve('resources/seed-data');
const MANAGED_TEAM = 'team-1';
const RIVAL_TEAM = 'team-2';

let directory: string;
let filePath: string;
let db: SaveDatabase;
let club: ClubService;
let board: BoardService;
let season: SeasonService;
let match: MatchService;

function team(teamId = MANAGED_TEAM) {
  return db.select().from(teamsTable).where(eq(teamsTable.id, teamId)).get()!;
}

function entries() {
  return db.select().from(financeEntriesTable).all();
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
  directory = mkdtempSync(join(tmpdir(), 'vbm-club-'));
  filePath = join(directory, 'partida.sqlite');
  db = openSaveDatabase(filePath, MIGRATIONS);
  seedSave(db, loadDataset(SEED_DIRECTORY), {
    managedTeamId: MANAGED_TEAM,
    managerName: 'Carlos'
  });

  const resolveDb = (): SaveDatabase => db;
  club = new ClubService(resolveDb);
  board = new BoardService(resolveDb);
  season = new SeasonService(resolveDb);
  match = new MatchService(resolveDb);
});

afterEach(() => {
  closeSaveDatabase(filePath);
  rmSync(directory, { recursive: true, force: true });
});

describe('pretemporada', () => {
  it('al crear la temporada entran abonos, televisión y patrocinio', () => {
    const antes = team().budgetCents;
    season.getCurrent();

    const tipos = entries().map((row) => row.type);
    expect(tipos).toContain('membership');
    expect(tipos).toContain('tv');
    expect(tipos).toContain('sponsorship');
    expect(team().budgetCents).toBeGreaterThan(antes);
  });

  it('no se cobra dos veces por preguntar dos veces', () => {
    season.getCurrent();
    const apuntes = entries().length;
    season.getCurrent();
    season.getStandings();

    expect(entries()).toHaveLength(apuntes);
  });

  it('el club arranca con abonados y con el pabellón templado', () => {
    expect(team().seasonTicketHolders).toBeGreaterThan(0);
    expect(team().fanSupport).toBe(55);
    expect(team().ticketPriceCents).toBe(2000);
  });

  it('sólo lleva libros el club del usuario', () => {
    season.getCurrent();

    expect(entries().every((row) => row.teamId === MANAGED_TEAM)).toBe(true);
  });
});

describe('taquilla y ambiente', () => {
  it('un partido en casa deja taquilla y mueve a la afición', { timeout: 60_000 }, () => {
    season.getCurrent();
    const ambienteAntes = team().fanSupport;

    // Se juegan jornadas hasta que al equipo le toque jugar en casa.
    let jugados = 0;
    while (jugados < 4 && entries().every((row) => row.type !== 'ticketing')) {
      const result = season.advanceToNextGame();
      if (result.status === 'userGame') {
        playUserGame();
      }
      jugados += 1;
    }

    const taquilla = entries().filter((row) => row.type === 'ticketing');
    expect(taquilla.length).toBeGreaterThan(0);
    expect(taquilla[0]!.amountCents).toBeGreaterThan(0);
    expect(taquilla[0]!.description).toMatch(/espectadores/);
    expect(team().fanSupport).not.toBe(ambienteAntes);
  });

  it('subir el precio espanta gente y bajarlo la trae', () => {
    season.getCurrent();

    const caro = club.setTicketPrice({ teamId: MANAGED_TEAM, priceCents: 60_00 });
    const barato = club.setTicketPrice({ teamId: MANAGED_TEAM, priceCents: 10_00 });

    expect(caro.expectedAttendance).toBeLessThan(barato.expectedAttendance);
    expect(barato.ticketPriceCents).toBe(10_00);
    expect(barato.seasonTicketPriceCents).toBe(10_00 * 12);
  });

  it('no deja poner un precio fuera de la escala ni tocar el de un rival', () => {
    expect(() => club.setTicketPrice({ teamId: MANAGED_TEAM, priceCents: 500_00 })).toThrow();
    expect(() => club.setTicketPrice({ teamId: RIVAL_TEAM, priceCents: 20_00 })).toThrow(
      /no lo dirige el usuario/
    );
  });
});

describe('obras del pabellón', () => {
  it('ampliar cuesta dinero y añade asientos', () => {
    const antes = team();
    const despues = club.expandArena({ teamId: MANAGED_TEAM, seats: 1_000 });

    expect(despues.capacity).toBe(antes.pavilionCapacity + 1_000);
    expect(despues.balanceCents).toBe(antes.budgetCents - expansionCostCents(1_000));
    expect(entries().some((row) => row.type === 'facilities')).toBe(true);
  });

  it('sin caja no hay obra', () => {
    db.update(teamsTable)
      .set({ budgetCents: 1_000_00 })
      .where(eq(teamsTable.id, MANAGED_TEAM))
      .run();

    expect(() => club.expandArena({ teamId: MANAGED_TEAM, seats: MIN_EXPANSION_SEATS })).toThrow(
      /dinero/
    );
  });

  it('el pabellón tiene techo', () => {
    db.update(teamsTable)
      .set({ pavilionCapacity: 24_000, budgetCents: 900_000_000_00 })
      .where(eq(teamsTable.id, MANAGED_TEAM))
      .run();

    expect(() => club.expandArena({ teamId: MANAGED_TEAM, seats: 5_000 })).toThrow(/25000/);
  });
});

describe('nóminas', () => {
  it('el primero de mes se pagan fichas y mantenimiento', { timeout: 60_000 }, () => {
    season.getCurrent();
    // Del 1 de septiembre al 1 de octubre: un primero de mes por el camino.
    for (let day = 0; day < 31; day += 1) {
      const result = season.advanceDay();
      if (result.status === 'userGame') {
        playUserGame();
      }
    }

    const nominas = entries().filter((row) => row.type === 'wages');
    const mantenimiento = entries().filter((row) => row.type === 'maintenance');

    expect(nominas).toHaveLength(1);
    expect(mantenimiento).toHaveLength(1);
    expect(nominas[0]!.amountCents).toBeLessThan(0);
    expect(nominas[0]!.description).toMatch(/Nóminas de/);
  });

  it('el resumen cuadra ingresos, gastos y saldo', () => {
    season.getCurrent();
    club.expandArena({ teamId: MANAGED_TEAM, seats: 500 });

    const finanzas = club.getFinances(MANAGED_TEAM);
    const suma = entries().reduce((total, row) => total + row.amountCents, 0);

    expect(finanzas.seasonIncomeCents + finanzas.seasonExpenseCents).toBe(suma);
    expect(finanzas.balanceCents).toBe(team().budgetCents);
    expect(finanzas.monthlyWagesCents).toBeGreaterThan(0);
  });
});

describe('una temporada entera', () => {
  it('cierra el curso sin arruinar al club', { timeout: 180_000 }, () => {
    const inicial = team().budgetCents;
    // El consejo, fuera: aquí se miran las cuentas de una temporada entera, y un
    // despido a mitad de curso pararía el reloj antes de tiempo.
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

    const finanzas = club.getFinances(MANAGED_TEAM);
    const tipos = new Set(entries().map((row) => row.type));

    // Han pasado por caja todos los conceptos del curso.
    for (const tipo of ['membership', 'tv', 'sponsorship', 'ticketing', 'wages', 'maintenance']) {
      expect(tipos.has(tipo)).toBe(true);
    }
    expect(tipos.has('prize')).toBe(true);

    // Y sin tocar nada, el club no se arruina ni se hace de oro: es el punto de
    // partida desde el que las decisiones del usuario tienen que notarse.
    expect(finanzas.balanceCents).toBeGreaterThan(0);
    expect(finanzas.balanceCents).toBeGreaterThan(inicial * 0.5);
    expect(finanzas.balanceCents).toBeLessThan(inicial * 3);
  });
});

describe('el consejo', () => {
  it('pone un objetivo acorde a lo que es el club', () => {
    season.getCurrent();
    const view = board.get(1, 18);

    expect(view.objective).toBe('title');
    expect(view.targetPosition).toBe(1);
    expect(view.confidence).toBe(60);
    expect(view.dismissed).toBe(false);
  });

  it('pierde la paciencia cuando se pierde contra los de abajo', () => {
    season.getCurrent();
    const antes = board.get(1, 18).confidence;

    board.afterManagedGame({
      homeTeamId: MANAGED_TEAM,
      awayTeamId: 'team-18',
      homeScore: 70,
      awayScore: 90
    });

    expect(board.get(1, 18).confidence).toBeLessThan(antes);
  });

  it('a cero te destituye y el reloj deja de correr', () => {
    season.getCurrent();
    db.update(boardTable).set({ confidence: 1 }).where(eq(boardTable.teamId, MANAGED_TEAM)).run();

    board.afterManagedGame({
      homeTeamId: MANAGED_TEAM,
      awayTeamId: 'team-18',
      homeScore: 70,
      awayScore: 90
    });

    expect(board.isDismissed()).toBe(true);
    expect(board.get(1, 18).confidenceLabel).toBe('Destituido');
    expect(season.advanceDay().status).toBe('dismissed');
    expect(() => season.startNextSeason()).toThrow(/destituido/);
  });

  it('un consejo ya harto no se ablanda por un buen resultado', () => {
    season.getCurrent();
    db.update(boardTable)
      .set({ confidence: 0, dismissed: true })
      .where(eq(boardTable.teamId, MANAGED_TEAM))
      .run();

    board.afterManagedGame({
      homeTeamId: MANAGED_TEAM,
      awayTeamId: 'team-2',
      homeScore: 99,
      awayScore: 60
    });

    expect(board.get(1, 18).confidence).toBe(0);
  });
});
