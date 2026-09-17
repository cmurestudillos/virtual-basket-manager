import { describe, expect, it } from 'vitest';
import { STARS_MAX, toStars } from '../stars';

/** Un 0-100 en estrellas: potencial y reputación se leen igual en todo el juego. */

describe('toStars', () => {
  it('cada veinte puntos es una estrella', () => {
    expect(toStars(0)).toBe(0);
    expect(toStars(20)).toBe(1);
    expect(toStars(60)).toBe(3);
    expect(toStars(100)).toBe(STARS_MAX);
  });

  it('redondea a la media estrella más cercana', () => {
    expect(toStars(70)).toBe(3.5);
    expect(toStars(74)).toBe(3.5);
    expect(toStars(76)).toBe(4);
    expect(toStars(45)).toBe(2.5);
  });

  it('no se sale de la escala', () => {
    expect(toStars(-10)).toBe(0);
    expect(toStars(130)).toBe(STARS_MAX);
    expect(toStars(Number.NaN)).toBe(0);
  });
});
