import { describe, expect, it } from 'vitest';
import {
  MAX_STAFF_LEVEL,
  MIN_STAFF_LEVEL,
  NO_SCOUT_ERROR,
  STAFF_ROLES,
  STAFF_ROLE_LABELS,
  analystRevealsRival,
  injuryDurationFactor,
  injuryRiskFactor,
  recoveryBoost,
  scoutingError,
  staffLevelForReputation,
  staffLevelLabel,
  staffWageCents,
  trainingBoost,
  wearFactor
} from '../staff';

describe('fichas', () => {
  it('una eminencia cuesta muchísimo más que un aprendiz', () => {
    expect(staffWageCents(5)).toBe(staffWageCents(1) * 25);
  });

  it('el nivel se acota a la escala', () => {
    expect(staffWageCents(0)).toBe(staffWageCents(MIN_STAFF_LEVEL));
    expect(staffWageCents(9)).toBe(staffWageCents(MAX_STAFF_LEVEL));
  });
});

describe('efectos', () => {
  it('todos mejoran con el nivel y ninguno hace daño', () => {
    expect(trainingBoost(5)).toBeGreaterThan(trainingBoost(1));
    expect(trainingBoost(1)).toBeGreaterThan(1);
    expect(recoveryBoost(5)).toBeGreaterThan(recoveryBoost(1));
    expect(wearFactor(5)).toBeLessThan(wearFactor(1));
    expect(wearFactor(5)).toBeGreaterThan(0);
    expect(injuryDurationFactor(5)).toBeLessThan(injuryDurationFactor(1));
    expect(injuryRiskFactor(5)).toBeLessThan(injuryRiskFactor(1));
  });

  it('el ojeador afina la ficha de los rivales', () => {
    expect(scoutingError(5)).toBeLessThan(scoutingError(1));
    expect(scoutingError(1)).toBeLessThanOrEqual(NO_SCOUT_ERROR);
    expect(scoutingError(5)).toBeGreaterThanOrEqual(2);
  });

  it('el analista no aporta nada hasta que es competente', () => {
    expect(analystRevealsRival(1)).toBe(false);
    expect(analystRevealsRival(2)).toBe(true);
  });
});

describe('catálogo', () => {
  it('los cinco puestos tienen etiqueta', () => {
    expect(STAFF_ROLES).toHaveLength(5);
    for (const role of STAFF_ROLES) {
      expect(STAFF_ROLE_LABELS[role]).toBeTruthy();
    }
  });

  it('cada nivel tiene nombre', () => {
    expect(staffLevelLabel(1)).toBe('Aprendiz');
    expect(staffLevelLabel(5)).toBe('Eminencia');
  });

  it('el club grande arranca con mejor cuerpo técnico que el pequeño', () => {
    expect(staffLevelForReputation(85)).toBeGreaterThan(staffLevelForReputation(40));
    expect(staffLevelForReputation(20)).toBe(1);
  });
});
