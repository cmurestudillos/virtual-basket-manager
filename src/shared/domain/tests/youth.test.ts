import { describe, expect, it } from 'vitest';
import { overallForPosition } from '../attributes';
import { createRng } from '@shared/engine/basketball/rng';
import {
  MAX_ROSTER,
  MAX_YOUTH_LEVEL,
  YOUTH_MAX_AGE,
  YOUTH_MIN_AGE,
  agedOut,
  canPromote,
  generateProspect,
  intakeSize,
  youthLevelLabel,
  youthUpgradeCostCents,
  youthUpkeepCents
} from '../youth';

/** Media del techo de una hornada entera, que es lo que de verdad se compara. */
function averagePotential(level: number, howMany = 40): number {
  const rng = createRng(level * 1000 + 7);
  let total = 0;
  for (let index = 0; index < howMany; index += 1) {
    total += generateProspect(level, rng).potential;
  }
  return total / howMany;
}

describe('generateProspect', () => {
  it('sale joven, flojo y con techo por delante', () => {
    const rng = createRng(42);

    for (let index = 0; index < 30; index += 1) {
      const prospect = generateProspect(3, rng);

      expect(prospect.age).toBeGreaterThanOrEqual(YOUTH_MIN_AGE);
      expect(prospect.age).toBeLessThanOrEqual(YOUTH_MAX_AGE);
      expect(overallForPosition(prospect.attributes, prospect.position)).toBeLessThan(70);
      expect(prospect.potential).toBeGreaterThan(
        overallForPosition(prospect.attributes, prospect.position)
      );
    }
  });

  it('una cantera de referencia saca chavales con más techo', () => {
    expect(averagePotential(MAX_YOUTH_LEVEL)).toBeGreaterThan(averagePotential(1) + 10);
  });

  it('es determinista: misma semilla, mismo chaval', () => {
    expect(generateProspect(3, createRng(9))).toEqual(generateProspect(3, createRng(9)));
  });
});

describe('hornada', () => {
  it('una cantera mejor saca más juveniles', () => {
    const rng = createRng(5);
    let pequena = 0;
    let grande = 0;
    for (let index = 0; index < 20; index += 1) {
      pequena += intakeSize(1, rng);
      grande += intakeSize(5, rng);
    }

    expect(grande).toBeGreaterThan(pequena);
  });

  it('siempre sale alguien', () => {
    const rng = createRng(3);
    for (let index = 0; index < 20; index += 1) {
      expect(intakeSize(1, rng)).toBeGreaterThanOrEqual(1);
    }
  });
});

describe('instalaciones', () => {
  it('cada escalón cuesta más que el anterior y mantener también', () => {
    expect(youthUpgradeCostCents(4)).toBeGreaterThan(youthUpgradeCostCents(1));
    expect(youthUpkeepCents(5)).toBeGreaterThan(youthUpkeepCents(2));
  });

  it('tienen nombre en vez de un número pelado', () => {
    expect(youthLevelLabel(1)).toBe('Modesta');
    expect(youthLevelLabel(5)).toBe('De referencia');
  });
});

describe('promoción', () => {
  it('hace falta hueco en la plantilla', () => {
    expect(canPromote(MAX_ROSTER - 1)).toBe(true);
    expect(canPromote(MAX_ROSTER)).toBe(false);
  });

  it('a los diecinueve ya no es juvenil', () => {
    expect(agedOut(YOUTH_MAX_AGE)).toBe(false);
    expect(agedOut(YOUTH_MAX_AGE + 1)).toBe(true);
  });
});
