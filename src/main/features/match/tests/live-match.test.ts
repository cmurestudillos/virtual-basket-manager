import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  closeSaveDatabase,
  openSaveDatabase,
  type SaveDatabase
} from '../../../database/save-database';
import { gamesTable, playersTable } from '../../../database/schema/save';
import { loadDataset } from '../../saves/dataset';
import { seedSave } from '../../saves/save-seeder';
import { SeasonService } from '../../season/season.service';
import { MatchService } from '../match.service';

/**
 * El partido en vivo contra la base de datos de verdad.
 *
 * Lo que se comprueba aquí no es el motor —de eso va `live-game.test.ts`— sino
 * que verlo posesión a posesión deja la partida como la dejaría verlo cuarto a
 * cuarto: acta guardada, piernas gastadas y retransmisión escrita una sola vez.
 */

const MIGRATIONS = resolve('drizzle/save');
const SEED_DIRECTORY = resolve('resources/seed-data');
const MANAGED_TEAM = 'liga-nacional-1';

let directory: string;
let filePath: string;
let db: SaveDatabase;
let season: SeasonService;
let match: MatchService;
let gameId: string;

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'vbm-live-'));
  filePath = join(directory, 'partida.sqlite');
  db = openSaveDatabase(filePath, MIGRATIONS);
  seedSave(db, loadDataset(SEED_DIRECTORY), {
    managedTeamId: MANAGED_TEAM,
    managerName: 'Carlos'
  });

  const resolveDb = (): SaveDatabase => db;
  season = new SeasonService(resolveDb);
  match = new MatchService(resolveDb);
  gameId = season.getNextGame()!.gameId;
});

afterEach(() => {
  closeSaveDatabase(filePath);
  rmSync(directory, { recursive: true, force: true });
});

/** Juega el partido entero a posesiones y devuelve todo lo que llegó. */
function playLive(): {
  ticks: ReturnType<MatchService['advancePossession']>[];
  possessions: number;
} {
  const ticks: ReturnType<MatchService['advancePossession']>[] = [];
  for (let guard = 0; guard < 600; guard += 1) {
    const tick = match.advancePossession(gameId);
    ticks.push(tick);
    if (tick.finished) {
      break;
    }
  }
  return { ticks, possessions: ticks.length };
}

describe('ver el partido en vivo', () => {
  it('lo juega entero y lo deja guardado como cualquier otro', () => {
    match.start(gameId);
    const { ticks } = playLive();
    const last = ticks.at(-1)!;

    expect(last.finished).toBe(true);
    expect(last.homeScore).toBeGreaterThan(40);
    expect(last.awayScore).toBeGreaterThan(40);
    expect(last.homeScore).not.toBe(last.awayScore);

    // En la base de datos queda un partido jugado, no uno a medias.
    const row = db
      .select()
      .from(gamesTable)
      .all()
      .find((game) => game.id === gameId)!;
    expect(row.homeScore).toBe(last.homeScore);
    expect(row.awayScore).toBe(last.awayScore);
    expect(row.playByPlay).not.toBeNull();

    // Y el acta se lee como la de cualquier partido archivado.
    const acta = match.get(gameId)!;
    expect(acta.finished).toBe(true);
    expect(acta.home.score).toBe(last.homeScore);
    expect(acta.playByPlay).not.toBeNull();
  });

  it('cada jugada llega una sola vez y en orden', () => {
    match.start(gameId);
    const { ticks } = playLive();

    const lines = ticks.flatMap((tick) => tick.lines);
    const acta = match.get(gameId)!;
    // Lo que se vio en directo es exactamente la retransmisión guardada.
    expect(lines.map((line) => line.text)).toEqual(acta.playByPlay!.map((line) => line.text));

    // El reloj de cada cuarto sólo va hacia abajo.
    for (const tick of ticks) {
      const delCuarto = tick.lines.filter((line) => line.period === tick.period);
      const relojes = delCuarto.map((line) => line.clockSeconds);
      expect([...relojes].sort((a, b) => b - a)).toEqual(relojes);
    }
  });

  it('el reloj baja posesión a posesión y los cuartos se cierran de uno en uno', () => {
    match.start(gameId);
    const { ticks } = playLive();

    const cierres = ticks.filter((tick) => tick.periodEnded);
    expect(cierres.length).toBeGreaterThanOrEqual(4);
    expect(cierres.at(-1)!.finished).toBe(true);

    // Dentro de un mismo cuarto, el reloj nunca sube.
    const primerCuarto = ticks.filter((tick) => tick.period === 1);
    for (let i = 1; i < primerCuarto.length; i += 1) {
      expect(primerCuarto[i]!.clockSeconds).toBeLessThanOrEqual(primerCuarto[i - 1]!.clockSeconds);
    }
  });

  it('el partido deja las piernas tocadas, igual que jugándolo por cuartos', () => {
    match.start(gameId);
    const antes = db
      .select()
      .from(playersTable)
      .all()
      .filter((row) => row.teamId === MANAGED_TEAM);
    expect(antes.every((row) => row.condition === 100)).toBe(true);

    playLive();

    const despues = db
      .select()
      .from(playersTable)
      .all()
      .filter((row) => row.teamId === MANAGED_TEAM);
    expect(despues.some((row) => row.condition < 100)).toBe(true);
  });
});

describe('el banquillo, en vivo', () => {
  it('enseña quién está en pista, con sus faltas y sus piernas', () => {
    match.start(gameId);
    const tick = match.advancePossession(gameId);

    expect(tick.bench).not.toBeNull();
    const bench = tick.bench!;
    expect(bench.filter((player) => player.onCourt)).toHaveLength(5);
    expect(bench.every((player) => player.playerName.length > 0)).toBe(true);
    // Los de pista salen primero: es el orden en que se mira un banquillo.
    expect(bench.slice(0, 5).every((player) => player.onCourt)).toBe(true);
    expect(tick.timeoutsLeft).toBeGreaterThan(0);
    expect(tick.autoRotation).toBe(true);
  });

  it('un cambio ordenado mete al suplente y le quita la rotación al motor', () => {
    match.start(gameId);
    const tick = match.advancePossession(gameId);
    const sale = tick.bench!.find((player) => player.onCourt)!;
    const entra = tick.bench!.find((player) => !player.onCourt)!;

    const orden = match.substitute(gameId, sale.playerId, entra.playerId);

    expect(orden.ok).toBe(true);
    expect(orden.reason).toBeNull();
    const bench = orden.tick!.bench!;
    expect(bench.find((p) => p.playerId === entra.playerId)!.onCourt).toBe(true);
    expect(bench.find((p) => p.playerId === sale.playerId)!.onCourt).toBe(false);
    expect(orden.tick!.autoRotation).toBe(false);
  });

  it('el «no» llega con su motivo y no toca nada', () => {
    match.start(gameId);
    const tick = match.advancePossession(gameId);
    const enPista = tick.bench!.filter((player) => player.onCourt);

    const orden = match.substitute(gameId, enPista[0]!.playerId, enPista[1]!.playerId);

    expect(orden.ok).toBe(false);
    expect(orden.reason).toContain('ya está en pista');
    expect(orden.tick!.bench!.find((p) => p.playerId === enPista[1]!.playerId)!.onCourt).toBe(true);
  });

  it('el tiempo muerto se gasta, se cuenta y queda en la retransmisión', () => {
    match.start(gameId);
    const primero = match.advancePossession(gameId);
    const quedaban = primero.timeoutsLeft;

    const orden = match.callTimeout(gameId);

    expect(orden.ok).toBe(true);
    expect(orden.tick!.timeoutsLeft).toBe(quedaban - 1);
    // El rival no gasta el suyo porque lo pidas tú.
    expect(orden.tick!.rivalTimeoutsLeft).toBe(quedaban);
    // La línea llega con la propia orden: la pantalla la canta al pedirlo, no
    // una posesión más tarde.
    expect(orden.tick!.lines.some((line) => line.kind === 'timeout')).toBe(true);

    // Y no se repite en lo que venga después.
    const siguiente = match.advancePossession(gameId);
    expect(siguiente.lines.some((line) => line.kind === 'timeout')).toBe(false);
  });

  it('la pizarra se toca sin parar el partido, y lo que no existe se descarta', () => {
    match.start(gameId);
    match.advancePossession(gameId);

    expect(match.setLiveTactics(gameId, { defensiveSystem: 'zone23', pace: 9 }).ok).toBe(true);
    // Un sistema inventado no revienta nada: se ignora.
    expect(match.setLiveTactics(gameId, { defensiveSystem: 'el-cerrojo' }).ok).toBe(true);
    // Y el partido sigue jugándose.
    expect(match.advancePossession(gameId).finished).toBe(false);
  });

  it('se le puede devolver la rotación al motor', () => {
    match.start(gameId);
    const tick = match.advancePossession(gameId);
    match.substitute(
      gameId,
      tick.bench!.find((p) => p.onCourt)!.playerId,
      tick.bench!.find((p) => !p.onCourt)!.playerId
    );

    const orden = match.setAutoRotation(gameId, true);

    expect(orden.ok).toBe(true);
    expect(orden.tick!.autoRotation).toBe(true);
  });

  it('nadie dirige el banquillo de un partido que no es suyo', () => {
    const ajeno = db
      .select()
      .from(gamesTable)
      .all()
      .find((game) => game.homeTeamId !== MANAGED_TEAM && game.awayTeamId !== MANAGED_TEAM)!;

    const orden = match.callTimeout(ajeno.id);

    expect(orden.ok).toBe(false);
    expect(orden.reason).toBe('Este partido no es tuyo');
  });
});
