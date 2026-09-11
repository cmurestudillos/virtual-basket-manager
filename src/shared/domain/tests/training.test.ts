import { describe, expect, it } from 'vitest';
import { createRng } from '@shared/engine/basketball/rng';
import { overallForPosition, uniformAttributes } from '../attributes';
import {
  MAX_ATTRIBUTE,
  TRAINING_FOCUSES,
  TRAINING_FOCUS_ATTRIBUTES,
  TRAINING_FOCUS_LABELS,
  applyChanges,
  declineChance,
  developmentAgeFactor,
  trainWeek
} from '../training';

/** Entrena `weeks` semanas seguidas y devuelve los atributos resultantes. */
function trainFor(options: {
  weeks: number;
  age: number;
  potential: number;
  focus: (typeof TRAINING_FOCUSES)[number];
  intensity?: number;
  base?: number;
}): ReturnType<typeof uniformAttributes> {
  let attributes = uniformAttributes(options.base ?? 60);

  for (let week = 0; week < options.weeks; week += 1) {
    const changes = trainWeek({
      attributes,
      position: 'SG',
      potential: options.potential,
      age: options.age,
      focus: options.focus,
      intensity: options.intensity ?? 5,
      rng: createRng(week + 1)
    });
    attributes = applyChanges(attributes, changes);
  }

  return attributes;
}

describe('developmentAgeFactor', () => {
  it('los jóvenes crecen y los treintañeros ya no', () => {
    expect(developmentAgeFactor(20)).toBeGreaterThan(developmentAgeFactor(26));
    expect(developmentAgeFactor(26)).toBeGreaterThan(developmentAgeFactor(30));
    expect(developmentAgeFactor(33)).toBe(0);
  });

  it('el declive físico sólo empieza pasados los treinta', () => {
    expect(declineChance(28)).toBe(0);
    expect(declineChance(34)).toBeGreaterThan(0);
  });
});

describe('trainWeek', () => {
  it('un joven con techo alto mejora en lo que entrena', () => {
    const antes = uniformAttributes(60);
    const despues = trainFor({ weeks: 30, age: 20, potential: 85, focus: 'shooting' });

    expect(despues.threePoint).toBeGreaterThan(antes.threePoint);
    expect(despues.midRange).toBeGreaterThan(antes.midRange);
    // Y no toca lo que no se entrena.
    expect(despues.block).toBe(antes.block);
  });

  it('quien ya está en su techo no mejora', () => {
    const attributes = trainFor({ weeks: 30, age: 20, potential: 60, focus: 'shooting' });

    expect(overallForPosition(attributes, 'SG')).toBeLessThanOrEqual(62);
  });

  it('entrenar más duro acelera la mejora', () => {
    const suave = trainFor({ weeks: 30, age: 20, potential: 90, focus: 'physical', intensity: 2 });
    const fuerte = trainFor({
      weeks: 30,
      age: 20,
      potential: 90,
      focus: 'physical',
      intensity: 10
    });

    expect(fuerte.speed + fuerte.strength).toBeGreaterThan(suave.speed + suave.strength);
  });

  it('la recuperación no mueve ningún atributo', () => {
    const changes = trainWeek({
      attributes: uniformAttributes(60),
      position: 'SG',
      potential: 90,
      age: 20,
      focus: 'recovery',
      intensity: 5,
      rng: createRng(3)
    });

    expect(changes).toEqual([]);
  });

  it('al veterano se le caen las piernas aunque entrene', () => {
    const despues = trainFor({ weeks: 60, age: 36, potential: 90, focus: 'physical' });

    expect(despues.speed).toBeLessThan(60);
    expect(despues.jumping).toBeLessThan(60);
  });

  it('nunca pasa de 99', () => {
    const despues = trainFor({
      weeks: 80,
      age: 20,
      potential: 99,
      focus: 'shooting',
      intensity: 10,
      base: 98
    });

    expect(despues.threePoint).toBeLessThanOrEqual(MAX_ATTRIBUTE);
  });

  it('es determinista: misma semilla, misma semana', () => {
    const input = {
      attributes: uniformAttributes(60),
      position: 'SG' as const,
      potential: 90,
      age: 20,
      focus: 'defense' as const,
      intensity: 7,
      rng: createRng(11)
    };

    expect(trainWeek({ ...input, rng: createRng(11) })).toEqual(
      trainWeek({ ...input, rng: createRng(11) })
    );
  });
});

describe('catálogo de focos', () => {
  it('todos tienen etiqueta y atributos declarados', () => {
    for (const focus of TRAINING_FOCUSES) {
      expect(TRAINING_FOCUS_LABELS[focus]).toBeTruthy();
      expect(TRAINING_FOCUS_ATTRIBUTES[focus]).toBeDefined();
    }
  });
});
