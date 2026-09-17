import { describe, expect, it } from 'vitest';
import { ATTRIBUTE_KEYS, uniformAttributes } from '../../../src/shared/domain/attributes';
import {
  MIN_MINUTES_FOR_STATS,
  estimatedLevel,
  jitter,
  percentileOf,
  quantileOf,
  rateLeague,
  referenceFrom,
  shrink
} from '../lib/ratings';
import type { SourcePlayer, SourceStats } from '../lib/source-types';
import { positionFor } from '../lib/merge';

/** Estadísticas de temporada a partir de medias por partido, para leerlas fácil. */
function stats(perGame: {
  games?: number;
  minutes: number;
  points?: number;
  threes?: [number, number];
  twos?: [number, number];
  frees?: [number, number];
  oreb?: number;
  dreb?: number;
  assists?: number;
  steals?: number;
  blocks?: number;
  turnovers?: number;
  fouls?: number;
}): SourceStats {
  const games = perGame.games ?? 30;
  const total = (value = 0): number => Math.round(value * games);
  // Lo que no se dice va en proporción a los minutos: un jugador de seis minutos
  // no coge los mismos rebotes por partido que uno de veinte.
  const scale = perGame.minutes / 20;
  const [threeMade, threeTried] = perGame.threes ?? [1 * scale, 3 * scale];
  const [twoMade, twoTried] = perGame.twos ?? [2 * scale, 4 * scale];
  const [freeMade, freeTried] = perGame.frees ?? [1 * scale, 1.5 * scale];
  return {
    games,
    starts: null,
    seconds: Math.round(perGame.minutes * 60 * games),
    points: total(perGame.points ?? 10 * scale),
    twoPointMade: total(twoMade),
    twoPointAttempted: total(twoTried),
    threePointMade: total(threeMade),
    threePointAttempted: total(threeTried),
    freeThrowMade: total(freeMade),
    freeThrowAttempted: total(freeTried),
    offensiveRebounds: total(perGame.oreb ?? 1 * scale),
    defensiveRebounds: total(perGame.dreb ?? 2 * scale),
    assists: total(perGame.assists ?? 1.5 * scale),
    steals: total(perGame.steals ?? 0.7 * scale),
    turnovers: total(perGame.turnovers ?? 1 * scale),
    blocks: total(perGame.blocks ?? 0.2 * scale),
    blocksReceived: null,
    dunks: null,
    fouls: total(perGame.fouls ?? 2 * scale),
    foulsDrawn: null,
    rating: null
  };
}

function player(id: string, overrides: Partial<SourcePlayer> = {}): SourcePlayer {
  return {
    sourceId: id,
    firstName: 'Nombre',
    lastName: id,
    nickname: null,
    birthDate: '1998-05-10',
    age: null,
    nationality: 'ESP',
    nationalityRaw: 'España',
    position: 'SF',
    positionRaw: 'Alero',
    heightCm: 200,
    weightKg: null,
    shirtNumber: null,
    licence: null,
    stats: stats({ minutes: 20 }),
    ...overrides
  };
}

/** Una referencia ficticia con valores del 30 al 80 en todos los atributos. */
const reference = referenceFrom(
  Array.from({ length: 51 }, (_, index) => ({ attributes: uniformAttributes(30 + index) }))
);

describe('las cuentas de base', () => {
  it('percentil y cuantil son inversos y no se salen de la escala', () => {
    const sorted = [10, 20, 30, 40, 50];
    expect(percentileOf(sorted, 30)).toBeCloseTo(0.5);
    expect(percentileOf(sorted, 5)).toBe(0);
    expect(percentileOf(sorted, 99)).toBe(1);
    expect(quantileOf(sorted, 0)).toBe(10);
    expect(quantileOf(sorted, 1)).toBe(50);
    expect(quantileOf(sorted, 0.5)).toBe(30);
    expect(quantileOf(sorted, 2)).toBe(50);
  });

  it('con pocos minutos una estadística se acerca a la media, con muchos se la cree', () => {
    expect(shrink(1, 30, 0.35)).toBeLessThan(0.5);
    expect(shrink(1, 3000, 0.35)).toBeGreaterThan(0.9);
  });

  it('la variación es estable y está entre -1 y 1', () => {
    expect(jitter('abc')).toBe(jitter('abc'));
    expect(jitter('abc')).not.toBe(jitter('abd'));
    for (const seed of ['a', 'b', 'jugador-1:close', 'x'.repeat(40)]) {
      expect(Math.abs(jitter(seed))).toBeLessThanOrEqual(1);
    }
  });

  it('el puesto sale de la fuente o, si falta, de la altura', () => {
    expect(positionFor(player('a', { position: 'PG', heightCm: 215 }))).toBe('PG');
    expect(positionFor(player('b', { position: null, heightCm: 185 }))).toBe('PG');
    expect(positionFor(player('c', { position: null, heightCm: 212 }))).toBe('C');
    expect(positionFor(player('d', { position: null, heightCm: null }))).toBe('SF');
  });
});

describe('poner atributos a una liga', () => {
  const league: SourcePlayer[] = [
    player('estrella', {
      position: 'PG',
      stats: stats({
        minutes: 32,
        points: 20,
        assists: 7,
        steals: 1.5,
        threes: [2.5, 6],
        turnovers: 2.5
      })
    }),
    player('pivot', {
      position: 'C',
      heightCm: 212,
      stats: stats({
        minutes: 26,
        points: 13,
        oreb: 3,
        dreb: 6,
        blocks: 2,
        threes: [0, 0],
        twos: [5, 8]
      })
    }),
    player('tirador', {
      position: 'SG',
      stats: stats({ minutes: 24, points: 12, threes: [3, 7], assists: 1.5 })
    }),
    player('rotacion', { position: 'SF', stats: stats({ minutes: 15, points: 5 }) }),
    player('fondo', { position: 'PF', stats: stats({ minutes: 6, points: 1.5, games: 12 }) }),
    player('fichaje', { position: 'SF', stats: null, licence: 'EXT', age: 27 }),
    player('junior', { position: 'PG', stats: null, licence: 'JFL', birthDate: '2007-01-01' })
  ];
  const rated = rateLeague(league, reference, positionFor);
  const byId = new Map(rated.map((entry) => [entry.source.sourceId, entry]));
  const get = (id: string) => byId.get(id)!;

  it('pone los 21 atributos dentro de la escala de la liga de referencia', () => {
    expect(rated).toHaveLength(league.length);
    for (const entry of rated) {
      for (const key of ATTRIBUTE_KEYS) {
        expect(entry.attributes[key]).toBeGreaterThanOrEqual(30);
        expect(entry.attributes[key]).toBeLessThanOrEqual(80);
      }
    }
  });

  it('quien más juega y más produce sale con más media que el del fondo del banquillo', () => {
    expect(get('estrella').overall).toBeGreaterThan(get('rotacion').overall);
    expect(get('rotacion').overall).toBeGreaterThan(get('fondo').overall);
  });

  it('cada uno destaca en lo suyo', () => {
    expect(get('pivot').attributes.block).toBeGreaterThan(get('estrella').attributes.block);
    expect(get('pivot').attributes.offensiveRebound).toBeGreaterThan(
      get('tirador').attributes.offensiveRebound
    );
    expect(get('estrella').attributes.passing).toBeGreaterThan(get('pivot').attributes.passing);
    expect(get('tirador').attributes.threePoint).toBeGreaterThan(
      get('pivot').attributes.threePoint
    );
  });

  it('sin estadísticas se estima, y un extracomunitario llega con más nivel que un junior', () => {
    expect(get('fichaje').estimated).toBe(true);
    expect(get('junior').estimated).toBe(true);
    expect(get('estrella').estimated).toBe(false);
    expect(get('fichaje').level).toBeGreaterThan(get('junior').level);
  });

  it('quien apenas jugó cuenta como sin estadísticas', () => {
    const tiny = player('minutos-basura', {
      stats: stats({ minutes: (MIN_MINUTES_FOR_STATS - 10) / 3, games: 3 })
    });
    const [entry] = rateLeague([...league, tiny], reference, positionFor).slice(-1);
    expect(entry?.estimated).toBe(true);
  });

  it('es determinista: la misma liga da exactamente las mismas fichas', () => {
    const again = rateLeague(league, reference, positionFor);
    expect(again.map((entry) => entry.attributes)).toEqual(rated.map((entry) => entry.attributes));
  });

  it('con los mismos números, el del equipo de arriba sale con más nivel que el de abajo', () => {
    const twin = (id: string) =>
      player(id, { position: 'SF', stats: stats({ minutes: 20, points: 9 }) });
    const arriba = twin('gemelo-arriba');
    const abajo = twin('gemelo-abajo');
    const strength = new Map([
      [arriba, 1],
      [abajo, 0]
    ]);
    const entries = rateLeague(
      [...league, arriba, abajo],
      reference,
      positionFor,
      (entry) => strength.get(entry) ?? null
    );
    const find = (id: string) => entries.find((entry) => entry.source.sourceId === id)!;
    expect(find('gemelo-arriba').level).toBeGreaterThan(find('gemelo-abajo').level);
    expect(find('gemelo-arriba').overall).toBeGreaterThan(find('gemelo-abajo').overall);
  });

  it('el nivel estimado queda acotado', () => {
    for (const licence of ['EXT', 'COT', 'JFL', 'SI', null]) {
      const level = estimatedLevel(player(`l-${licence}`, { licence, stats: null }));
      expect(level).toBeGreaterThanOrEqual(0.08);
      expect(level).toBeLessThanOrEqual(0.85);
    }
  });
});
