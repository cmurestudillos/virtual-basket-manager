import { describe, expect, it } from 'vitest';
import {
  compareRanking,
  competitionStrength,
  rankingPoints,
  roundPoints,
  stintPoints,
  tierWeight,
  titlePoints,
  winPoints
} from '../coach-ranking';

/** Los puntos del ranking de entrenadores: lo que vale cada cosa, en orden. */

describe('lo que vale cada victoria', () => {
  it('playoffs más que liga, continental más que copa, primera más que segunda', () => {
    expect(winPoints('playoffs', 1, 1)).toBeGreaterThan(winPoints('league', 1, 1));
    expect(winPoints('continental', 1, 1)).toBeGreaterThan(winPoints('cup', 1, 1));
    expect(winPoints('league', 1, 1)).toBeGreaterThan(winPoints('league', 2, 1));
    expect(tierWeight(3)).toBeLessThan(tierWeight(2));
  });

  it('en una liga fuerte vale más, pero nunca el doble que en una floja', () => {
    expect(winPoints('league', 1, competitionStrength(80))).toBeGreaterThan(
      winPoints('league', 1, competitionStrength(40))
    );
    expect(competitionStrength(10)).toBe(0.6);
    expect(competitionStrength(100)).toBe(1.4);
  });

  it('la liga regular no tiene rondas; los títulos valen más que las rondas', () => {
    expect(roundPoints('league', 1, 1)).toBe(0);
    expect(titlePoints('league', 1, 1)).toBeGreaterThan(roundPoints('playoffs', 1, 1));
    expect(titlePoints('continental', 1, 1)).toBeGreaterThan(titlePoints('cup', 1, 1));
  });
});

describe('los puntos de un tramo y del ranking', () => {
  it('suma victorias, rondas y títulos, con un decimal', () => {
    const points = stintPoints({
      wins: Array.from({ length: 20 }, () => ({ kind: 'league' as const, tier: 1, strength: 1 })),
      rounds: [{ kind: 'playoffs', tier: 1, strength: 1 }],
      titles: [{ kind: 'league', tier: 1, strength: 1 }]
    });
    expect(points).toBe(20 + 3 + 12);
  });

  it('el curso actual cuenta entero y el anterior, la mitad', () => {
    expect(rankingPoints(30, 20)).toBe(40);
    expect(rankingPoints(0, 45)).toBe(22.5);
  });

  it('a igualdad de puntos manda la reputación, y después el id', () => {
    const a = { points: 10, reputation: 60, coachId: 'a' };
    const b = { points: 10, reputation: 70, coachId: 'b' };
    const c = { points: 12, reputation: 10, coachId: 'c' };
    expect([a, b, c].sort(compareRanking).map((row) => row.coachId)).toEqual(['c', 'b', 'a']);
  });
});
