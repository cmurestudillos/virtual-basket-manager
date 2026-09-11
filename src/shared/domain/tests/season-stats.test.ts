import { describe, expect, it } from 'vitest';
import { emptyPlayerBoxScore, type PlayerBoxScore } from '../box-score';
import {
  accumulateSeason,
  categoryAverage,
  categoryTotal,
  minimumGamesForLeaders,
  perGame,
  rankLeaders,
  type SeasonTotals
} from '../season-stats';

function line(playerId: string, overrides: Partial<PlayerBoxScore> = {}): PlayerBoxScore {
  return { ...emptyPlayerBoxScore(playerId), secondsPlayed: 1200, ...overrides };
}

function totalsOf(playerId: string, games: number, box: Partial<PlayerBoxScore>): SeasonTotals {
  return { playerId, games, box: { ...emptyPlayerBoxScore(playerId), ...box } };
}

describe('accumulateSeason', () => {
  it('suma las actas de cada jugador', () => {
    const totals = accumulateSeason([
      line('a', { twoPointMade: 4, assists: 3 }),
      line('a', { twoPointMade: 2, assists: 1 }),
      line('b', { threePointMade: 5 })
    ]);

    const a = totals.find((entry) => entry.playerId === 'a');
    expect(a?.games).toBe(2);
    expect(a?.box.twoPointMade).toBe(6);
    expect(a?.box.assists).toBe(4);
    expect(totals).toHaveLength(2);
  });

  it('un acta sin minutos no cuenta como partido jugado', () => {
    const totals = accumulateSeason([
      line('a', { secondsPlayed: 0 }),
      line('a', { secondsPlayed: 600, twoPointMade: 3 })
    ]);

    expect(totals[0]?.games).toBe(1);
    expect(totals[0]?.box.twoPointMade).toBe(3);
  });

  it('sin actas no hay nada que sumar', () => {
    expect(accumulateSeason([])).toEqual([]);
  });
});

describe('perGame', () => {
  it('redondea a un decimal', () => {
    expect(perGame(50, 3)).toBe(16.7);
  });

  it('sin partidos devuelve cero y no NaN', () => {
    expect(perGame(20, 0)).toBe(0);
  });
});

describe('categoryTotal', () => {
  const box = {
    ...emptyPlayerBoxScore('a'),
    twoPointMade: 5,
    twoPointAttempted: 10,
    threePointMade: 2,
    threePointAttempted: 4,
    freeThrowMade: 1,
    freeThrowAttempted: 2,
    offensiveRebounds: 3,
    defensiveRebounds: 4,
    assists: 6,
    steals: 2,
    blocks: 1,
    secondsPlayed: 1800
  };

  it('calcula cada categoría desde el acta en crudo', () => {
    expect(categoryTotal(box, 'points')).toBe(17);
    expect(categoryTotal(box, 'rebounds')).toBe(7);
    expect(categoryTotal(box, 'assists')).toBe(6);
    expect(categoryTotal(box, 'steals')).toBe(2);
    expect(categoryTotal(box, 'blocks')).toBe(1);
    expect(categoryTotal(box, 'threePointMade')).toBe(2);
    expect(categoryTotal(box, 'minutes')).toBe(30);
    // 17 + 7 + 6 + 2 + 1 + 0 recibidas − (8 fallados + 0 pérdidas + 0 faltas)
    expect(categoryTotal(box, 'efficiency')).toBe(25);
  });

  it('la media es el total entre los partidos jugados', () => {
    expect(categoryAverage(totalsOf('a', 4, { twoPointMade: 20 }), 'points')).toBe(10);
  });
});

describe('minimumGamesForLeaders', () => {
  it('exige la mitad de los partidos de la liga', () => {
    expect(minimumGamesForLeaders(20)).toBe(10);
    expect(minimumGamesForLeaders(21)).toBe(11);
  });

  it('nunca baja de un partido, ni en la primera jornada', () => {
    expect(minimumGamesForLeaders(0)).toBe(1);
    expect(minimumGamesForLeaders(1)).toBe(1);
  });
});

describe('rankLeaders', () => {
  const entries = [
    totalsOf('regular', 10, { twoPointMade: 100 }), // 20 por partido
    totalsOf('estrella', 10, { twoPointMade: 150 }), // 30 por partido
    totalsOf('fugaz', 1, { twoPointMade: 30 }) // 60 por partido, pero un partido
  ];

  it('ordena por media y deja fuera a quien no llega al mínimo', () => {
    const leaders = rankLeaders(entries, 'points', { minimumGames: 5, limit: 10 });

    expect(leaders.map((entry) => entry.playerId)).toEqual(['estrella', 'regular']);
  });

  it('recorta al tope pedido', () => {
    expect(rankLeaders(entries, 'points', { minimumGames: 1, limit: 1 })).toHaveLength(1);
  });

  it('desempata por partidos jugados y deja el orden estable', () => {
    const empatados = [
      totalsOf('b', 5, { twoPointMade: 50 }),
      totalsOf('a', 8, { twoPointMade: 80 })
    ];

    expect(
      rankLeaders(empatados, 'points', { minimumGames: 1, limit: 10 }).map(
        (entry) => entry.playerId
      )
    ).toEqual(['a', 'b']);
  });
});
