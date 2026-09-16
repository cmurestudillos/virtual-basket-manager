import { describe, expect, it } from 'vitest';
import {
  MAX_MANAGER_REPUTATION,
  MIN_MANAGER_REPUTATION,
  STARTING_MANAGER_REPUTATION,
  clubWouldHire,
  managerReputation,
  managerReputationLabel,
  offerCountFor,
  overPerformance,
  type CareerSeasonRecord
} from '../career';

/**
 * Lo que vale un entrenador.
 *
 * Lo que se comprueba aquí no son números concretos —la escala se recalibrará—
 * sino el **orden**: que ganar valga más que no ganar, que hacerlo bien con un
 * modesto valga más que hacerlo regular con un grande, y que un despido no te
 * borre del mapa.
 */

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

describe('lo que vale un entrenador', () => {
  it('quien no ha dirigido nada empieza donde empieza todo el mundo', () => {
    expect(managerReputation([])).toBe(STARTING_MANAGER_REPUTATION);
  });

  it('ganar vale más que no ganar', () => {
    const campeon = managerReputation([season({ position: 1, titles: 1 })]);
    const noveno = managerReputation([season()]);

    expect(campeon).toBeGreaterThan(noveno);
  });

  it('los títulos suman, pero el décimo no vale lo que el primero', () => {
    const uno = managerReputation([season({ position: 1, titles: 1 })]);
    const tres = managerReputation([season({ position: 1, titles: 3 })]);
    const diez = managerReputation([season({ position: 1, titles: 10 })]);

    expect(tres).toBeGreaterThan(uno);
    expect(diez).toBeGreaterThan(tres);
    // La curva se aplana: del tercero al décimo se sube menos que del primero
    // al tercero, aunque sean siete títulos contra dos.
    expect(diez - tres).toBeLessThan(tres - uno);
  });

  it('salvar a un modesto vale más que quedar a medias con un grande', () => {
    // Un club de reputación 25 al que se saca sexto de 18.
    const modesto = managerReputation([season({ clubReputation: 25, position: 6 })]);
    // Y uno de 90 al que se deja sexto, que es un fracaso.
    const grande = managerReputation([season({ clubReputation: 90, position: 6 })]);

    expect(modesto).toBeGreaterThan(grande);
  });

  it('un despido resta, pero no te borra del mapa', () => {
    const conPalmares = [season({ position: 1, titles: 1 }), season({ position: 1, titles: 1 })];
    const limpio = managerReputation(conPalmares);
    const conDespido = managerReputation([
      ...conPalmares,
      season({ position: 17, dismissed: true })
    ]);

    expect(conDespido).toBeLessThan(limpio);
    // Sigue siendo alguien: dos títulos no se olvidan por un mal año.
    expect(conDespido).toBeGreaterThan(STARTING_MANAGER_REPUTATION);
  });

  it('nunca se sale de la escala', () => {
    const leyenda = Array.from({ length: 20 }, () =>
      season({ position: 1, titles: 3, clubReputation: 95 })
    );
    const desastre = Array.from({ length: 20 }, () =>
      season({ position: 18, clubReputation: 90, dismissed: true })
    );

    expect(managerReputation(leyenda)).toBeLessThanOrEqual(MAX_MANAGER_REPUTATION);
    expect(managerReputation(desastre)).toBeGreaterThanOrEqual(MIN_MANAGER_REPUTATION);
  });
});

describe('rendimiento contra lo esperable', () => {
  it('quedar donde te toca no suma ni resta', () => {
    // Un club de reputación 50 en una liga de 18 espera andar por el centro.
    expect(Math.abs(overPerformance(season({ clubReputation: 50, position: 9 })))).toBeLessThan(
      0.1
    );
  });

  it('el signo dice si se hizo mejor o peor de lo esperado', () => {
    expect(overPerformance(season({ clubReputation: 20, position: 2 }))).toBeGreaterThan(0);
    expect(overPerformance(season({ clubReputation: 95, position: 15 }))).toBeLessThan(0);
  });

  it('en segunda el mismo mérito pesa menos', () => {
    const primera = overPerformance(season({ clubReputation: 30, position: 1, tier: 1 }));
    const segunda = overPerformance(season({ clubReputation: 30, position: 1, tier: 2 }));

    expect(segunda).toBeGreaterThan(0);
    expect(segunda).toBeLessThan(primera);
  });

  it('una temporada a medias no cuenta', () => {
    expect(overPerformance(season({ position: null }))).toBe(0);
  });
});

describe('quién te quiere', () => {
  it('un grande no llama a un desconocido, y un modesto no llama a una leyenda', () => {
    expect(clubWouldHire(90, 20)).toBe(false);
    expect(clubWouldHire(20, 95)).toBe(false);
  });

  it('un club llama a quien anda por su nivel', () => {
    expect(clubWouldHire(50, 50)).toBe(true);
    expect(clubWouldHire(50, 40)).toBe(true);
    expect(clubWouldHire(50, 70)).toBe(true);
  });

  it('se puede dar un salto hacia arriba, y también caer a uno más pequeño', () => {
    // Con 60 de reputación se puede aspirar a un club de 80.
    expect(clubWouldHire(80, 60)).toBe(true);
    // Y un entrenador de 60 sigue valiendo para uno de 45.
    expect(clubWouldHire(45, 60)).toBe(true);
  });

  it('cuanto más nombre, más clubes se acuerdan de ti', () => {
    expect(offerCountFor(20)).toBeLessThan(offerCountFor(45));
    expect(offerCountFor(45)).toBeLessThan(offerCountFor(60));
    expect(offerCountFor(60)).toBeLessThan(offerCountFor(90));
    // Nunca un catálogo.
    expect(offerCountFor(99)).toBeLessThanOrEqual(4);
    // Y nunca cero: quedarse sin ninguna dejaría la partida sin salida.
    expect(offerCountFor(1)).toBeGreaterThan(0);
  });
});

describe('cómo se lee', () => {
  it('cada tramo tiene su nombre y ninguno se queda sin él', () => {
    for (let reputation = 1; reputation <= 99; reputation += 1) {
      expect(managerReputationLabel(reputation).length).toBeGreaterThan(0);
    }
    expect(managerReputationLabel(95)).not.toBe(managerReputationLabel(10));
  });
});
