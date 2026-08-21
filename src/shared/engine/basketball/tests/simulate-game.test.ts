import { describe, expect, it } from 'vitest';
import { points, type PlayerBoxScore } from '@shared/domain/box-score';
import { FIBA_RULESET, NBA_RULESET, regulationMinutes } from '@shared/domain/rulesets';
import { GameSimulation, simulateGame } from '../simulate-game';
import type { GameResult } from '../types';
import { buildTestTeam } from './test-teams';

function teamPoints(boxScores: readonly PlayerBoxScore[]): number {
  return boxScores.reduce((sum, line) => sum + points(line), 0);
}

function play(gameId: string, homeLevel = 60, awayLevel = 60): GameResult {
  return simulateGame({
    gameId,
    home: buildTestTeam('local', homeLevel),
    away: buildTestTeam('visitante', awayLevel),
    ruleset: FIBA_RULESET
  });
}

describe('simulateGame', () => {
  it('es determinista: la misma semilla da exactamente el mismo partido', () => {
    const first = play('partido-1');
    const second = play('partido-1');

    expect(second.home.score).toBe(first.home.score);
    expect(second.away.score).toBe(first.away.score);
    expect(second.events.length).toBe(first.events.length);
    expect(second.home.boxScores).toEqual(first.home.boxScores);
  });

  it('semillas distintas dan partidos distintos', () => {
    const results = ['a', 'b', 'c', 'd', 'e'].map((id) => play(`partido-${id}`));
    const marcadores = new Set(
      results.map((result) => `${result.home.score}-${result.away.score}`)
    );

    expect(marcadores.size).toBeGreaterThan(1);
  });

  it('el marcador coincide con la suma del acta', () => {
    const result = play('partido-acta');

    expect(teamPoints(result.home.boxScores)).toBe(result.home.score);
    expect(teamPoints(result.away.boxScores)).toBe(result.away.score);
  });

  it('produce marcadores en la horquilla FIBA con equipos de nivel medio', () => {
    const scores = Array.from({ length: 30 }, (_, index) => play(`horquilla-${index}`)).flatMap(
      (result) => [result.home.score, result.away.score]
    );
    const average = scores.reduce((sum, score) => sum + score, 0) / scores.length;

    expect(average).toBeGreaterThan(62);
    expect(average).toBeLessThan(100);
    expect(Math.min(...scores)).toBeGreaterThan(40);
  });

  it('nunca acaba en empate y contabiliza las prórrogas que juega', () => {
    for (let index = 0; index < 25; index += 1) {
      const result = play(`empate-${index}`);
      expect(result.home.score).not.toBe(result.away.score);
      expect(result.periods.length).toBe(FIBA_RULESET.periods + result.overtimes);
    }
  });

  it('reparte los minutos del partido entre los cinco puestos de pista', () => {
    const result = play('minutos');
    const totalSeconds = result.home.boxScores.reduce((sum, line) => sum + line.secondsPlayed, 0);
    const expected =
      (regulationMinutes(FIBA_RULESET) + result.overtimes * FIBA_RULESET.overtimeMinutes) * 60 * 5;

    expect(totalSeconds).toBe(expected);
  });

  it('jugar cuarto a cuarto da exactamente el mismo partido que simularlo entero', () => {
    // Es la invariante que sostiene todo el modo resultado: el partido del
    // usuario, que se juega a botonazos, y el del rival, que se resuelve de
    // una tacada, salen del mismo camino de código y del mismo azar.
    const input = {
      gameId: 'cuarto-a-cuarto',
      home: buildTestTeam('local', 62),
      away: buildTestTeam('visitante', 58),
      ruleset: FIBA_RULESET
    };

    const deUnaVez = simulateGame(input);

    const simulation = new GameSimulation(input);
    const parciales: number[] = [];
    while (!simulation.isFinished) {
      parciales.push(simulation.playPeriod().home);
    }
    const porCuartos = simulation.result;

    expect(porCuartos.home.score).toBe(deUnaVez.home.score);
    expect(porCuartos.away.score).toBe(deUnaVez.away.score);
    expect(porCuartos.periods).toEqual(deUnaVez.periods);
    expect(porCuartos.home.boxScores).toEqual(deUnaVez.home.boxScores);
    expect(parciales).toEqual(deUnaVez.periods.map((period) => period.home));
  });

  it('no inventa prórrogas si se pulsa avanzar con el partido acabado', () => {
    const simulation = new GameSimulation({
      gameId: 'boton-de-mas',
      home: buildTestTeam('local', 60),
      away: buildTestTeam('visitante', 55),
      ruleset: FIBA_RULESET
    });

    while (!simulation.isFinished) {
      simulation.playPeriod();
    }
    const alAcabar = simulation.result;

    simulation.playPeriod();
    simulation.playPeriod();

    expect(simulation.result.periods).toEqual(alAcabar.periods);
    expect(simulation.result.home.score).toBe(alAcabar.home.score);
  });

  it('rota el banquillo sin igualar los minutos de titulares y suplentes', () => {
    const result = play('rotacion');
    const minutes = result.home.boxScores.map((line) => line.secondsPlayed / 60);
    const titulares = minutes.slice(0, 5);
    const banquillo = minutes.slice(5);

    // Ningún titular juega el partido entero, y ninguno se queda en nada.
    for (const played of titulares) {
      expect(played).toBeGreaterThan(20);
      expect(played).toBeLessThan(36);
    }
    // El banquillo entra de verdad, pero claramente por detrás.
    expect(Math.max(...banquillo)).toBeGreaterThan(5);
    expect(Math.max(...banquillo)).toBeLessThan(Math.min(...titulares));
  });

  it('respeta el límite de faltas personales del reglamento', () => {
    for (let index = 0; index < 20; index += 1) {
      const result = play(`faltas-${index}`);
      for (const line of [...result.home.boxScores, ...result.away.boxScores]) {
        expect(line.fouls).toBeLessThanOrEqual(FIBA_RULESET.personalFoulLimit);
      }
    }
  });

  it('el mejor equipo gana la clara mayoría de los partidos', () => {
    let mejores = 0;
    for (let index = 0; index < 40; index += 1) {
      const result = simulateGame({
        gameId: `nivel-${index}`,
        home: buildTestTeam('fuerte', 78),
        away: buildTestTeam('flojo', 48),
        ruleset: FIBA_RULESET
      });
      if (result.home.score > result.away.score) {
        mejores += 1;
      }
    }

    expect(mejores).toBeGreaterThan(32);
  });

  it('el reglamento NBA produce más posesiones que el FIBA', () => {
    const fiba = play('reglamento-fiba');
    const nba = simulateGame({
      gameId: 'reglamento-fiba',
      home: buildTestTeam('local', 60),
      away: buildTestTeam('visitante', 60),
      ruleset: NBA_RULESET
    });

    expect(nba.home.score + nba.away.score).toBeGreaterThan(fiba.home.score + fiba.away.score);
  });

  it('el sistema exterior lanza muchos más triples que el interior', () => {
    const exterior = simulateGame({
      gameId: 'sistemas',
      home: buildTestTeam('local', 60, { offensiveSystem: 'outside' }),
      away: buildTestTeam('visitante', 60),
      ruleset: FIBA_RULESET
    });
    const interior = simulateGame({
      gameId: 'sistemas',
      home: buildTestTeam('local', 60, { offensiveSystem: 'inside' }),
      away: buildTestTeam('visitante', 60),
      ruleset: FIBA_RULESET
    });

    const triples = (result: GameResult): number =>
      result.home.boxScores.reduce((sum, line) => sum + line.threePointAttempted, 0);

    expect(triples(exterior)).toBeGreaterThan(triples(interior) * 1.4);
  });

  it('deja un registro de jugadas coherente con el marcador final', () => {
    const result = play('eventos');
    const last = result.events.at(-1);

    expect(result.events.length).toBeGreaterThan(100);
    expect(last?.type).toBe('periodEnd');
    expect(last?.homeScore).toBe(result.home.score);
    expect(last?.awayScore).toBe(result.away.score);
  });
});
