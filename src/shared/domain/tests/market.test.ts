import { describe, expect, it } from 'vitest';
import {
  MIN_WAGE_CENTS,
  askingPriceCents,
  contractYearsLeft,
  isWindowOpen,
  marketValueCents,
  releaseCostCents,
  respondToOffer,
  wageDemandCents,
  windowFor
} from '../market';

describe('ventanas', () => {
  it('verano de julio a septiembre e invierno en enero', () => {
    expect(windowFor(new Date(Date.UTC(2025, 6, 15)))).toBe('summer');
    expect(windowFor(new Date(Date.UTC(2025, 8, 1)))).toBe('summer');
    expect(windowFor(new Date(Date.UTC(2026, 0, 10)))).toBe('winter');
    expect(windowFor(new Date(Date.UTC(2025, 10, 10)))).toBe('closed');
    expect(windowFor(new Date(Date.UTC(2026, 3, 10)))).toBe('closed');
    expect(isWindowOpen(new Date(Date.UTC(2026, 3, 10)))).toBe(false);
  });
});

describe('contratos', () => {
  it('cuenta las temporadas que quedan', () => {
    const hoy = new Date(Date.UTC(2025, 8, 1));

    expect(contractYearsLeft(new Date(Date.UTC(2026, 5, 30)), hoy)).toBe(1);
    expect(contractYearsLeft(new Date(Date.UTC(2028, 5, 30)), hoy)).toBe(3);
    expect(contractYearsLeft(null, hoy)).toBe(0);
    expect(contractYearsLeft(new Date(Date.UTC(2024, 5, 30)), hoy)).toBe(0);
  });

  it('rescindir cuesta la mitad de lo que queda por pagar', () => {
    expect(releaseCostCents(400_000_00, 2)).toBe(400_000_00);
    expect(releaseCostCents(400_000_00, 0)).toBe(0);
  });
});

describe('precio de traspaso', () => {
  const base = { valueCents: 1_000_000_00, age: 26 };

  it('un contrato largo encarece y uno que acaba lo tira abajo', () => {
    expect(askingPriceCents({ ...base, contractYearsLeft: 4 })).toBeGreaterThan(
      askingPriceCents({ ...base, contractYearsLeft: 1 })
    );
  });

  it('sin contrato no hay traspaso que pagar', () => {
    expect(askingPriceCents({ ...base, contractYearsLeft: 0 })).toBe(0);
  });

  it('el veterano vale menos y el joven más', () => {
    const veterano = askingPriceCents({ ...base, age: 34, contractYearsLeft: 3 });
    const joven = askingPriceCents({ ...base, age: 22, contractYearsLeft: 3 });

    expect(joven).toBeGreaterThan(veterano * 1.5);
  });
});

describe('ficha que pide el jugador', () => {
  it('nunca baja del mínimo de un profesional', () => {
    expect(wageDemandCents({ valueCents: 0, currentWageCents: 0 })).toBe(MIN_WAGE_CENTS);
  });

  it('siempre pide algo más de lo que cobra ahora', () => {
    expect(wageDemandCents({ valueCents: 0, currentWageCents: 500_000_00 })).toBeGreaterThan(
      500_000_00
    );
  });

  it('quien vale mucho cobra mucho, en la proporción del dataset', () => {
    expect(wageDemandCents({ valueCents: 5_000_000_00, currentWageCents: 100_000_00 })).toBe(
      300_000_00
    );
  });
});

describe('respuesta a una oferta', () => {
  const base = {
    askingPriceCents: 1_000_000_00,
    feeCents: 1_000_000_00,
    wageOfferedCents: 300_000_00,
    wageDemandCents: 300_000_00,
    sellerRosterSize: 13,
    minimumRosterSize: 10
  };

  it('con el dinero y la ficha cuadrados, acepta', () => {
    expect(respondToOffer(base).accepted).toBe(true);
  });

  it('admite regatear un poco, pero no tirar el precio', () => {
    expect(respondToOffer({ ...base, feeCents: 960_000_00 }).accepted).toBe(true);
    expect(respondToOffer({ ...base, feeCents: 700_000_00 }).accepted).toBe(false);
  });

  it('si el jugador no gana lo que pide, no firma', () => {
    const decision = respondToOffer({ ...base, wageOfferedCents: 100_000_00 });

    expect(decision.accepted).toBe(false);
    expect(decision.reason).toMatch(/ficha/);
  });

  it('un club con la plantilla justa no vende a nadie', () => {
    const decision = respondToOffer({ ...base, sellerRosterSize: 10, feeCents: 9_000_000_00 });

    expect(decision.accepted).toBe(false);
    expect(decision.reason).toMatch(/plantilla/);
  });
});

describe('valor de mercado', () => {
  it('crece muy rápido con la media', () => {
    const bueno = marketValueCents({ overall: 80, potential: 82, age: 27 });
    const normal = marketValueCents({ overall: 60, potential: 62, age: 27 });

    // Veinte puntos de media casi triplican el precio: es la misma curva con la
    // que el dataset pone valor a las plantillas.
    expect(bueno).toBeGreaterThan(normal * 2.5);
  });

  it('el joven con techo vale más que el veterano igual de bueno', () => {
    const joven = marketValueCents({ overall: 70, potential: 88, age: 21 });
    const veterano = marketValueCents({ overall: 70, potential: 70, age: 35 });

    expect(joven).toBeGreaterThan(veterano * 2);
  });

  it('sale en céntimos enteros', () => {
    expect(Number.isInteger(marketValueCents({ overall: 73, potential: 80, age: 24 }))).toBe(true);
  });
});
