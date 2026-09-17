import { describe, expect, it } from 'vitest';
import {
  DEFAULT_MORALE,
  expectedMinutes,
  moraleAfterGame,
  moraleAfterRest,
  moraleAttributeOffset,
  moraleLabel,
  moraleLevel,
  moraleRecoveryPoints,
  refusesToRenew,
  renewalWageFactor,
  squadMorale,
  trainingMoraleDelta
} from '../morale';

/** La moral: qué la mueve y qué hace. */

describe('los minutos y los resultados', () => {
  it('un titular que no juega se enfada aunque gane el equipo', () => {
    const sentado = moraleAfterGame({
      morale: 70,
      minutesPlayed: 0,
      roleRank: 2,
      won: true,
      margin: 5
    });
    expect(sentado).toBeLessThan(70);
  });

  it('un titular con sus minutos y una victoria, contento', () => {
    const jugando = moraleAfterGame({
      morale: 70,
      minutesPlayed: 30,
      roleRank: 2,
      won: true,
      margin: 5
    });
    expect(jugando).toBeGreaterThan(70);
  });

  it('el último de la plantilla no espera jugar, y agradece los minutos que le caen', () => {
    expect(expectedMinutes(12)).toBe(0);
    expect(
      moraleAfterGame({ morale: 70, minutesPlayed: 0, roleRank: 12, won: true, margin: 3 })
    ).toBe(71);
    expect(
      moraleAfterGame({ morale: 70, minutesPlayed: 10, roleRank: 12, won: true, margin: 3 })
    ).toBe(72);
  });

  it('las palizas pesan más que las derrotas ajustadas', () => {
    const ajustada = moraleAfterGame({
      morale: 70,
      minutesPlayed: 28,
      roleRank: 1,
      won: false,
      margin: 2
    });
    const paliza = moraleAfterGame({
      morale: 70,
      minutesPlayed: 28,
      roleRank: 1,
      won: false,
      margin: 25
    });
    expect(paliza).toBeLessThan(ajustada);
  });

  it('nunca se sale de la escala', () => {
    expect(
      moraleAfterGame({ morale: 0, minutesPlayed: 0, roleRank: 1, won: false, margin: 40 })
    ).toBe(0);
    expect(
      moraleAfterGame({ morale: 100, minutesPlayed: 40, roleRank: 1, won: true, margin: 40 })
    ).toBe(100);
  });
});

describe('el tiempo y el entrenamiento', () => {
  it('sin nada que lo mueva, vuelve a lo normal', () => {
    expect(moraleAfterRest(40, 3)).toBe(43);
    expect(moraleAfterRest(90, 3)).toBe(87);
    expect(moraleAfterRest(69, 10)).toBe(DEFAULT_MORALE);
    expect(moraleAfterRest(40, 0)).toBe(40);
  });

  it('un punto cada tres días, se avance de golpe o día a día', () => {
    const start = Date.UTC(2025, 8, 1);
    const day = (n: number) => new Date(start + n * 24 * 60 * 60 * 1000);
    const deGolpe = moraleRecoveryPoints(day(0), day(30));
    let diaADia = 0;
    for (let n = 0; n < 30; n += 1) {
      diaADia += moraleRecoveryPoints(day(n), day(n + 1));
    }
    expect(deGolpe).toBe(10);
    expect(diaADia).toBe(deGolpe);
  });

  it('apretar mucho quema y aflojar se agradece', () => {
    expect(trainingMoraleDelta(9)).toBeLessThan(0);
    expect(trainingMoraleDelta(5)).toBe(0);
    expect(trainingMoraleDelta(2)).toBeGreaterThan(0);
  });
});

describe('lo que hace la moral', () => {
  it('en pista, de +4 eufórico a -6 hundido, y nada con el ánimo normal', () => {
    expect(moraleAttributeOffset(70)).toBe(0);
    expect(moraleAttributeOffset(100)).toBe(4);
    expect(moraleAttributeOffset(0)).toBe(-6);
    expect(moraleAttributeOffset(40)).toBeLessThan(0);
  });

  it('el descontento pide más por renovar y el enfadado no renueva', () => {
    expect(renewalWageFactor(30)).toBeGreaterThan(renewalWageFactor(70));
    expect(renewalWageFactor(90)).toBeLessThan(1);
    expect(refusesToRenew(15)).toBe(true);
    expect(refusesToRenew(40)).toBe(false);
  });

  it('se cuenta con palabras', () => {
    expect(moraleLabel(90)).toBe('Eufórico');
    expect(moraleLabel(70)).toBe('Contento');
    expect(moraleLabel(10)).toBe('Enfadado');
  });

  it('tiene cinco niveles, con los mismos cortes que la palabra', () => {
    expect(moraleLevel(85)).toBe('great');
    expect(moraleLevel(84)).toBe('good');
    expect(moraleLevel(65)).toBe('good');
    expect(moraleLevel(64)).toBe('normal');
    expect(moraleLevel(45)).toBe('normal');
    expect(moraleLevel(44)).toBe('low');
    expect(moraleLevel(25)).toBe('low');
    expect(moraleLevel(24)).toBe('bad');
    expect(moraleLabel(50)).toBe('Normal');
    expect(moraleLabel(30)).toBe('Descontento');
  });
});

describe('la confianza de los jugadores', () => {
  it('es la moral media de la plantilla, redondeada', () => {
    expect(squadMorale([70, 80, 91])).toBe(80);
    expect(squadMorale([50])).toBe(50);
  });

  it('sin plantilla no hay confianza que enseñar', () => {
    expect(squadMorale([])).toBeNull();
  });
});
