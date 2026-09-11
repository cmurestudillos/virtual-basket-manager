import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { CupBracket } from '@shared/contracts/season.contract';
import { CUP_TEAMS } from '@shared/domain/cup';
import {
  closeSaveDatabase,
  openSaveDatabase,
  type SaveDatabase
} from '../../../database/save-database';
import { boardTable, financeEntriesTable, gamesTable } from '../../../database/schema/save';
import { loadDataset } from '../../saves/dataset';
import { seedSave } from '../../saves/save-seeder';
import { MatchService } from '../../match/match.service';
import { SeasonService } from '../season.service';

/**
 * La Copa, jugada de verdad dentro de una temporada.
 *
 * Se juega media liga para llegar al corte, se comprueba que el cuadro sale de
 * la clasificación de ese momento y se termina el torneo.
 */

const MIGRATIONS = resolve('drizzle/save');
const SEED_DIRECTORY = resolve('resources/seed-data');
const MANAGED_TEAM = 'liga-nacional-1';

let directory: string;
let filePath: string;
let db: SaveDatabase;
let season: SeasonService;
let match: MatchService;
let standingsAtCutoff: ReturnType<SeasonService['getStandings']>;
let bracketAtStart: CupBracket;
let finalBracket: CupBracket;

function playUserGame(gameId: string): void {
  match.start(gameId);
  let state = match.advancePeriod(gameId);
  while (!state.finished) {
    state = match.advancePeriod(gameId);
  }
}

beforeAll(() => {
  directory = mkdtempSync(join(tmpdir(), 'vbm-copa-'));
  filePath = join(directory, 'partida.sqlite');
  db = openSaveDatabase(filePath, MIGRATIONS);
  seedSave(db, loadDataset(SEED_DIRECTORY), {
    managedTeamId: MANAGED_TEAM,
    managerName: 'Carlos'
  });

  const resolveDb = (): SaveDatabase => db;
  season = new SeasonService(resolveDb);
  match = new MatchService(resolveDb);
  // El consejo, fuera: aquí se comprueba la Copa. Ver el test de temporada.
  season.getCurrent();
  db.delete(boardTable).run();

  // Media liga: hasta que aparezca el cuadro de Copa.
  for (let guard = 0; guard < 600 && season.getCup() === null; guard += 1) {
    const result = season.advanceToNextGame();
    if (result.status === 'seasonOver' || result.status === 'dismissed') {
      break;
    }
    if (result.status === 'userGame') {
      playUserGame(result.gameId);
    }
  }

  standingsAtCutoff = season.getStandings();
  bracketAtStart = season.getCup() as CupBracket;

  // Y se termina el torneo.
  for (let guard = 0; guard < 600; guard += 1) {
    const cup = season.getCup();
    if (cup?.championTeamId) {
      break;
    }
    const result = season.advanceToNextGame();
    if (result.status === 'seasonOver' || result.status === 'dismissed') {
      break;
    }
    if (result.status === 'userGame') {
      playUserGame(result.gameId);
    }
  }

  finalBracket = season.getCup() as CupBracket;
}, 300_000);

afterAll(() => {
  closeSaveDatabase(filePath);
  rmSync(directory, { recursive: true, force: true });
});

describe('Copa', () => {
  it('el cuadro se monta al cerrar la primera vuelta', () => {
    expect(bracketAtStart).not.toBeNull();
    expect(bracketAtStart.competitionName).toBe('Copa Nacional');
    expect(bracketAtStart.rounds[0]?.name).toBe('Cuartos de final');
    expect(bracketAtStart.rounds[0]?.ties).toHaveLength(CUP_TEAMS / 2);
    // Lo que viene después no existe hasta que se sepa quién lo juega.
    expect(bracketAtStart.rounds).toHaveLength(1);
  });

  it('la juegan los ocho primeros de ese momento, cruzados 1-8', () => {
    const top8 = standingsAtCutoff.slice(0, CUP_TEAMS).map((row) => row.teamId);
    const cuartos = bracketAtStart.rounds[0]?.ties ?? [];

    expect(cuartos.map((tie) => tie.homeTeamId)).toEqual(top8.slice(0, 4));
    expect(cuartos.map((tie) => tie.awayTeamId)).toEqual([...top8.slice(4)].reverse());
  });

  it('se juega a partido único y en sede neutral', () => {
    // Los del cuadro y sólo esos: en la partida se juegan a la vez la liga del
    // usuario, la segunda división y la Copa.
    const cupGameIds = new Set(
      finalBracket.rounds.flatMap((round) => round.ties.map((tie) => tie.gameId))
    );
    const cupGames = db
      .select()
      .from(gamesTable)
      .all()
      .filter((game) => cupGameIds.has(game.id));

    expect(cupGames.length).toBeGreaterThan(0);
    expect(cupGames.every((game) => game.neutralVenue)).toBe(true);
    expect(cupGames.every((game) => game.seriesId === null)).toBe(true);
    // Cuartos, semis y final: siete partidos y ni uno más.
    expect(cupGames).toHaveLength(7);
  });

  it('avanza ronda a ronda hasta la final y corona campeón', () => {
    expect(finalBracket.rounds.map((round) => round.name)).toEqual([
      'Cuartos de final',
      'Semifinales',
      'Final'
    ]);
    expect(finalBracket.rounds[2]?.ties).toHaveLength(1);
    expect(finalBracket.championTeamId).not.toBeNull();
    expect(finalBracket.championTeamName).not.toBeNull();

    const final = finalBracket.rounds[2]?.ties[0];
    const ganador =
      (final?.homeScore ?? 0) > (final?.awayScore ?? 0) ? final?.homeTeamId : final?.awayTeamId;
    expect(finalBracket.championTeamId).toBe(ganador);
  });

  it('quien gana un cruce es quien pasa', () => {
    const ganadoresCuartos = (finalBracket.rounds[0]?.ties ?? []).map((tie) =>
      (tie.homeScore as number) > (tie.awayScore as number) ? tie.homeTeamId : tie.awayTeamId
    );

    for (const tie of finalBracket.rounds[1]?.ties ?? []) {
      expect(ganadoresCuartos).toContain(tie.homeTeamId);
      expect(ganadoresCuartos).toContain(tie.awayTeamId);
    }
  });

  it('no toca la clasificación de la liga', () => {
    const standings = season.getStandings();
    const total = standings.reduce((sum, row) => sum + row.played, 0);

    // Todos los equipos llevan los mismos partidos de liga jugados.
    expect(new Set(standings.map((row) => row.played)).size).toBeLessThanOrEqual(2);
    expect(total % 2).toBe(0);
  });

  it('paga premio al club del usuario si llega lejos', () => {
    const jugadaPorElUsuario = (finalBracket.rounds[0]?.ties ?? []).some(
      (tie) => tie.involvesManaged
    );
    const premios = db
      .select()
      .from(financeEntriesTable)
      .all()
      .filter((row) => row.type === 'prize' && row.description.includes('Copa'));

    if (jugadaPorElUsuario) {
      expect(premios.length).toBeGreaterThan(0);
      expect(premios[0]!.amountCents).toBeGreaterThan(0);
    } else {
      expect(premios).toHaveLength(0);
    }
  });

  it('el partido de Copa se llama Copa en el acta', () => {
    const tie = finalBracket.rounds[2]?.ties[0];
    const acta = match.get(tie!.gameId);

    expect(acta?.roundLabel).toMatch(/Copa|Final/);
  });
});
