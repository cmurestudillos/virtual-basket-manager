import { describe, expect, it } from 'vitest';
import { createRng } from '@shared/engine/basketball/rng';
import {
  CONFERENCES,
  LOTTERY_DRAWS,
  NBA_SERIES_LENGTH,
  assignConferences,
  boardPlayoffRound,
  buildNbaPlayoffFormat,
  canSignUnderCap,
  conferenceOrder,
  conferenceSeeds,
  draftOrder,
  generateDraftProspect,
  luxuryTaxCents,
  luxuryTaxLineCents,
  minimumSalaryCents,
  nbaFirstRoundPairings,
  nbaNextRoundPairings,
  nbaZone,
  playInOpeners,
  rookieContractYears,
  rookieWageCents,
  salaryCapCents,
  type Conference
} from '../nba';

/** El formato NBA: conferencias, play-in, cuadro, draft y tope salarial. */

const TEAMS = Array.from({ length: 30 }, (_, index) => `usa-1-${index + 1}`);

describe('conferencias y divisiones', () => {
  it('quince por conferencia y cinco por división', () => {
    const map = assignConferences(TEAMS);
    for (const conference of CONFERENCES) {
      const members = [...map.values()].filter((row) => row.conference === conference);
      expect(members).toHaveLength(15);
      const divisions = new Map<string, number>();
      for (const row of members) {
        divisions.set(row.division, (divisions.get(row.division) ?? 0) + 1);
      }
      expect([...divisions.values()]).toEqual([5, 5, 5]);
    }
  });

  it('el reparto no depende del orden en que lleguen los equipos', () => {
    expect([...assignConferences([...TEAMS].reverse()).entries()].sort()).toEqual(
      [...assignConferences(TEAMS).entries()].sort()
    );
  });

  it('cada conferencia respeta el orden de la general', () => {
    const conferenceOf = new Map<string, Conference>(
      TEAMS.map((id, index) => [id, index % 2 === 0 ? 'east' : 'west'])
    );
    const order = conferenceOrder(TEAMS, conferenceOf);
    expect(order.east[0]).toBe('usa-1-1');
    expect(order.west[0]).toBe('usa-1-2');
    expect(order.east).toHaveLength(15);
  });

  it('seis directos, del séptimo al décimo al play-in', () => {
    expect(nbaZone(6)).toBe('playoffs');
    expect(nbaZone(7)).toBe('playIn');
    expect(nbaZone(10)).toBe('playIn');
    expect(nbaZone(11)).toBeNull();
  });
});

describe('play-in y playoffs', () => {
  const conference = Array.from({ length: 15 }, (_, index) => `e${index + 1}`);

  it('el play-in cruza 7-8 y 9-10', () => {
    const [first, second] = playInOpeners(conference);
    expect([first!.higherSeedTeamId, first!.lowerSeedTeamId]).toEqual(['e7', 'e8']);
    expect([second!.higherSeedTeamId, second!.lowerSeedTeamId]).toEqual(['e9', 'e10']);
    expect(conferenceSeeds(conference, 'e9', 'e7')).toEqual([
      'e1',
      'e2',
      'e3',
      'e4',
      'e5',
      'e6',
      'e9',
      'e7'
    ]);
  });

  it('primera ronda 1-8, 4-5, 3-6 y 2-7 en cada conferencia', () => {
    const west = Array.from({ length: 8 }, (_, index) => `w${index + 1}`);
    const pairings = nbaFirstRoundPairings(conference.slice(0, 8), west);
    expect(pairings.map((row) => `${row.higherSeedTeamId}-${row.lowerSeedTeamId}`)).toEqual([
      'e1-e8',
      'e4-e5',
      'e3-e6',
      'e2-e7',
      'w1-w8',
      'w4-w5',
      'w3-w6',
      'w2-w7'
    ]);
  });

  it('la ronda siguiente cruza vecinos y el factor cancha es del mejor récord', () => {
    const record = new Map([
      ['e1', 3],
      ['e4', 9],
      ['w1', 1],
      ['w2', 2]
    ]);
    const pairings = nbaNextRoundPairings(['e1', 'e4', 'w2', 'w1'], record);
    expect(pairings.map((row) => `${row.higherSeedTeamId}-${row.lowerSeedTeamId}`)).toEqual([
      'e1-e4',
      'w1-w2'
    ]);
  });

  it('todo al mejor de siete, con el play-in delante a partido único', () => {
    const format = buildNbaPlayoffFormat();
    expect(format[0]!.bestOf).toBe(1);
    expect(format.slice(1).every((round) => round.bestOf === NBA_SERIES_LENGTH)).toBe(true);
    expect(format.at(-1)!.name).toBe('Finales');
  });

  it('el consejo lee las rondas NBA en su escala', () => {
    expect([0, 1, 2, 3, 4].map(boardPlayoffRound)).toEqual([0, 1, 1, 2, 3]);
  });
});

describe('draft', () => {
  const lottery = Array.from({ length: 14 }, (_, index) => `l${index + 1}`);
  const playoff = Array.from({ length: 16 }, (_, index) => `p${index + 1}`);

  it('treinta elecciones por ronda; la lotería sólo mueve las cuatro primeras', () => {
    const order = draftOrder(lottery, playoff, createRng(3));

    expect(order.firstRound).toHaveLength(30);
    expect(new Set(order.firstRound).size).toBe(30);
    expect(order.lotteryWinners).toHaveLength(LOTTERY_DRAWS);
    // Los de playoffs no entran en el sorteo y cierran la ronda.
    expect(order.firstRound.slice(14)).toEqual(playoff);
    expect(order.secondRound).toEqual([...lottery, ...playoff]);
  });

  it('el peor nunca cae más allá del quinto', () => {
    for (let seed = 0; seed < 200; seed += 1) {
      const order = draftOrder(lottery, playoff, createRng(seed));
      expect(order.firstRound.indexOf('l1')).toBeLessThan(5);
    }
  });

  it('los peores ganan la lotería más a menudo que los mejores', () => {
    const wins = new Map<string, number>();
    for (let seed = 0; seed < 2000; seed += 1) {
      const first = draftOrder(lottery, playoff, createRng(seed)).firstRound[0] as string;
      wins.set(first, (wins.get(first) ?? 0) + 1);
    }
    expect(wins.get('l1') ?? 0).toBeGreaterThan(wins.get('l14') ?? 0);
    expect(wins.get('l1') ?? 0).toBeGreaterThan(150);
  });

  it('el número uno cobra más que el treinta, y la segunda ronda el mínimo', () => {
    const cap = 4_000_000_00;
    expect(rookieWageCents(1, cap)).toBeGreaterThan(rookieWageCents(30, cap));
    expect(rookieWageCents(45, cap)).toBe(minimumSalaryCents(cap));
    expect(rookieContractYears(12)).toBe(3);
    expect(rookieContractYears(40)).toBe(2);
  });
});

describe('la clase del draft', () => {
  it('los primeros de la clase son mejores que los últimos, y todos jóvenes', () => {
    const rng = createRng(11);
    const overall = (rank: number) => {
      const prospect = generateDraftProspect(rank, rng);
      expect(prospect.age).toBeGreaterThanOrEqual(19);
      expect(prospect.age).toBeLessThanOrEqual(22);
      expect(prospect.potential).toBeGreaterThanOrEqual(
        Math.min(...Object.values(prospect.attributes))
      );
      return Object.values(prospect.attributes).reduce((sum, value) => sum + value, 0) / 21;
    };
    const top = Array.from({ length: 20 }, () => overall(1));
    const bottom = Array.from({ length: 20 }, () => overall(80));
    const mean = (values: number[]) =>
      values.reduce((sum, value) => sum + value, 0) / values.length;
    expect(mean(top)).toBeGreaterThan(mean(bottom) + 10);
  });
});

describe('tope salarial', () => {
  const cap = salaryCapCents(4_097_659_00);

  it('el tope sale de la nómina media, redondeado', () => {
    expect(cap).toBe(4_100_000_00);
    expect(luxuryTaxLineCents(cap)).toBeGreaterThan(cap);
  });

  it('por debajo del tope se firma lo que quepa; por encima, sólo mínimos', () => {
    expect(
      canSignUnderCap({
        payrollCents: 3_000_000_00,
        wageOfferedCents: 500_000_00,
        salaryCapCents: cap
      }).ok
    ).toBe(true);
    expect(
      canSignUnderCap({
        payrollCents: 4_000_000_00,
        wageOfferedCents: 500_000_00,
        salaryCapCents: cap
      }).ok
    ).toBe(false);
    expect(
      canSignUnderCap({
        payrollCents: 6_000_000_00,
        wageOfferedCents: minimumSalaryCents(cap),
        salaryCapCents: cap
      }).ok
    ).toBe(true);
  });

  it('el impuesto de lujo es uno y medio por cada euro por encima del umbral', () => {
    const line = luxuryTaxLineCents(cap);
    expect(luxuryTaxCents(line - 1, line)).toBe(0);
    expect(luxuryTaxCents(line + 100_000_00, line)).toBe(150_000_00);
  });
});
