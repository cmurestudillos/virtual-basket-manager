import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  closeSaveDatabase,
  openSaveDatabase,
  type SaveDatabase
} from '../../../database/save-database';
import {
  boardTable,
  careerSpellsTable,
  gamesTable,
  gameStateTable,
  seasonsTable,
  teamsTable
} from '../../../database/schema/save';
import { loadDataset } from '../../saves/dataset';
import { seedSave } from '../../saves/save-seeder';
import { BoardService } from '../../club/board.service';
import { SeasonRepository } from '../../season/season.repository';
import { SeasonService } from '../../season/season.service';
import {
  CareerService,
  NotEmployedError,
  NotInCareerModeError,
  NotUnemployedError,
  OfferNotAvailableError
} from '../career.service';
import { CareerRepository } from '../career.repository';

/**
 * La carrera del entrenador, con despido y fichaje de verdad.
 *
 * El despido se provoca a mano —dejar caer la confianza jugando media temporada
 * costaría minutos por test— pero todo lo demás pasa por el camino real: el
 * consejo destituye, la carrera se entera al leer el estado, y firmar por otro
 * club cambia de verdad quién dirige la partida.
 */

const MIGRATIONS = resolve('drizzle/save');
const SEED_DIRECTORY = resolve('resources/seed-data');
const MANAGED_TEAM = 'liga-nacional-1';

let directory: string;
let filePath: string;
let db: SaveDatabase;
let career: CareerService;

function openSave(careerMode: boolean, activeCountries?: string[]): void {
  directory = mkdtempSync(join(tmpdir(), 'vbm-career-'));
  filePath = join(directory, 'partida.sqlite');
  db = openSaveDatabase(filePath, MIGRATIONS);
  seedSave(db, loadDataset(SEED_DIRECTORY), {
    managedTeamId: MANAGED_TEAM,
    managerName: 'Carlos',
    careerMode,
    activeCountries
  });

  const resolveDb = (): SaveDatabase => db;
  // La temporada tiene que existir para que haya clasificación y objetivos.
  new SeasonService(resolveDb).getCurrent();
  career = new CareerService(resolveDb);
}

/** Le echan: el consejo pierde la paciencia del todo. */
function getDismissed(): void {
  new BoardService(() => db).ensureForSeason(1, 18);
  db.update(boardTable).set({ confidence: 0, dismissed: true }).run();
}

function managedTeamId(): string | null {
  return db.select().from(gameStateTable).get()?.managedTeamId ?? null;
}

afterEach(() => {
  closeSaveDatabase(filePath);
  rmSync(directory, { recursive: true, force: true });
});

describe('modo mánager: no hay carrera', () => {
  beforeEach(() => openSave(false));

  it('la carrera está apagada y no ofrece nada', () => {
    const status = career.getStatus();

    expect(status.careerMode).toBe(false);
    expect(status.offers).toHaveLength(0);
    expect(status.unemployed).toBe(false);
  });

  it('pero sí hay hoja de servicios: reputación, etapa y club, sin acciones', () => {
    const status = career.getStatus();

    expect(status.reputation).toBeGreaterThan(0);
    expect(status.reputationLabel).not.toBe('');
    expect(status.spells).toHaveLength(1);
    expect(status.currentTeamName).not.toBeNull();
    expect(status.canResign).toBe(false);
    expect(status.canWait).toBe(false);
    expect(status.nationalOffers).toHaveLength(0);
  });

  it('aunque te echen, no se puede fichar por nadie', () => {
    getDismissed();

    expect(career.getStatus().careerMode).toBe(false);
    expect(() => career.accept('liga-nacional-2')).toThrow(NotInCareerModeError);
  });
});

describe('modo carrera', () => {
  beforeEach(() => openSave(true));

  it('arranca con una etapa abierta en el club elegido', () => {
    const status = career.getStatus();

    expect(status.careerMode).toBe(true);
    expect(status.unemployed).toBe(false);
    expect(status.spells).toHaveLength(1);
    expect(status.spells[0]!.teamId).toBe(MANAGED_TEAM);
    expect(status.spells[0]!.endSeason).toBeNull();
    expect(status.currentTeamName).not.toBeNull();
    // Sin haber dirigido nada todavía, vale lo que vale cualquiera.
    expect(status.reputation).toBeGreaterThan(0);
    expect(status.reputationLabel.length).toBeGreaterThan(0);
  });

  it('con equipo no hay ofertas: sólo se busca banquillo estando libre', () => {
    expect(career.getStatus().offers).toHaveLength(0);
  });

  it('al ser destituido cierra la etapa y llegan ofertas', () => {
    getDismissed();

    const status = career.getStatus();

    expect(status.unemployed).toBe(true);
    expect(status.spells[0]!.endSeason).toBe(1);
    expect(status.spells[0]!.endReason).toBe('dismissed');
    expect(status.offers.length).toBeGreaterThan(0);
    // Nunca te ofrece volver al que acaba de echarte.
    expect(status.offers.some((offer) => offer.teamId === MANAGED_TEAM)).toBe(false);
    // Y todas las ofertas dicen lo que hace falta para decidir.
    for (const offer of status.offers) {
      expect(offer.teamName.length).toBeGreaterThan(0);
      expect(offer.competitionName.length).toBeGreaterThan(0);
      expect(offer.objectiveLabel.length).toBeGreaterThan(0);
      expect(offer.stepLabel.length).toBeGreaterThan(0);
    }
  });

  it('las ofertas salen de las ligas que se están jugando, no del mundo entero', () => {
    getDismissed();

    // Sólo se simulan las divisiones del país del club, que son las únicas con
    // calendario este año: fichar fuera dejaría al entrenador en una liga que
    // esta temporada no existe.
    for (const offer of career.getStatus().offers) {
      expect(
        offer.teamId.startsWith('liga-nacional-') || offer.teamId.startsWith('liga-plata-')
      ).toBe(true);
    }
  });

  it('cada oferta dice de qué país es', () => {
    getDismissed();

    for (const offer of career.getStatus().offers) {
      expect(offer.countryName).toBe('España');
    }
  });

  it('firmar por otro club cambia quién dirige y abre una etapa nueva', () => {
    getDismissed();
    const oferta = career.getStatus().offers[0]!;

    const status = career.accept(oferta.teamId);

    expect(managedTeamId()).toBe(oferta.teamId);
    expect(status.unemployed).toBe(false);
    expect(status.currentTeamName).toBe(oferta.teamName);
    expect(status.spells).toHaveLength(2);

    const abierta = status.spells.find((spell) => spell.endSeason === null);
    expect(abierta?.teamId).toBe(oferta.teamId);
    // Y el club nuevo llega con su consejo puesto, no destituido de antemano.
    expect(new BoardService(() => db).isDismissed()).toBe(false);
  });

  it('no se puede firmar por un club que no te ha ofrecido nada', () => {
    getDismissed();
    const ofrecidos = new Set(career.getStatus().offers.map((offer) => offer.teamId));
    const ajeno = ['liga-nacional-5', 'liga-nacional-6', 'liga-plata-3'].find(
      (id) => !ofrecidos.has(id)
    )!;

    expect(() => career.accept(ajeno)).toThrow(OfferNotAvailableError);
  });

  it('teniendo equipo, a mitad de temporada nadie te ofrece nada', () => {
    const status = career.getStatus();
    expect(status.offers).toHaveLength(0);
    expect(status.canResign).toBe(true);
    expect(status.canWait).toBe(false);

    expect(() => career.accept('liga-nacional-4')).toThrow(OfferNotAvailableError);
    expect(managedTeamId()).toBe(MANAGED_TEAM);
  });

  it('las etapas quedan guardadas en la partida, no en memoria', () => {
    getDismissed();
    career.accept(career.getStatus().offers[0]!.teamId);

    const filas = db.select().from(careerSpellsTable).all();
    expect(filas).toHaveLength(2);
    expect(filas.filter((row) => row.endSeason === null)).toHaveLength(1);
  });
});

describe('dimitir y esperar', () => {
  beforeEach(() => openSave(true));

  it('dimitir cierra la etapa por voluntad propia y deja sin banquillo', () => {
    const status = career.resign();

    expect(status.unemployed).toBe(true);
    expect(status.canWait).toBe(true);
    expect(status.canResign).toBe(false);
    expect(status.spells[0]!.endReason).toBe('left');
    // Siempre llama alguien: esperar es para buscar algo mejor, no la única salida.
    expect(status.offers.length).toBeGreaterThan(0);
  });

  it('sin banquillo, el reloj normal no avanza', () => {
    career.resign();

    expect(new SeasonService(() => db).advanceDay().status).toBe('dismissed');
  });

  it('no se dimite dos veces, ni se espera teniendo equipo', () => {
    expect(() => career.wait()).toThrow(NotUnemployedError);
    career.resign();
    expect(() => career.resign()).toThrow(NotEmployedError);
  });

  it(
    'esperar deja pasar el mes con el mundo jugándose, y trae ofertas',
    { timeout: 180_000 },
    () => {
      career.resign();
      const antes = db.select().from(gameStateTable).get()!.currentDate;
      const jugadosAntes = db
        .select()
        .from(gamesTable)
        .all()
        .filter((game) => game.homeScore !== null).length;

      const status = career.wait();

      const despues = db.select().from(gameStateTable).get()!.currentDate;
      expect(despues.getUTCMonth()).not.toBe(antes.getUTCMonth());
      // El mundo no se ha parado: se han jugado partidos, también los del club
      // que dejaste, que ahora lleva la IA.
      const jugados = db
        .select()
        .from(gamesTable)
        .all()
        .filter((game) => game.homeScore !== null);
      expect(jugados.length).toBeGreaterThan(jugadosAntes);
      expect(
        jugados.some((game) => game.homeTeamId === MANAGED_TEAM || game.awayTeamId === MANAGED_TEAM)
      ).toBe(true);

      expect(status.unemployed).toBe(true);
      expect(status.offers.length).toBeGreaterThan(0);
    }
  );

  it('mirar dos veces el mismo mes da las mismas ofertas', () => {
    career.resign();
    const una = career.getStatus().offers.map((offer) => offer.teamId);
    const otra = career.getStatus().offers.map((offer) => offer.teamId);

    expect(otra).toEqual(una);
  });
});

describe('modo mánager: ni dimitir ni esperar', () => {
  beforeEach(() => openSave(false));

  it('no se dimite ni se espera', () => {
    expect(() => career.resign()).toThrow(NotInCareerModeError);
    expect(() => career.wait()).toThrow(NotInCareerModeError);
  });
});

describe('ofertas teniendo equipo', () => {
  beforeEach(() => openSave(true));

  /** Temporada cerrada y un club pequeño: el escenario en que llaman los grandes. */
  function summerAtASmallClub(): void {
    db.update(teamsTable).set({ reputation: 5 }).where(eq(teamsTable.id, MANAGED_TEAM)).run();
    db.update(seasonsTable).set({ stage: 'finished' }).run();
  }

  it('al cerrar la temporada, sólo llaman clubes claramente más grandes', () => {
    summerAtASmallClub();

    const status = career.getStatus();

    expect(status.offersWhileEmployed).toBe(true);
    expect(status.offers.length).toBeGreaterThan(0);
    for (const offer of status.offers) {
      expect(offer.reputation).toBeGreaterThan(5);
      expect(offer.teamId).not.toBe(MANAGED_TEAM);
    }
  });

  it('firmar con uno es dejar el tuyo: la etapa se cierra como marcha', () => {
    summerAtASmallClub();
    const oferta = career.getStatus().offers[0]!;

    const status = career.accept(oferta.teamId);

    expect(managedTeamId()).toBe(oferta.teamId);
    expect(status.spells).toHaveLength(2);
    expect(status.spells[0]!.endReason).toBe('left');
    expect(status.spells.find((spell) => spell.endSeason === null)?.teamId).toBe(oferta.teamId);
  });
});

describe('carrera con varios países jugándose', () => {
  beforeEach(() => openSave(true, ['GRE', 'LTU']));

  it('las ofertas pueden venir de cualquiera de ellos, y de ninguno más', () => {
    getDismissed();

    // La bolsa de la que salen: los clubes de liga de los tres países.
    const pool = new CareerRepository(db).clubsInCountries(
      new SeasonRepository(db).activeCountries()
    );
    expect(new Set(pool.map((row) => row.competition.country))).toEqual(
      new Set(['ESP', 'GRE', 'LTU'])
    );

    const allowed = new Set(['España', 'Grecia', 'Lituania']);
    for (const offer of career.getStatus().offers) {
      expect(allowed.has(offer.countryName), offer.teamName).toBe(true);
    }
  });

  it('firmar en el extranjero lleva la partida a esa liga, que ya tiene calendario', () => {
    getDismissed();
    const greek = db
      .select()
      .from(teamsTable)
      .where(eq(teamsTable.competitionId, 'grecia-1'))
      .all()[0]!;
    // La oferta se fuerza: lo que se comprueba es la llegada, no el mercado.
    db.update(careerSpellsTable).set({ endSeason: 1, endReason: 'dismissed' }).run();
    db.update(gameStateTable).set({ managedTeamId: greek.id }).run();
    db.update(boardTable).set({ dismissed: false, confidence: 60 }).run();

    const current = new SeasonService(() => db).getCurrent();
    expect(current.competitionId).toBe('grecia-1');
    expect(current.totalRounds).toBeGreaterThan(0);
  });
});
