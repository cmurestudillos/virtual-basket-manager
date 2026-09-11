import { describe, expect, it } from 'vitest';
import {
  CHAMPION_PRIZE_CENTS,
  EXPANSION_COST_PER_SEAT_CENTS,
  MONTHS_PER_SEASON,
  expansionCostCents,
  monthlyMaintenanceCents,
  monthlyWagesCents,
  seasonPrizeCents,
  seasonSponsorshipCents,
  seasonTvRightsCents,
  tierFactor
} from '../finance';

describe('nóminas y mantenimiento', () => {
  it('la ficha anual se paga en doce mensualidades', () => {
    expect(monthlyWagesCents(1_200_000_00) * MONTHS_PER_SEASON).toBe(1_200_000_00);
  });

  it('un pabellón más grande cuesta más de mantener', () => {
    expect(monthlyMaintenanceCents(12_000)).toBeGreaterThan(monthlyMaintenanceCents(6_000));
  });
});

describe('ingresos fijos', () => {
  it('el club grande ingresa mucho más que el pequeño, no un poco más', () => {
    const grande = seasonTvRightsCents(81);
    const pequeno = seasonTvRightsCents(33);

    expect(grande).toBeGreaterThan(pequeno * 2.5);
  });

  it('el patrocinio también mira el tamaño del pabellón', () => {
    expect(seasonSponsorshipCents(60, 12_000)).toBeGreaterThan(seasonSponsorshipCents(60, 6_000));
  });

  it('todo sale en céntimos enteros', () => {
    for (const value of [
      seasonTvRightsCents(57),
      seasonSponsorshipCents(57, 8_333),
      seasonPrizeCents(4, 18, false)
    ]) {
      expect(Number.isInteger(value)).toBe(true);
    }
  });
});

describe('premios', () => {
  it('acabar primero paga mucho más que acabar último', () => {
    expect(seasonPrizeCents(1, 18, false)).toBeGreaterThan(seasonPrizeCents(18, 18, false) * 10);
  });

  it('el título suma su propio premio', () => {
    expect(seasonPrizeCents(1, 18, true) - seasonPrizeCents(1, 18, false)).toBe(
      CHAMPION_PRIZE_CENTS
    );
  });

  it('sin liga detrás, sólo cobra el campeón', () => {
    expect(seasonPrizeCents(0, 0, false)).toBe(0);
    expect(seasonPrizeCents(0, 0, true)).toBe(CHAMPION_PRIZE_CENTS);
  });

  it('en segunda se cobra una fracción de lo de primera', () => {
    // Tiene que doler: si bajar costara poco dinero, el descenso sería sólo un
    // cambio de rivales y la mitad de abajo de la tabla no se jugaría nada.
    expect(seasonPrizeCents(1, 18, false, 2)).toBe(
      Math.round(seasonPrizeCents(1, 18, false) * tierFactor(2))
    );
    expect(tierFactor(2)).toBeLessThan(0.5);
    expect(tierFactor(1)).toBe(1);
    // Y una categoría que no existe no multiplica el premio.
    expect(tierFactor(0)).toBe(1);
  });
});

describe('obras', () => {
  it('la ampliación se cobra por asiento', () => {
    expect(expansionCostCents(1_000)).toBe(1_000 * EXPANSION_COST_PER_SEAT_CENTS);
    expect(expansionCostCents(-5)).toBe(0);
  });
});
