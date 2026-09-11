import { describe, expect, it } from 'vitest';
import {
  CONTINENTAL_GROUP_ROUNDS,
  CONTINENTAL_TEAMS,
  FINAL_ROUND,
  MAX_PER_LEAGUE,
  MIN_CAPACITY_BY_TIER,
  QUARTERFINAL_ROUND,
  SEMIFINAL_ROUND,
  continentalBestOf,
  continentalDateFor,
  continentalPrizeCents,
  continentalRoundName,
  continentalStageOf,
  isNeutralVenueRound,
  qualifyForContinental,
  quarterfinalPairings,
  type ContinentalCandidate
} from '../continental';

const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

function candidate(
  teamId: string,
  competitionId: string,
  rank: number,
  reputation: number,
  capacity = 20_000
): ContinentalCandidate {
  return { teamId, competitionId, rank, reputation, capacity };
}

describe('formato', () => {
  it('cada ronda sabe lo que es', () => {
    expect(continentalStageOf(1)).toBe('group');
    expect(continentalStageOf(CONTINENTAL_GROUP_ROUNDS)).toBe('group');
    expect(continentalStageOf(QUARTERFINAL_ROUND)).toBe('quarterfinal');
    expect(continentalStageOf(SEMIFINAL_ROUND)).toBe('semifinal');
    expect(continentalStageOf(FINAL_ROUND)).toBe('final');
  });

  it('los cuartos son al mejor de tres y la Final Four a partido único', () => {
    expect(continentalBestOf(QUARTERFINAL_ROUND)).toBe(3);
    expect(continentalBestOf(SEMIFINAL_ROUND)).toBe(1);
    expect(continentalBestOf(FINAL_ROUND)).toBe(1);
  });

  it('la Final Four se juega en sede neutral y los cuartos no', () => {
    expect(isNeutralVenueRound(QUARTERFINAL_ROUND)).toBe(false);
    expect(isNeutralVenueRound(SEMIFINAL_ROUND)).toBe(true);
    expect(isNeutralVenueRound(FINAL_ROUND)).toBe(true);
  });

  it('la jornada de la fase de liga se llama jornada', () => {
    expect(continentalRoundName(7)).toBe('Jornada 7');
    expect(continentalRoundName(QUARTERFINAL_ROUND)).toBe('Cuartos de final');
    expect(continentalRoundName(FINAL_ROUND)).toContain('Final');
  });
});

describe('calendario', () => {
  it('no pisa nunca el domingo de liga', () => {
    const fechas = [
      ...Array.from({ length: CONTINENTAL_GROUP_ROUNDS }, (_, index) =>
        continentalDateFor(2025, index + 1)
      ),
      ...[1, 2, 3].map((game) => continentalDateFor(2025, QUARTERFINAL_ROUND, game)),
      continentalDateFor(2025, SEMIFINAL_ROUND),
      continentalDateFor(2025, FINAL_ROUND)
    ];

    // La liga se juega en domingo: si Europa cayera ahí, un club podría tener
    // dos partidos el mismo día.
    expect(fechas.every((fecha) => DIAS[fecha.getUTCDay()] !== 'domingo')).toBe(true);
  });

  it('va en orden y cabe dentro de la temporada', () => {
    const primera = continentalDateFor(2025, 1);
    const ultima = continentalDateFor(2025, FINAL_ROUND);

    expect(primera.getUTCFullYear()).toBe(2025);
    // La final llega antes de los playoffs nacionales, que son de mayo.
    expect(ultima.getUTCFullYear()).toBe(2026);
    expect(ultima.getUTCMonth()).toBeLessThan(4);
    expect(ultima.getTime()).toBeGreaterThan(primera.getTime());
  });

  it('los tres partidos de cuartos van uno detrás de otro', () => {
    const primero = continentalDateFor(2025, QUARTERFINAL_ROUND, 1);
    const tercero = continentalDateFor(2025, QUARTERFINAL_ROUND, 3);

    expect(tercero.getTime()).toBeGreaterThan(primero.getTime());
  });
});

describe('quién juega', () => {
  /** Cuatro ligas de cuatro equipos cada una, de mejor a peor liga. */
  const mundo: ContinentalCandidate[] = [
    ...[92, 84, 70, 60].map((rep, index) => candidate(`a${index + 1}`, 'liga-a', index + 1, rep)),
    ...[88, 76, 66, 55].map((rep, index) => candidate(`b${index + 1}`, 'liga-b', index + 1, rep)),
    ...[80, 68, 58, 48].map((rep, index) => candidate(`c${index + 1}`, 'liga-c', index + 1, rep)),
    ...[64, 54, 44, 34].map((rep, index) => candidate(`d${index + 1}`, 'liga-d', index + 1, rep))
  ];

  it('dentro de una liga manda el puesto, nunca la reputación', () => {
    const elegidos = qualifyForContinental(mundo, { slots: 6, minCapacity: 0 });

    // El segundo de la liga A entra antes que el tercero, pase lo que pase.
    expect(elegidos.indexOf('a2')).toBeLessThan(elegidos.indexOf('a3'));
    expect(elegidos.indexOf('b1')).toBeLessThan(elegidos.indexOf('b2'));
  });

  it('entre ligas manda la reputación', () => {
    const elegidos = qualifyForContinental(mundo, { slots: 4, minCapacity: 0 });

    // El segundo de la mejor liga (84) entra antes que el campeón de la
    // tercera (80): es lo que hace que una liga fuerte se lleve más plazas sin
    // necesidad de una tabla de coeficientes por país.
    expect(elegidos).toEqual(['a1', 'b1', 'a2', 'c1']);
  });

  it('ninguna liga se lleva más plazas de la cuenta', () => {
    const elegidos = qualifyForContinental(mundo, {
      slots: 8,
      minCapacity: 0,
      maxPerLeague: 2
    });

    for (const liga of ['liga-a', 'liga-b', 'liga-c', 'liga-d']) {
      expect(elegidos.filter((id) => id.startsWith(liga.slice(-1))).length).toBeLessThanOrEqual(2);
    }
    expect(elegidos).toHaveLength(8);
  });

  it('sin pabellón a la altura no se entra', () => {
    const pequeños = mundo.map((row) => (row.teamId === 'a1' ? { ...row, capacity: 1_000 } : row));
    const elegidos = qualifyForContinental(pequeños, { slots: 4, minCapacity: 5_000 });

    expect(elegidos).not.toContain('a1');
    // Y su plaza la hereda el siguiente de su misma liga, no otro cualquiera.
    expect(elegidos[0]).toBe('b1');
    expect(elegidos).toContain('a2');
  });

  it('quien ya juega una competición mejor no juega la siguiente', () => {
    const euroliga = qualifyForContinental(mundo, { slots: 4, minCapacity: 0 });
    const eurocup = qualifyForContinental(mundo, {
      slots: 4,
      minCapacity: 0,
      taken: new Set(euroliga)
    });

    expect(eurocup.some((id) => euroliga.includes(id))).toBe(false);
    expect(eurocup).toHaveLength(4);
  });

  it('si no hay bastantes candidatos devuelve los que haya', () => {
    expect(qualifyForContinental(mundo, { slots: 50, minCapacity: 0 })).toHaveLength(
      Math.min(mundo.length, 4 * MAX_PER_LEAGUE)
    );
  });

  it('el mismo mundo da siempre el mismo cuadro', () => {
    const opciones = { slots: 10, minCapacity: 0 };
    expect(qualifyForContinental(mundo, opciones)).toEqual(
      qualifyForContinental([...mundo].reverse(), opciones)
    );
  });
});

describe('cruces y premios', () => {
  it('los cuartos cruzan 1-8, 2-7, 3-6 y 4-5', () => {
    const seeds = Array.from({ length: CONTINENTAL_TEAMS }, (_, index) => `t${index + 1}`);
    const cruces = quarterfinalPairings(seeds);

    expect(cruces).toHaveLength(4);
    expect(cruces[0]).toMatchObject({ higherSeedTeamId: 't1', lowerSeedTeamId: 't8' });
    expect(cruces[3]).toMatchObject({ higherSeedTeamId: 't4', lowerSeedTeamId: 't5' });
  });

  it('llegar más lejos paga más, y el título aparte', () => {
    expect(continentalPrizeCents('final', true)).toBeGreaterThan(
      continentalPrizeCents('final', false)
    );
    expect(continentalPrizeCents('group', false)).toBeGreaterThan(0);
  });

  it('cada escalón del continente paga la mitad que el de encima', () => {
    expect(continentalPrizeCents('group', false, 2)).toBe(
      Math.round(continentalPrizeCents('group', false, 1) / 2)
    );
    expect(continentalPrizeCents('group', false, 3)).toBeLessThan(
      continentalPrizeCents('group', false, 2)
    );
  });

  it('el aforo exigido baja con la categoría de la competición', () => {
    expect(MIN_CAPACITY_BY_TIER[1]).toBeGreaterThan(MIN_CAPACITY_BY_TIER[2] as number);
    expect(MIN_CAPACITY_BY_TIER[2]).toBeGreaterThan(MIN_CAPACITY_BY_TIER[3] as number);
  });
});
