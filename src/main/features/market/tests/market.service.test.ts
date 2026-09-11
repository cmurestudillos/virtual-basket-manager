import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { and, eq, isNull } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { MarketPlayer } from '@shared/contracts/market.contract';
import { MIN_WAGE_CENTS } from '@shared/domain/market';
import { MAX_ROSTER } from '@shared/domain/youth';
import {
  closeSaveDatabase,
  openSaveDatabase,
  type SaveDatabase
} from '../../../database/save-database';
import {
  financeEntriesTable,
  gameStateTable,
  playersTable,
  rotationSlotsTable,
  teamsTable
} from '../../../database/schema/save';
import { loadDataset } from '../../saves/dataset';
import { seedSave } from '../../saves/save-seeder';
import { MarketService, MIN_ROSTER } from '../market.service';

/**
 * El mercado contra SQLite de verdad: lo que se puede fichar, lo que contesta
 * el club dueño y qué deja cada operación en la caja y en la plantilla.
 */

const MIGRATIONS = resolve('drizzle/save');
const SEED_DIRECTORY = resolve('resources/seed-data');
const MANAGED_TEAM = 'liga-nacional-1';

let directory: string;
let filePath: string;
let db: SaveDatabase;
let market: MarketService;

function setDate(date: Date): void {
  db.update(gameStateTable).set({ currentDate: date }).run();
}

function roster(teamId = MANAGED_TEAM) {
  return db
    .select()
    .from(playersTable)
    .where(and(eq(playersTable.teamId, teamId), eq(playersTable.isYouth, false)))
    .all();
}

function freeAgents() {
  return db
    .select()
    .from(playersTable)
    .where(and(isNull(playersTable.teamId), eq(playersTable.isYouth, false)))
    .all();
}

function budget(teamId = MANAGED_TEAM): number {
  return db.select().from(teamsTable).where(eq(teamsTable.id, teamId)).get()!.budgetCents;
}

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'vbm-market-'));
  filePath = join(directory, 'partida.sqlite');
  db = openSaveDatabase(filePath, MIGRATIONS);
  seedSave(db, loadDataset(SEED_DIRECTORY), {
    managedTeamId: MANAGED_TEAM,
    managerName: 'Carlos'
  });

  market = new MarketService(() => db);
});

afterEach(() => {
  closeSaveDatabase(filePath);
  rmSync(directory, { recursive: true, force: true });
});

describe('estado del mercado', () => {
  it('la partida arranca en pretemporada, con el mercado de verano abierto', () => {
    const status = market.getStatus();

    expect(status.window).toBe('summer');
    expect(status.isOpen).toBe(true);
    expect(status.rosterSize).toBe(12);
    expect(status.maxRoster).toBe(MAX_ROSTER);
    expect(status.seasonWagesCents).toBeGreaterThan(0);
  });

  it('en noviembre está cerrado y en enero vuelve a abrir', () => {
    setDate(new Date(Date.UTC(2025, 10, 15)));
    expect(market.getStatus().window).toBe('closed');

    setDate(new Date(Date.UTC(2026, 0, 15)));
    expect(market.getStatus().window).toBe('winter');
  });
});

describe('búsqueda', () => {
  it('enseña jugadores de otros clubes y agentes libres, nunca los tuyos', () => {
    const found = market.search({});

    expect(found.length).toBeGreaterThan(0);
    expect(found.every((player) => player.teamId !== MANAGED_TEAM)).toBe(true);
    // Y lo que se ve de ellos lleva el margen del ojeador.
    expect(found.every((player) => player.uncertainty > 0)).toBe(true);
    // La lista viene por media: lo primero que se mira al abrir el mercado.
    expect(found[0]!.overall).toBeGreaterThanOrEqual(found[found.length - 1]!.overall);
  });

  it('el agente libre no tiene precio de traspaso y el de un club sí', () => {
    // Cada uno por su lado: la búsqueda general viene ordenada por media y con
    // todas las ligas del mundo dentro, así que los libres no asoman arriba.
    const libre = market.search({ freeAgentsOnly: true })[0] as MarketPlayer;
    const fichado = market.search({}).find((player) => !player.isFreeAgent) as MarketPlayer;

    expect(libre.askingPriceCents).toBe(0);
    expect(fichado.askingPriceCents).toBeGreaterThan(0);
    expect(fichado.wageDemandCents).toBeGreaterThanOrEqual(MIN_WAGE_CENTS);
  });

  it('los filtros acotan de verdad', () => {
    const bases = market.search({ position: 'PG', limit: 100 });
    const jovenes = market.search({ maxAge: 25, limit: 100 });
    const libres = market.search({ freeAgentsOnly: true, limit: 100 });

    expect(bases.every((player) => player.position === 'PG')).toBe(true);
    expect(jovenes.every((player) => player.age <= 25)).toBe(true);
    expect(libres.every((player) => player.isFreeAgent)).toBe(true);
  });
});

describe('fichar a un agente libre', () => {
  it('con la ficha que pide, firma', () => {
    const libre = market.search({ freeAgentsOnly: true })[0]!;

    const result = market.offer({
      playerId: libre.playerId,
      feeCents: 0,
      wageCents: libre.wageDemandCents,
      years: 2
    });

    expect(result.accepted).toBe(true);
    expect(result.status.rosterSize).toBe(13);
    expect(roster().some((row) => row.id === libre.playerId)).toBe(true);
    // Un agente libre no cuesta traspaso: la caja no se mueve.
    expect(db.select().from(financeEntriesTable).all()).toHaveLength(0);
  });

  it('por debajo de lo que pide, no firma', () => {
    const libre = market.search({ freeAgentsOnly: true })[0]!;

    const result = market.offer({
      playerId: libre.playerId,
      feeCents: 0,
      wageCents: MIN_WAGE_CENTS,
      years: 2
    });

    expect(result.accepted).toBe(false);
    expect(result.reason).toMatch(/ficha/);
    expect(roster()).toHaveLength(12);
  });
});

describe('fichar a un jugador con contrato', () => {
  it('el club pide su precio, y pagándolo lo vende', () => {
    const objetivo = market
      .search({ limit: 100 })
      .find((player) => !player.isFreeAgent && player.askingPriceCents < budget())!;
    const cajaAntes = budget();
    const vendedorAntes = budget(objetivo.teamId as string);

    const result = market.offer({
      playerId: objetivo.playerId,
      feeCents: objetivo.askingPriceCents,
      wageCents: objetivo.wageDemandCents,
      years: 3
    });

    expect(result.accepted).toBe(true);
    expect(roster().some((row) => row.id === objetivo.playerId)).toBe(true);
    expect(budget()).toBe(cajaAntes - objetivo.askingPriceCents);
    expect(budget(objetivo.teamId as string)).toBe(vendedorAntes + objetivo.askingPriceCents);
    // El traspaso queda apuntado en el libro del club.
    const entries = db.select().from(financeEntriesTable).all();
    expect(entries.some((row) => row.type === 'transfer')).toBe(true);
    // Y deja de ocupar sitio en la rotación de su antiguo equipo.
    expect(
      db
        .select()
        .from(rotationSlotsTable)
        .where(eq(rotationSlotsTable.playerId, objetivo.playerId))
        .all()
    ).toHaveLength(0);
  });

  it('quedarse cerca abre una contraoferta, y tirar el precio no', () => {
    const objetivo = market.search({ limit: 100 }).find((player) => !player.isFreeAgent)!;

    const cerca = market.offer({
      playerId: objetivo.playerId,
      feeCents: Math.round(objetivo.askingPriceCents * 0.8),
      wageCents: objetivo.wageDemandCents,
      years: 3
    });

    expect(cerca.accepted).toBe(false);
    expect(cerca.reason).toMatch(/hablar/);
    expect(cerca.counterOfferCents).toBeGreaterThan(0);
    expect(cerca.counterOfferCents!).toBeLessThan(objetivo.askingPriceCents);

    const ridicula = market.offer({
      playerId: objetivo.playerId,
      feeCents: Math.round(objetivo.askingPriceCents * 0.3),
      wageCents: objetivo.wageDemandCents,
      years: 3
    });

    expect(ridicula.accepted).toBe(false);
    expect(ridicula.counterOfferCents).toBeUndefined();
  });

  it('aceptar la contraoferta cierra el fichaje', () => {
    const objetivo = market
      .search({ limit: 100 })
      .find((player) => !player.isFreeAgent && player.askingPriceCents < budget())!;

    const contra = market.offer({
      playerId: objetivo.playerId,
      feeCents: Math.round(objetivo.askingPriceCents * 0.8),
      wageCents: objetivo.wageDemandCents,
      years: 3
    });
    const cerrado = market.offer({
      playerId: objetivo.playerId,
      feeCents: contra.counterOfferCents as number,
      wageCents: objetivo.wageDemandCents,
      years: 3
    });

    expect(cerrado.accepted).toBe(true);
    expect(roster().some((row) => row.id === objetivo.playerId)).toBe(true);
  });

  it('sin dinero en caja no hay fichaje por mucho que acepten', () => {
    db.update(teamsTable)
      .set({ budgetCents: 1_000_00 })
      .where(eq(teamsTable.id, MANAGED_TEAM))
      .run();
    const objetivo = market
      .search({ limit: 100 })
      .find((player) => !player.isFreeAgent && player.askingPriceCents > 1_000_00)!;

    const result = market.offer({
      playerId: objetivo.playerId,
      feeCents: objetivo.askingPriceCents,
      wageCents: objetivo.wageDemandCents,
      years: 2
    });

    expect(result.accepted).toBe(false);
    expect(result.reason).toMatch(/dinero/);
  });
});

describe('límites', () => {
  it('con el mercado cerrado no se ficha', () => {
    setDate(new Date(Date.UTC(2025, 10, 20)));
    const libre = market.search({ freeAgentsOnly: true })[0]!;

    expect(() =>
      market.offer({
        playerId: libre.playerId,
        feeCents: 0,
        wageCents: libre.wageDemandCents,
        years: 1
      })
    ).toThrow(/cerrado/);
  });

  it('con la plantilla llena tampoco', () => {
    // Se ficha por lo barato: con el tope de nómina, llenar la plantilla con
    // los mejores libres no cabría en las cuentas del club.
    let libres = market
      .search({ freeAgentsOnly: true, limit: 100 })
      .sort((a, b) => a.wageDemandCents - b.wageDemandCents);
    let index = 0;
    while (market.getStatus().rosterSize < MAX_ROSTER && index < libres.length) {
      const libre = libres[index] as (typeof libres)[number];
      market.offer({
        playerId: libre.playerId,
        feeCents: 0,
        wageCents: libre.wageDemandCents,
        years: 1
      });
      index += 1;
    }

    expect(market.getStatus().rosterSize).toBe(MAX_ROSTER);
    libres = market.search({ freeAgentsOnly: true, limit: 100 });
    expect(() =>
      market.offer({
        playerId: libres[0]!.playerId,
        feeCents: 0,
        wageCents: libres[0]!.wageDemandCents,
        years: 1
      })
    ).toThrow(/plantilla/);
  });

  it('la nómina no puede pasar del tope que fija el consejo', () => {
    const status = market.getStatus();
    const margen = status.wageCeilingCents - status.seasonWagesCents;
    const libre = market.search({ freeAgentsOnly: true, limit: 100 })[0]!;

    expect(status.wageCeilingCents).toBeGreaterThan(status.seasonWagesCents);
    // Pagar de más está permitido; pasarse del tope del consejo, no.
    expect(
      market.offer({
        playerId: libre.playerId,
        feeCents: 0,
        wageCents: margen + 100_000_00,
        years: 2
      }).reason
    ).toMatch(/tope/);
  });

  it('el cupo de jugadores de formación no se puede romper', () => {
    expect(market.getStatus().homegrownInSquad).toBeGreaterThanOrEqual(
      market.getStatus().minHomegrown
    );

    // Primero se llena la plantilla con extranjeros baratos: sin sitio de
    // sobra, soltar gente de casa chocaría antes con el mínimo de fichas que
    // con el cupo, y lo que se comprueba aquí es el cupo.
    const libres = market
      .search({ freeAgentsOnly: true, limit: 100 })
      .filter((player) => !player.isHomegrown)
      .sort((a, b) => a.wageDemandCents - b.wageDemandCents);
    for (const libre of libres) {
      if (market.getStatus().rosterSize >= MAX_ROSTER) {
        break;
      }
      market.offer({
        playerId: libre.playerId,
        feeCents: 0,
        wageCents: libre.wageDemandCents,
        years: 1
      });
    }

    // Y ahora se deja al club justo en el mínimo de jugadores de formación.
    for (const entry of market.listContracts().filter((row) => row.isHomegrown)) {
      const status = market.getStatus();
      if (status.homegrownInSquad <= status.minHomegrown) {
        break;
      }
      market.release({ playerId: entry.playerId });
    }

    const status = market.getStatus();
    expect(status.homegrownInSquad).toBe(status.minHomegrown);

    const ultimo = market.listContracts().find((entry) => entry.isHomegrown)!;
    expect(() => market.release({ playerId: ultimo.playerId })).toThrow(/formación/);
  });
});

describe('cesiones', () => {
  it('ceder a uno de los tuyos lo manda a otro club hasta final de temporada', () => {
    const contracts = market.listContracts();
    // El peor de la plantilla: a los buenos no los quiere nadie cedidos... los
    // quiere todo el mundo, pero no es lo que uno cede.
    const cedible = [...contracts].sort((a, b) => a.overall - b.overall)[0]!;

    const result = market.loanOut({ playerId: cedible.playerId });

    expect(result.accepted).toBe(true);
    expect(result.reason).toMatch(/cedido a/);
    expect(roster().some((row) => row.id === cedible.playerId)).toBe(false);

    const loans = market.listLoans();
    expect(loans).toHaveLength(1);
    expect(loans[0]!.direction).toBe('out');
    expect(loans[0]!.until).not.toBeNull();
  });

  it('un cedido sigue jugando en el club que lo recibe', () => {
    const cedible = [...market.listContracts()].sort((a, b) => a.overall - b.overall)[0]!;
    market.loanOut({ playerId: cedible.playerId });

    const row = db.select().from(playersTable).where(eq(playersTable.id, cedible.playerId)).get()!;
    expect(row.teamId).not.toBe(MANAGED_TEAM);
    expect(row.loanFromTeamId).toBe(MANAGED_TEAM);
    // Y deja su hueco en la rotación del club que lo cede.
    expect(
      db
        .select()
        .from(rotationSlotsTable)
        .where(eq(rotationSlotsTable.playerId, cedible.playerId))
        .all()
    ).toHaveLength(0);
  });

  it('nadie cede a uno de sus mejores', () => {
    const estrella = market
      .search({ limit: 100 })
      .find((player) => !player.isFreeAgent && player.overall > 70)!;

    const result = market.loanIn({ playerId: estrella.playerId });

    expect(result.accepted).toBe(false);
    expect(result.reason).toMatch(/mejores/);
  });

  it('en verano vuelven los cedidos a su club', () => {
    const cedible = [...market.listContracts()].sort((a, b) => a.overall - b.overall)[0]!;
    // Con contrato largo, para que la vuelta no se cruce con un vencimiento.
    db.update(playersTable)
      .set({ contractUntil: new Date(Date.UTC(2030, 5, 30)) })
      .where(eq(playersTable.id, cedible.playerId))
      .run();
    market.loanOut({ playerId: cedible.playerId });
    expect(market.listLoans()).toHaveLength(1);

    market.processOffseason(new Date(Date.UTC(2026, 6, 1)));

    expect(market.listLoans()).toHaveLength(0);
    expect(roster().some((row) => row.id === cedible.playerId)).toBe(true);
  });
});

describe('contratos', () => {
  it('lista la plantilla con lo que vence antes primero', () => {
    const contracts = market.listContracts();

    expect(contracts).toHaveLength(12);
    expect(contracts[0]!.contractYearsLeft).toBeLessThanOrEqual(
      contracts[contracts.length - 1]!.contractYearsLeft
    );
    expect(contracts[0]!.renewalWageCents).toBeGreaterThan(0);
    expect(contracts[0]!.releaseCostCents).toBeGreaterThanOrEqual(0);
  });

  it('renovar pagando lo que pide alarga el contrato', () => {
    const contract = market.listContracts()[0]!;

    const after = market
      .renew({
        playerId: contract.playerId,
        wageCents: contract.renewalWageCents,
        years: 4
      })
      .find((entry) => entry.playerId === contract.playerId)!;

    expect(after.contractYearsLeft).toBeGreaterThan(contract.contractYearsLeft);
    expect(after.wageCents).toBe(contract.renewalWageCents);
  });

  it('renovar por debajo de lo que pide no cambia nada', () => {
    const contract = market.listContracts()[0]!;

    const after = market
      .renew({ playerId: contract.playerId, wageCents: MIN_WAGE_CENTS, years: 4 })
      .find((entry) => entry.playerId === contract.playerId)!;

    expect(after.contractYearsLeft).toBe(contract.contractYearsLeft);
  });

  it('rescindir cuesta dinero y deja al jugador libre', () => {
    const contract = market.listContracts()[0]!;
    const cajaAntes = budget();

    const after = market.release({ playerId: contract.playerId });

    expect(after).toHaveLength(11);
    expect(budget()).toBe(cajaAntes - contract.releaseCostCents);
    expect(freeAgents().some((row) => row.id === contract.playerId)).toBe(true);
  });

  it('no se puede vaciar la plantilla', () => {
    let contracts = market.listContracts();
    while (contracts.length > MIN_ROSTER) {
      contracts = market.release({ playerId: contracts[0]!.playerId });
    }

    expect(contracts).toHaveLength(MIN_ROSTER);
    expect(() => market.release({ playerId: contracts[0]!.playerId })).toThrow(/No puedes bajar/);
  });
});

describe('el mercado se mueve solo', () => {
  it('en verano vencen contratos y la IA cubre sus huecos', () => {
    // Se deja a un rival corto de plantilla y con un contrato vencido.
    const rival = roster('liga-nacional-2');
    db.update(playersTable).set({ teamId: null }).where(eq(playersTable.id, rival[0]!.id)).run();
    db.update(playersTable)
      .set({ contractUntil: new Date(Date.UTC(2026, 5, 30)) })
      .where(eq(playersTable.id, rival[1]!.id))
      .run();

    const libresAntes = freeAgents().length;
    market.processOffseason(new Date(Date.UTC(2026, 6, 1)));

    // El rival vuelve a tener plantilla suficiente para jugar.
    expect(roster('liga-nacional-2').length).toBeGreaterThanOrEqual(12);
    expect(freeAgents().length).toBeLessThan(libresAntes + 18);
  });

  it('al usuario no se le renueva solo: lo que no renueve, se va', () => {
    const contract = market.listContracts()[0]!;
    db.update(playersTable)
      .set({ contractUntil: new Date(Date.UTC(2026, 5, 30)) })
      .where(eq(playersTable.id, contract.playerId))
      .run();

    market.processOffseason(new Date(Date.UTC(2026, 6, 1)));

    expect(roster().some((row) => row.id === contract.playerId)).toBe(false);
  });
});
