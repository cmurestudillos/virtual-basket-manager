import { describe, expect, it } from 'vitest';
import { createRng } from '@shared/engine/basketball/rng';
import {
  NATION_NAMES,
  QUALIFIER_GROUP_SIZE,
  WORLD_CUP_FINAL,
  WORLD_CUP_QUARTERFINAL,
  WORLD_CUP_TEAMS,
  callupDate,
  drawQualifierGroups,
  dutyPeriod,
  federationVerdict,
  hostFor,
  nationStrength,
  objectiveForRank,
  outcomeFor,
  pickSquad,
  qualifierDate,
  releasedForWindow,
  windowOfMatchday,
  worldCupDate,
  worldCupEntrants,
  worldCupQuarterfinals,
  type SquadCandidate
} from '../national-teams';
import { matchdayDate } from '../schedule';
import { continentalRoundDate } from '../continental';

/** Selecciones: calendario, sorteos, listas y lo que pide la federación. */

const DAY_MS = 24 * 60 * 60 * 1000;

describe('el calendario de selecciones', () => {
  it('seis jornadas de clasificación: dos en noviembre, dos en febrero y dos en verano', () => {
    expect([1, 2, 3, 4, 5, 6].map(windowOfMatchday)).toEqual([
      'november',
      'november',
      'february',
      'february',
      'summer',
      'summer'
    ]);
    expect(qualifierDate(2025, 1).getUTCMonth()).toBe(10);
    expect(qualifierDate(2025, 3).getUTCMonth()).toBe(1);
    expect(qualifierDate(2025, 5).getUTCMonth()).toBe(7);
    expect(qualifierDate(2025, 5).getUTCFullYear()).toBe(2026);
  });

  it('viernes y lunes: nunca el domingo de liga ni el jueves de Europa', () => {
    for (let matchday = 1; matchday <= 6; matchday += 1) {
      const day = qualifierDate(2025, matchday).getUTCDay();
      expect([5, 1]).toContain(day);
    }
    const leagueDays = new Set(
      Array.from({ length: 34 }, (_, index) => matchdayDate(2025, index + 1).getTime())
    );
    const europeDays = new Set(
      Array.from({ length: 15 }, (_, index) => continentalRoundDate(2025, index + 1).getTime())
    );
    for (let matchday = 1; matchday <= 6; matchday += 1) {
      const date = qualifierDate(2025, matchday).getTime();
      expect(leagueDays.has(date)).toBe(false);
      expect(europeDays.has(date)).toBe(false);
    }
  });

  it('la convocatoria llega antes y el convocado se pierde el domingo de su club', () => {
    const { from, to } = dutyPeriod(2025, 'november');
    expect(callupDate(2025, 'november').getTime()).toBeLessThan(from.getTime());
    const sunday = new Date(qualifierDate(2025, 1).getTime() + 2 * DAY_MS);
    expect(sunday.getUTCDay()).toBe(0);
    expect(sunday.getTime()).toBeGreaterThan(from.getTime());
    expect(sunday.getTime()).toBeLessThan(to.getTime());
  });

  it('el Mundial se juega en agosto, después de la clasificación y antes de la temporada nueva', () => {
    expect(worldCupDate(2025, 1).getTime()).toBeGreaterThan(qualifierDate(2025, 6).getTime());
    expect(worldCupDate(2025, WORLD_CUP_FINAL).getTime()).toBeLessThan(Date.UTC(2026, 8, 1));
    for (let round = 2; round <= WORLD_CUP_FINAL; round += 1) {
      expect(worldCupDate(2025, round).getTime()).toBeGreaterThan(
        worldCupDate(2025, round - 1).getTime()
      );
    }
  });
});

describe('quién va', () => {
  it('en verano suelta todo el mundo; en invierno, ni la liga americana ni Europa', () => {
    const normal = { leagueCountry: 'ESP', playsContinental: false };
    const europeo = { leagueCountry: 'ESP', playsContinental: true };
    const americano = { leagueCountry: 'USA', playsContinental: false };
    const libre = { leagueCountry: null, playsContinental: false };

    expect(releasedForWindow('november', normal)).toBe(true);
    expect(releasedForWindow('february', europeo)).toBe(false);
    expect(releasedForWindow('november', americano)).toBe(false);
    expect(releasedForWindow('february', libre)).toBe(true);
    expect(releasedForWindow('summer', europeo)).toBe(true);
    expect(releasedForWindow('summer', americano)).toBe(true);
  });

  it('la lista tiene doce y no se olvida de bases ni de pívots', () => {
    const candidates: SquadCandidate[] = [
      ...Array.from({ length: 15 }, (_, index) => ({
        id: `alero-${index}`,
        position: 'SF' as const,
        overall: 90 - index
      })),
      ...Array.from({ length: 5 }, (_, index) => ({
        id: `base-${index}`,
        position: 'PG' as const,
        overall: 60 - index
      })),
      ...Array.from({ length: 3 }, (_, index) => ({
        id: `pivot-${index}`,
        position: 'C' as const,
        overall: 55 - index
      }))
    ];

    const squad = pickSquad(candidates);
    expect(squad).toHaveLength(12);
    expect(squad.filter((id) => id.startsWith('base-'))).toHaveLength(4);
    expect(squad.filter((id) => id.startsWith('pivot-'))).toHaveLength(2);
    // El resto, los mejores aleros.
    expect(squad).toContain('alero-0');
    expect(squad).not.toContain('alero-14');
  });

  it('con menos de doce disponibles se convoca a los que hay', () => {
    expect(
      pickSquad([
        { id: 'a', position: 'PG', overall: 70 },
        { id: 'b', position: 'C', overall: 60 }
      ])
    ).toEqual(['a', 'b']);
  });

  it('la fuerza de una selección es la media de sus doce mejores', () => {
    expect(nationStrength([...Array(12).fill(80), 20, 10])).toBe(80);
    expect(nationStrength([])).toBe(0);
  });
});

describe('sorteos', () => {
  const ranked = Object.keys(NATION_NAMES);

  it('el anfitrión rota y no repite dos años seguidos', () => {
    const hosts = Array.from({ length: 21 }, (_, index) => hostFor(ranked, index + 1));
    expect(new Set(hosts).size).toBe(21);
    expect(hostFor(ranked, 1)).not.toBe(hostFor(ranked, 2));
  });

  it('veinte selecciones dan cinco grupos de cuatro, una de cada bombo', () => {
    const pool = ranked.slice(0, 20);
    const groups = drawQualifierGroups(pool, createRng(7));

    expect(groups).toHaveLength(5);
    for (const group of groups) {
      expect(group).toHaveLength(QUALIFIER_GROUP_SIZE);
      // Una del primer bombo (las cinco mejores) por grupo.
      expect(group.filter((code) => pool.indexOf(code) < 5)).toHaveLength(1);
    }
    expect(new Set(groups.flat()).size).toBe(20);
  });

  it('las que no completan grupo se quedan fuera', () => {
    expect(drawQualifierGroups(ranked, createRng(1)).flat()).toHaveLength(20);
  });

  it('al Mundial van el anfitrión y los tres primeros de cada grupo', () => {
    const standings = [0, 1, 2, 3, 4].map((group) =>
      [0, 1, 2, 3].map((position) => `${group}${position}`)
    );
    const entrants = worldCupEntrants('HOST', standings);

    expect(entrants).toHaveLength(WORLD_CUP_TEAMS);
    expect(entrants[0]).toBe('HOST');
    expect(entrants.filter((code) => code.endsWith('3'))).toHaveLength(0);
  });

  it('cuartos cruzados: el primero de un grupo contra el segundo del vecino', () => {
    const pairings = worldCupQuarterfinals([
      ['A1', 'A2'],
      ['B1', 'B2'],
      ['C1', 'C2'],
      ['D1', 'D2']
    ]);
    expect(pairings.map((row) => `${row.higherSeedTeamId}-${row.lowerSeedTeamId}`)).toEqual([
      'A1-B2',
      'B1-A2',
      'C1-D2',
      'D1-C2'
    ]);
  });
});

describe('la federación', () => {
  it('pide más a las mejores', () => {
    expect(objectiveForRank(1)).toBe('semifinal');
    expect(objectiveForRank(5)).toBe('quarterfinal');
    expect(objectiveForRank(10)).toBe('qualify');
    expect(objectiveForRank(20)).toBe('compete');
  });

  it('un escalón por debajo es un aviso; dos, la destitución', () => {
    expect(federationVerdict('quarterfinal', 'semifinal')).toBe('fulfilled');
    expect(federationVerdict('quarterfinal', 'groupStage')).toBe('warning');
    expect(federationVerdict('quarterfinal', 'notQualified')).toBe('dismissed');
    expect(federationVerdict('compete', 'notQualified')).toBe('fulfilled');
  });

  it('el resultado sale de la última ronda jugada', () => {
    expect(outcomeFor(null, false)).toBe('notQualified');
    expect(outcomeFor(3, false)).toBe('groupStage');
    expect(outcomeFor(WORLD_CUP_QUARTERFINAL, false)).toBe('quarterfinal');
    expect(outcomeFor(WORLD_CUP_FINAL, false)).toBe('final');
    expect(outcomeFor(WORLD_CUP_FINAL, true)).toBe('champion');
  });
});
