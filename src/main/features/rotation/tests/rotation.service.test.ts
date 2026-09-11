import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { SaveRotationRequest, TeamRotation } from '@shared/contracts/rotation.contract';
import { POSITIONS } from '@shared/domain/positions';
import { LINEUP_SIZE, REGULATION_TEAM_MINUTES } from '@shared/domain/rotation';
import {
  closeSaveDatabase,
  openSaveDatabase,
  type SaveDatabase
} from '../../../database/save-database';
import { loadDataset } from '../../saves/dataset';
import { seedSave } from '../../saves/save-seeder';
import { MatchService } from '../../match/match.service';
import { SeasonService } from '../../season/season.service';
import { RotationService } from '../rotation.service';

/**
 * Rotación contra SQLite de verdad, incluido el viaje completo hasta el motor:
 * lo que de verdad importa de esta pantalla no es que guarde, es que el partido
 * salga distinto después de tocarla.
 */

const MIGRATIONS = resolve('drizzle/save');
const SEED_DIRECTORY = resolve('resources/seed-data');
const MANAGED_TEAM = 'liga-nacional-1';
const RIVAL_TEAM = 'liga-nacional-2';

let directory: string;
let filePath: string;
let db: SaveDatabase;
let rotation: RotationService;

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'vbm-rotation-'));
  filePath = join(directory, 'partida.sqlite');
  db = openSaveDatabase(filePath, MIGRATIONS);
  seedSave(db, loadDataset(SEED_DIRECTORY), {
    managedTeamId: MANAGED_TEAM,
    managerName: 'Carlos'
  });

  rotation = new RotationService(() => db);
});

afterEach(() => {
  closeSaveDatabase(filePath);
  rmSync(directory, { recursive: true, force: true });
});

/** Convierte una rotación en la petición que mandaría el editor. */
function toRequest(current: TeamRotation): SaveRotationRequest {
  return {
    teamId: current.teamId,
    slots: current.slots.map((slot) => ({
      playerId: slot.playerId,
      depth: slot.depth,
      slotPosition: slot.slotPosition,
      targetMinutes: slot.targetMinutes
    }))
  };
}

describe('RotationService', () => {
  it('devuelve la plantilla entera con el quinteto sembrado al crear la partida', () => {
    const current = rotation.get(MANAGED_TEAM);

    expect(current.teamId).toBe(MANAGED_TEAM);
    expect(current.isManaged).toBe(true);
    expect(current.slots.length).toBeGreaterThanOrEqual(12);
    expect(current.slots.slice(0, LINEUP_SIZE).map((slot) => slot.slotPosition)).toEqual([
      ...POSITIONS
    ]);
    expect(current.slots.every((slot) => slot.isStarter === slot.depth < LINEUP_SIZE)).toBe(true);
    expect(current.totalTargetMinutes).toBe(REGULATION_TEAM_MINUTES);
  });

  it('guarda un cambio de titular y lo devuelve ya aplicado', () => {
    const before = rotation.get(MANAGED_TEAM);
    const pivot = before.slots[4];
    const suplente = before.slots[7];

    const request = toRequest(before);
    // El suplente pasa a jugar de pívot y el titular se va al banquillo.
    request.slots[4] = { ...request.slots[4]!, playerId: suplente!.playerId };
    request.slots[7] = { ...request.slots[7]!, playerId: pivot!.playerId };

    const saved = rotation.save(request);

    expect(saved.slots[4]?.playerId).toBe(suplente?.playerId);
    expect(saved.slots[4]?.slotPosition).toBe('C');
    expect(rotation.get(MANAGED_TEAM).slots[4]?.playerId).toBe(suplente?.playerId);
  });

  it('avisa de quién juega fuera de su sitio', () => {
    const before = rotation.get(MANAGED_TEAM);
    const base = before.slots[0];
    const pivot = before.slots[4];

    const request = toRequest(before);
    request.slots[0] = { ...request.slots[0]!, playerId: pivot!.playerId };
    request.slots[4] = { ...request.slots[4]!, playerId: base!.playerId };

    const saved = rotation.save(request);

    expect(saved.slots[0]?.positionFit).toBeLessThan(100);
    expect(saved.slots[0]?.position).toBe('C');
    expect(saved.slots[0]?.slotPosition).toBe('PG');
  });

  it('rechaza un quinteto que no cubre las cinco posiciones', () => {
    const request = toRequest(rotation.get(MANAGED_TEAM));
    request.slots[1] = { ...request.slots[1]!, slotPosition: 'PG' };

    expect(() => rotation.save(request)).toThrow(/cinco posiciones/);
  });

  it('rechaza al mismo jugador dos veces', () => {
    const request = toRequest(rotation.get(MANAGED_TEAM));
    request.slots[1] = { ...request.slots[1]!, playerId: request.slots[0]!.playerId };

    expect(() => rotation.save(request)).toThrow(/dos veces/);
  });

  it('rechaza a un jugador que no es de la plantilla', () => {
    const request = toRequest(rotation.get(MANAGED_TEAM));
    request.slots[0] = { ...request.slots[0]!, playerId: 'player-de-otro-equipo' };

    expect(() => rotation.save(request)).toThrow(/no está en la plantilla/);
  });

  it('no deja tocar la rotación de un rival, aunque sí mirarla', () => {
    const rival = rotation.get(RIVAL_TEAM);
    expect(rival.isManaged).toBe(false);

    expect(() => rotation.save(toRequest(rival))).toThrow(/no lo dirige el usuario/);
    expect(() => rotation.auto(RIVAL_TEAM)).toThrow(/no lo dirige el usuario/);
  });

  it('un equipo que no existe no devuelve una rotación vacía: falla', () => {
    expect(() => rotation.get('team-inventado')).toThrow(/No existe el equipo/);
  });

  it('la rotación automática devuelve el reparto de 200 minutos', () => {
    const manual = toRequest(rotation.get(MANAGED_TEAM));
    manual.slots = manual.slots.map((slot) => ({ ...slot, targetMinutes: 0 }));
    rotation.save(manual);
    expect(rotation.get(MANAGED_TEAM).totalTargetMinutes).toBe(0);

    expect(rotation.auto(MANAGED_TEAM).totalTargetMinutes).toBe(REGULATION_TEAM_MINUTES);
  });

  it('los minutos objetivo llegan al motor: el que más pide es el que más juega', () => {
    const before = rotation.get(MANAGED_TEAM);
    const ultimo = before.slots[before.slots.length - 1] as (typeof before.slots)[number];

    const request = toRequest(before);
    request.slots = request.slots.map((slot) => ({
      ...slot,
      targetMinutes: slot.playerId === ultimo.playerId ? 40 : 16
    }));
    rotation.save(request);

    const season = new SeasonService(() => db);
    const match = new MatchService(() => db);
    const next = season.getNextGame();
    expect(next).not.toBeNull();

    match.start(next!.gameId);
    let state = match.advancePeriod(next!.gameId);
    while (!state.finished) {
      state = match.advancePeriod(next!.gameId);
    }

    const side = state.managedSide === 'home' ? state.home : state.away;
    const masJugado = [...side.boxScores].sort((a, b) => b.secondsPlayed - a.secondsPlayed)[0];

    expect(masJugado?.playerId).toBe(ultimo.playerId);
  });
});
