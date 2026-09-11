import { describe, expect, it } from 'vitest';
import { createRng } from '@shared/engine/basketball/rng';
import {
  INJURY_TEMPLATES,
  MAX_INJURY_RISK,
  ageRisk,
  gameInjuryRisk,
  injuryLabel,
  rollInjury,
  trainingInjuryRisk
} from '../injuries';

const FRESCO = { minutesPlayed: 24, condition: 100, age: 24, stamina: 80 };

describe('gameInjuryRisk', () => {
  it('quien no sale de la pista no se lesiona', () => {
    expect(gameInjuryRisk({ ...FRESCO, minutesPlayed: 0 })).toBe(0);
  });

  it('más minutos, más riesgo', () => {
    expect(gameInjuryRisk({ ...FRESCO, minutesPlayed: 38 })).toBeGreaterThan(
      gameInjuryRisk({ ...FRESCO, minutesPlayed: 12 })
    );
  });

  it('llegar fundido es lo que más lo dispara', () => {
    expect(gameInjuryRisk({ ...FRESCO, condition: 40 })).toBeGreaterThan(
      gameInjuryRisk(FRESCO) * 1.5
    );
  });

  it('el veterano se rompe más que el joven', () => {
    expect(gameInjuryRisk({ ...FRESCO, age: 35 })).toBeGreaterThan(gameInjuryRisk(FRESCO));
    expect(ageRisk(24)).toBe(1);
  });

  it('ninguna combinación convierte el partido en una ruleta rusa', () => {
    const peor = gameInjuryRisk({ minutesPlayed: 48, condition: 0, age: 45, stamina: 1 });

    expect(peor).toBeLessThanOrEqual(MAX_INJURY_RISK);
  });

  it('el riesgo normal de un titular fresco es bajo', () => {
    expect(gameInjuryRisk(FRESCO)).toBeLessThan(0.03);
  });
});

describe('trainingInjuryRisk', () => {
  it('la intensidad manda', () => {
    const suave = trainingInjuryRisk({ intensity: 2, condition: 100, age: 24 });
    const bestia = trainingInjuryRisk({ intensity: 10, condition: 100, age: 24 });

    expect(bestia).toBeGreaterThan(suave * 3);
  });
});

describe('rollInjury', () => {
  it('sin riesgo no hay lesión', () => {
    expect(rollInjury(createRng(1), 0)).toBeNull();
  });

  it('con riesgo seguro devuelve una lesión del catálogo', () => {
    const injury = rollInjury(createRng(42), 1);

    expect(injury).not.toBeNull();
    const template = INJURY_TEMPLATES.find((entry) => entry.name === injury?.name);
    expect(template).toBeDefined();
    expect(injury!.days).toBeGreaterThanOrEqual(template!.minDays);
    expect(injury!.days).toBeLessThanOrEqual(template!.maxDays);
  });

  it('es determinista: la misma semilla se lesiona igual', () => {
    expect(rollInjury(createRng(7), 0.5)).toEqual(rollInjury(createRng(7), 0.5));
  });

  it('las leves son mucho más frecuentes que las graves', () => {
    const nombres = Array.from({ length: 400 }, (_, index) => rollInjury(createRng(index), 1)).map(
      (injury) => injury?.name
    );
    const graves = nombres.filter((name) => name === 'Lesión de rodilla').length;

    expect(graves).toBeLessThan(nombres.length * 0.1);
  });
});

describe('injuryLabel', () => {
  it('habla como un parte médico', () => {
    expect(injuryLabel(0)).toBe('Disponible');
    expect(injuryLabel(1)).toBe('1 día');
    expect(injuryLabel(4)).toBe('4 días');
    expect(injuryLabel(21)).toBe('3 semanas');
    expect(injuryLabel(90)).toBe('3 meses');
  });
});
