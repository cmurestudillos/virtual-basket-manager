import { describe, expect, it } from 'vitest';
import { createRng, seedFromString } from '@shared/engine/basketball/rng';
import { STARTING_MANAGER_REPUTATION, managerReputation, type CareerSeasonRecord } from '../career';
import {
  COACH_EXPORTERS,
  MAX_COACH_AGE,
  MAX_YOUNG_COACH_AGE,
  MIN_COACH_AGE,
  MIN_GAMES_BEFORE_DISMISSAL,
  canDismissMidSeason,
  chooseReplacement,
  coachAge,
  coachReputation,
  generateClubCoach,
  generateFreeCoach,
  initialCoachReputation,
  isClearlyBelowExpectations,
  poolShortfall,
  retirementChance,
  summerDismissalChance,
  type CoachCandidate
} from '../coaches';

/**
 * Los entrenadores de la IA: cómo se inventan, cuánto valen y las reglas del
 * carrusel. Como en la carrera, lo que se fija es el orden y los límites, no
 * los números exactos.
 */

const TODAY = new Date(Date.UTC(2025, 8, 1));

function season(overrides: Partial<CareerSeasonRecord> = {}): CareerSeasonRecord {
  return {
    position: 9,
    teams: 18,
    tier: 1,
    clubReputation: 50,
    titles: 0,
    dismissed: false,
    ...overrides
  };
}

describe('la reputación de un entrenador', () => {
  it('la del usuario es la regla general con su punto de partida, al decimal', () => {
    const casos: CareerSeasonRecord[][] = [
      [],
      [season()],
      [season({ position: 1, titles: 2, clubReputation: 85 })],
      [season({ position: 17, dismissed: true, clubReputation: 30 }), season({ tier: 2 })],
      Array.from({ length: 12 }, (_, index) =>
        season({ position: (index % 18) + 1, clubReputation: 40 + index * 3 })
      )
    ];
    for (const caso of casos) {
      expect(managerReputation(caso)).toBe(coachReputation(STARTING_MANAGER_REPUTATION, caso));
    }
  });

  it('sin historia vale su base', () => {
    expect(coachReputation(62, [])).toBe(62);
  });

  it('quien cumple lo esperado año tras año no se infla: tope en su base más el oficio', () => {
    const base = 60;
    // Club de lo que le corresponde (base + 15) y puesto justo el esperado:
    // rendimiento cero, sin títulos ni despidos.
    const expected = 1 + ((100 - 75) / 100) * 17;
    const cumple = (years: number): number =>
      coachReputation(
        base,
        Array.from({ length: years }, () =>
          season({ clubReputation: 75, position: expected, teams: 18 })
        )
      );

    expect(cumple(8)).toBe(base + 6);
    expect(cumple(30)).toBe(cumple(8));
    expect(cumple(100)).toBe(cumple(8));
  });

  it('ni ganándolo todo se sale de la escala', () => {
    const campeon = Array.from({ length: 40 }, () =>
      season({ position: 1, titles: 3, clubReputation: 95 })
    );
    expect(coachReputation(90, campeon)).toBeLessThanOrEqual(99);
  });

  it('ganar sube y fracasar baja, partiendo de la misma base', () => {
    const base = 50;
    expect(
      coachReputation(base, [season({ position: 1, titles: 1, clubReputation: 65 })])
    ).toBeGreaterThan(
      coachReputation(base, [season({ position: 16, clubReputation: 65, dismissed: true })])
    );
  });
});

describe('la reputación de partida', () => {
  it('va unos quince puntos por debajo del club, algo menos en segunda', () => {
    const primera: number[] = [];
    const segunda: number[] = [];
    for (let index = 0; index < 200; index += 1) {
      primera.push(initialCoachReputation(80, 1, createRng(index)));
      segunda.push(initialCoachReputation(80, 2, createRng(index)));
    }
    const media = (values: number[]): number =>
      values.reduce((sum, value) => sum + value, 0) / values.length;

    expect(media(primera)).toBeGreaterThan(60);
    expect(media(primera)).toBeLessThan(70);
    expect(media(segunda)).toBeLessThan(media(primera));
    expect(Math.min(...primera)).toBeGreaterThanOrEqual(57);
    expect(Math.max(...primera)).toBeLessThanOrEqual(73);
  });
});

describe('inventar entrenadores', () => {
  it('la misma semilla da el mismo entrenador', () => {
    const uno = generateClubCoach({
      country: 'ESP',
      clubReputation: 70,
      tier: 1,
      today: TODAY,
      rng: createRng(seedFromString('club-1-entrenador'))
    });
    const otro = generateClubCoach({
      country: 'ESP',
      clubReputation: 70,
      tier: 1,
      today: TODAY,
      rng: createRng(seedFromString('club-1-entrenador'))
    });
    expect(otro).toEqual(uno);
  });

  it('uno real lleva su nombre y su fecha, y la reputación sale de la misma tirada', () => {
    const input = {
      country: 'ESP',
      clubReputation: 70,
      tier: 1,
      today: TODAY,
      rng: createRng(seedFromString('club-1-entrenador'))
    };
    const invented = generateClubCoach(input);
    // Con la misma edad que el inventado, la reputación es exactamente la suya.
    const sameAge = generateClubCoach({
      ...input,
      rng: createRng(seedFromString('club-1-entrenador')),
      real: {
        firstName: 'Técnico',
        lastName: 'Real',
        nationality: 'ITA',
        birthDate: invented.birthDate
      }
    });
    expect(sameAge).toEqual({
      firstName: 'Técnico',
      lastName: 'Real',
      nationality: 'ITA',
      birthDate: invented.birthDate,
      baseReputation: invented.baseReputation
    });
    // Y su edad cuenta como oficio, no su fama: más años, algo más de nombre.
    const veteran = generateClubCoach({
      ...input,
      rng: createRng(seedFromString('club-1-entrenador')),
      real: {
        firstName: 'Técnico',
        lastName: 'Veterano',
        nationality: 'ESP',
        birthDate: new Date(Date.UTC(TODAY.getUTCFullYear() - 66, 0, 1))
      }
    });
    const young = generateClubCoach({
      ...input,
      rng: createRng(seedFromString('club-1-entrenador')),
      real: {
        firstName: 'Técnico',
        lastName: 'Joven',
        nationality: 'ESP',
        birthDate: new Date(Date.UTC(TODAY.getUTCFullYear() - 34, 0, 1))
      }
    });
    expect(veteran.baseReputation).toBeGreaterThan(young.baseReputation);
  });

  it('de 34 a 66 años, y entre un 15 y un 20 % de fuera', () => {
    let foreign = 0;
    const total = 2000;
    for (let index = 0; index < total; index += 1) {
      const coach = generateClubCoach({
        country: 'ESP',
        clubReputation: 60,
        tier: 1,
        today: TODAY,
        rng: createRng(seedFromString(`club-${index}-entrenador`))
      });
      const age = coachAge(coach.birthDate, TODAY);
      expect(age).toBeGreaterThanOrEqual(MIN_COACH_AGE);
      expect(age).toBeLessThanOrEqual(MAX_COACH_AGE);
      if (coach.nationality !== 'ESP') {
        foreign += 1;
        expect(COACH_EXPORTERS).toContain(coach.nationality);
      }
    }
    expect(foreign / total).toBeGreaterThan(0.14);
    expect(foreign / total).toBeLessThan(0.21);
  });

  it('los jóvenes de la bolsa son jóvenes y con poco nombre', () => {
    const rng = createRng(7);
    for (let index = 0; index < 100; index += 1) {
      const coach = generateFreeCoach({
        nationalities: ['ESP', 'ITA'],
        today: TODAY,
        young: true,
        rng
      });
      expect(coachAge(coach.birthDate, TODAY)).toBeLessThanOrEqual(MAX_YOUNG_COACH_AGE);
      expect(coach.baseReputation).toBeLessThanOrEqual(30);
      expect(['ESP', 'ITA']).toContain(coach.nationality);
    }
  });

  it('la edad cuenta el cumpleaños', () => {
    const birth = new Date(Date.UTC(1980, 9, 15));
    expect(coachAge(birth, new Date(Date.UTC(2025, 9, 14)))).toBe(44);
    expect(coachAge(birth, new Date(Date.UTC(2025, 9, 15)))).toBe(45);
  });
});

describe('el carrusel', () => {
  it('en verano: fallar es probable, cumplir raro y superar, nunca', () => {
    expect(summerDismissalChance('failed')).toBeGreaterThan(0.5);
    expect(summerDismissalChance('met')).toBeGreaterThan(0);
    expect(summerDismissalChance('met')).toBeLessThan(0.1);
    expect(summerDismissalChance('exceeded')).toBe(0);
  });

  it('a mitad de temporada, sólo en la fase regular y con partidos en el cargo', () => {
    expect(
      canDismissMidSeason({ stage: 'regular', gamesInCharge: MIN_GAMES_BEFORE_DISMISSAL })
    ).toBe(true);
    expect(
      canDismissMidSeason({ stage: 'regular', gamesInCharge: MIN_GAMES_BEFORE_DISMISSAL - 1 })
    ).toBe(false);
    expect(canDismissMidSeason({ stage: 'playoffs', gamesInCharge: 30 })).toBe(false);
  });

  it('«claramente por debajo» es un cuarto de la tabla, con un mínimo de tres puestos', () => {
    expect(isClearlyBelowExpectations({ position: 5, expectedPosition: 3, teams: 18 })).toBe(false);
    expect(isClearlyBelowExpectations({ position: 8, expectedPosition: 3, teams: 18 })).toBe(true);
    expect(isClearlyBelowExpectations({ position: 7, expectedPosition: 4, teams: 10 })).toBe(true);
    // Ir por delante nunca cuesta el puesto.
    expect(isClearlyBelowExpectations({ position: 1, expectedPosition: 12, teams: 18 })).toBe(
      false
    );
  });

  it('nadie se retira antes de los sesenta; a los setenta y dos, todos; parado, antes', () => {
    expect(retirementChance(59, true)).toBe(0);
    expect(retirementChance(64, true)).toBeGreaterThan(retirementChance(61, true));
    expect(retirementChance(64, false)).toBeGreaterThan(retirementChance(64, true));
    expect(retirementChance(72, true)).toBe(1);
  });

  it('la bolsa se repone hasta su tamaño y nunca pide negativos', () => {
    expect(poolShortfall(33)).toBe(7);
    expect(poolShortfall(55)).toBe(0);
  });
});

describe('el sustituto', () => {
  const libre = (coachId: string, reputation: number): CoachCandidate => ({
    coachId,
    reputation,
    teamId: null,
    teamReputation: null
  });
  const conEquipo = (
    coachId: string,
    reputation: number,
    teamReputation: number
  ): CoachCandidate => ({
    coachId,
    reputation,
    teamId: `club-de-${coachId}`,
    teamReputation
  });

  it('el mejor libre dispuesto a venir', () => {
    const elegido = chooseReplacement({
      clubReputation: 60,
      candidates: [libre('a', 30), libre('b', 50), libre('c', 99), conEquipo('d', 70, 40)],
      poach: false
    });
    // «c» vale demasiado para un club de 60 y «d» tiene equipo: sin tirada no se roba.
    expect(elegido?.coachId).toBe('b');
  });

  it('con la tirada, se lleva al de un club más pequeño si es claramente mejor', () => {
    const elegido = chooseReplacement({
      clubReputation: 70,
      candidates: [libre('a', 45), conEquipo('d', 62, 50)],
      poach: true
    });
    expect(elegido?.coachId).toBe('d');
  });

  it('no roba a un club igual de grande: el cambio no le tienta', () => {
    const elegido = chooseReplacement({
      clubReputation: 70,
      candidates: [libre('a', 45), conEquipo('d', 62, 68)],
      poach: true
    });
    expect(elegido?.coachId).toBe('a');
  });

  it('si nadie encaja, el libre que más se le parezca; sin nadie, nadie', () => {
    expect(
      chooseReplacement({
        clubReputation: 95,
        candidates: [libre('a', 20), libre('b', 40)],
        poach: false
      })?.coachId
    ).toBe('b');
    expect(chooseReplacement({ clubReputation: 50, candidates: [], poach: true })).toBeNull();
  });
});
