import { describe, expect, it } from 'vitest';
import {
  MAX_CONDITION,
  conditionAfterGame,
  conditionAfterRest,
  conditionLabel,
  dailyRecovery,
  gameWear,
  trainingWear
} from '../conditioning';

describe('gameWear', () => {
  it('un partido completo cuesta más de veinte puntos de forma', () => {
    const wear = gameWear(32, 80);

    expect(wear).toBeGreaterThan(20);
    expect(wear).toBeLessThan(30);
  });

  it('el que aguanta más se cansa menos por el mismo partido', () => {
    expect(gameWear(30, 90)).toBeLessThan(gameWear(30, 40));
  });

  it('quien no juega no se cansa', () => {
    expect(gameWear(0, 60)).toBe(0);
  });
});

describe('conditionAfterGame', () => {
  it('descuenta el desgaste y nunca baja de cero', () => {
    expect(conditionAfterGame(100, 32, 80)).toBeLessThan(80);
    expect(conditionAfterGame(10, 40, 30)).toBe(0);
  });
});

describe('descanso', () => {
  it('se recupera más rápido con más resistencia', () => {
    expect(dailyRecovery(90)).toBeGreaterThan(dailyRecovery(40));
  });

  it('no pasa de cien por mucho que descanse', () => {
    expect(conditionAfterRest(95, 10, 70)).toBe(MAX_CONDITION);
  });

  it('saltarse seis días de golpe es lo mismo que avanzarlos de uno en uno', () => {
    // Es la invariante que sostiene «ir a la jornada»: el reloj puede ir a
    // saltos porque la recuperación es lineal y con tope.
    let paso = 60;
    for (let dia = 0; dia < 6; dia += 1) {
      paso = conditionAfterRest(paso, 1, 75);
    }

    expect(conditionAfterRest(60, 6, 75)).toBe(paso);
  });
});

describe('trainingWear', () => {
  it('entrenar duro cuesta el doble que entrenar suave', () => {
    expect(trainingWear(10, false)).toBeCloseTo(trainingWear(5, false) * 2, 5);
  });

  it('la semana de recuperación no cuesta nada', () => {
    expect(trainingWear(10, true)).toBe(0);
  });
});

describe('conditionLabel', () => {
  it('traduce la forma a lo que se lee en la plantilla', () => {
    expect(conditionLabel(95)).toBe('Fresco');
    expect(conditionLabel(80)).toBe('Bien');
    expect(conditionLabel(60)).toBe('Cargado');
    expect(conditionLabel(30)).toBe('Fundido');
  });
});
