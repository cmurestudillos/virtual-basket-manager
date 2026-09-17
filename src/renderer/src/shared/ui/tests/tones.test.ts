import { describe, expect, it } from 'vitest';
import { RATING_BAND_FLOOR, bandForValue, toneForDelta, toneForLevel } from '../tones';

/** La escala de 0 a 100: cuatro tramos, los mismos para todo el juego. */

describe('bandForValue', () => {
  it('corta en 80, 70 y 60', () => {
    expect(bandForValue(100)).toBe('top');
    expect(bandForValue(80)).toBe('top');
    expect(bandForValue(79)).toBe('high');
    expect(bandForValue(70)).toBe('high');
    expect(bandForValue(69)).toBe('mid');
    expect(bandForValue(60)).toBe('mid');
    expect(bandForValue(59)).toBe('low');
    expect(bandForValue(0)).toBe('low');
  });

  it('corta sobre el número que se enseña, ya redondeado', () => {
    expect(bandForValue(79.6)).toBe('top');
    expect(bandForValue(79.4)).toBe('high');
  });

  it('cada tramo empieza en su suelo', () => {
    for (const [band, floor] of Object.entries(RATING_BAND_FLOOR)) {
      expect(bandForValue(floor)).toBe(band);
    }
  });
});

describe('toneForLevel', () => {
  it('sale de la escala: bien desde 70, ojo de 60 a 69, mal por debajo', () => {
    expect(toneForLevel(85)).toBe('good');
    expect(toneForLevel(70)).toBe('good');
    expect(toneForLevel(65)).toBe('warn');
    expect(toneForLevel(59)).toBe('bad');
  });
});

describe('toneForDelta', () => {
  it('va por el signo', () => {
    expect(toneForDelta(3)).toBe('good');
    expect(toneForDelta(-1)).toBe('bad');
    expect(toneForDelta(0)).toBe('neutral');
  });
});
