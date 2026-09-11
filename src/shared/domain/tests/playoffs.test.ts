import { describe, expect, it } from 'vitest';
import {
  buildPlayoffFormat,
  firstRoundPairings,
  homeAdvantagePattern,
  nextRoundPairings,
  playoffRoundName,
  seriesWinner,
  seriesWins,
  winsNeeded,
  type SeriesGameResult,
  type SeriesPairing
} from '../playoffs';

const SEEDS = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];

function game(homeTeamId: string, awayTeamId: string, homeScore: number): SeriesGameResult {
  return { homeTeamId, awayTeamId, homeScore, awayScore: 80 };
}

describe('buildPlayoffFormat', () => {
  it('monta el cuadro ACB: cuartos al mejor de 3, semis y final al mejor de 5', () => {
    const format = buildPlayoffFormat(8, 5);

    expect(format.map((round) => round.name)).toEqual(['Cuartos de final', 'Semifinales', 'Final']);
    expect(format.map((round) => round.bestOf)).toEqual([3, 5, 5]);
    expect(format.map((round) => round.teams)).toEqual([8, 4, 2]);
  });

  it('una final a partido único también es un cuadro válido', () => {
    expect(buildPlayoffFormat(2, 1)).toEqual([{ round: 1, name: 'Final', bestOf: 1, teams: 2 }]);
  });

  it('rechaza un número de equipos que no sea potencia de dos', () => {
    expect(() => buildPlayoffFormat(6, 5)).toThrow(/potencia de dos/);
    expect(() => buildPlayoffFormat(0, 5)).toThrow(/potencia de dos/);
  });

  it('pone nombre a las rondas por equipos que quedan', () => {
    expect(playoffRoundName(16)).toBe('Octavos de final');
    expect(playoffRoundName(2)).toBe('Final');
  });
});

describe('firstRoundPairings', () => {
  it('cruza 1-8, 2-7, 3-6 y 4-5', () => {
    const pairings = firstRoundPairings(SEEDS);

    expect(pairings).toHaveLength(4);
    expect(pairings.map((pairing) => [pairing.higherSeed, pairing.lowerSeed])).toEqual([
      [1, 8],
      [2, 7],
      [3, 6],
      [4, 5]
    ]);
    expect(pairings[0]?.higherSeedTeamId).toBe('a');
    expect(pairings[0]?.lowerSeedTeamId).toBe('h');
  });
});

describe('nextRoundPairings', () => {
  it('el cuadro es fijo: el 1-8 se cruza con el 4-5, no se reordena', () => {
    // Ganan el 1, el 7, el 3 y el 4: el cruce sigue siendo por posición de cuadro.
    const pairings = nextRoundPairings([
      { teamId: 'a', seed: 1 },
      { teamId: 'g', seed: 7 },
      { teamId: 'c', seed: 3 },
      { teamId: 'd', seed: 4 }
    ]);

    expect(pairings).toHaveLength(2);
    expect(pairings[0]).toEqual({
      higherSeedTeamId: 'a',
      higherSeed: 1,
      lowerSeedTeamId: 'd',
      lowerSeed: 4
    });
    expect(pairings[1]).toEqual({
      higherSeedTeamId: 'c',
      higherSeed: 3,
      lowerSeedTeamId: 'g',
      lowerSeed: 7
    });
  });
});

describe('homeAdvantagePattern', () => {
  it('al mejor de 3 es 2-1 y al mejor de 5, 2-2-1', () => {
    expect(homeAdvantagePattern(3)).toEqual(['higher', 'lower', 'higher']);
    expect(homeAdvantagePattern(5)).toEqual(['higher', 'higher', 'lower', 'lower', 'higher']);
  });

  it('el mejor clasificado siempre abre y cierra en casa', () => {
    for (const bestOf of [1, 3, 5, 7, 9]) {
      const pattern = homeAdvantagePattern(bestOf);
      expect(pattern).toHaveLength(bestOf);
      expect(pattern[0]).toBe('higher');
      expect(pattern[pattern.length - 1]).toBe('higher');
    }
  });

  it('reparte los partidos en casa de forma razonable', () => {
    const pattern = homeAdvantagePattern(5);
    expect(pattern.filter((host) => host === 'higher')).toHaveLength(3);
  });
});

describe('seriesWins y seriesWinner', () => {
  const pairing: SeriesPairing = {
    higherSeedTeamId: 'a',
    higherSeed: 1,
    lowerSeedTeamId: 'h',
    lowerSeed: 8
  };

  it('cuenta las victorias de cada lado juegue quien juegue en casa', () => {
    const games = [game('a', 'h', 90), game('h', 'a', 95), game('a', 'h', 70)];

    expect(seriesWins(pairing, games)).toEqual({ higher: 1, lower: 2 });
  });

  it('no hay ganador mientras no se llegue a las victorias necesarias', () => {
    expect(winsNeeded(3)).toBe(2);
    expect(winsNeeded(5)).toBe(3);
    expect(seriesWinner(pairing, [game('a', 'h', 90)], 3)).toBeNull();
  });

  it('declara ganador al llegar al tope de victorias', () => {
    const games = [game('a', 'h', 90), game('h', 'a', 60)];

    expect(seriesWinner(pairing, games, 3)).toBe('a');
  });

  it('una serie sin jugar no tiene ganador', () => {
    expect(seriesWinner(pairing, [], 5)).toBeNull();
    expect(seriesWins(pairing, [])).toEqual({ higher: 0, lower: 0 });
  });
});
