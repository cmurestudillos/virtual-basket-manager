import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  closeSaveDatabase,
  openSaveDatabase,
  type SaveDatabase
} from '../../../database/save-database';
import { boardTable, careerSpellsTable, gameStateTable } from '../../../database/schema/save';
import { loadDataset } from '../../saves/dataset';
import { seedSave } from '../../saves/save-seeder';
import { BoardService } from '../../club/board.service';
import { SeasonService } from '../../season/season.service';
import { CareerService, NotInCareerModeError, OfferNotAvailableError } from '../career.service';

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

function openSave(careerMode: boolean): void {
  directory = mkdtempSync(join(tmpdir(), 'vbm-career-'));
  filePath = join(directory, 'partida.sqlite');
  db = openSaveDatabase(filePath, MIGRATIONS);
  seedSave(db, loadDataset(SEED_DIRECTORY), {
    managedTeamId: MANAGED_TEAM,
    managerName: 'Carlos',
    careerMode
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

  it('teniendo equipo no se puede firmar por otro: esto no es dimitir', () => {
    const otro = 'liga-nacional-4';

    expect(() => career.accept(otro)).toThrow(NotInCareerModeError);
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
