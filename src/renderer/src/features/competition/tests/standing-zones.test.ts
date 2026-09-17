import { describe, expect, it } from 'vitest';
import { zoneCellClass, zoneSwatchClass, zonesIn } from '../standing-zones';

describe('zonas de la clasificación', () => {
  it('enseña sólo las zonas que hay, de arriba abajo', () => {
    expect(
      zonesIn([{ zone: 'relegation' }, { zone: null }, { zone: 'playoffs' }, { zone: 'playoffs' }])
    ).toEqual(['playoffs', 'relegation']);
  });

  it('marca en verde los playoffs y el ascenso, y en granate el descenso', () => {
    expect(zoneCellClass('playoffs', ['playoffs'])).toBe('zone-up');
    expect(zoneCellClass('promotion', ['promotion', 'relegation'])).toBe('zone-up');
    expect(zoneCellClass('relegation', ['relegation'])).toBe('zone-down');
    expect(zoneCellClass(null, ['playoffs'])).toBe('');
  });

  it('separa el ascenso de los playoffs cuando la división tiene los dos', () => {
    const zones = zonesIn([{ zone: 'promotion' }, { zone: 'playoffs' }]);
    expect(zoneCellClass('promotion', zones)).not.toBe(zoneCellClass('playoffs', zones));
    expect(zoneSwatchClass('promotion', zones)).not.toBe(zoneSwatchClass('playoffs', zones));
  });
});
