import { describe, expect, it } from 'vitest';
import {
  DANGER_CONFIDENCE,
  DISMISSAL_CONFIDENCE,
  MAX_CONFIDENCE,
  START_CONFIDENCE,
  confidenceAfterDivisionChange,
  confidenceAfterGame,
  confidenceAfterMonth,
  confidenceAfterSeason,
  confidenceLabel,
  objectiveForReputation,
  seasonVerdict,
  targetPositionFor
} from '../board';

describe('objetivos', () => {
  it('a cada club le piden lo suyo', () => {
    expect(objectiveForReputation(85)).toBe('title');
    expect(objectiveForReputation(70)).toBe('semifinals');
    expect(objectiveForReputation(55)).toBe('playoffs');
    expect(objectiveForReputation(42)).toBe('midtable');
    expect(objectiveForReputation(30)).toBe('survive');
  });

  it('en segunda no se pide un título que no existe, se pide subir', () => {
    expect(objectiveForReputation(30, 2)).toBe('promotion');
    // Y al que baja del todo se le pide primero recomponerse.
    expect(objectiveForReputation(12, 2)).toBe('midtable');
    // La categoría manda: la misma reputación en primera es otra cosa.
    expect(objectiveForReputation(30, 1)).toBe('survive');
  });

  it('el puesto exigido acompaña al objetivo', () => {
    expect(targetPositionFor('title', 18)).toBe(1);
    expect(targetPositionFor('playoffs', 18)).toBe(8);
    expect(targetPositionFor('promotion', 18)).toBe(2);
    expect(targetPositionFor('midtable', 18)).toBe(9);
    expect(targetPositionFor('survive', 18)).toBe(16);
  });

  it('el objetivo de ascenso se cumple subiendo, y sólo subiendo', () => {
    const curso = { objective: 'promotion' as const, teams: 18, playoffRound: 0, champion: false };

    expect(seasonVerdict({ ...curso, position: 1 })).toBe('met');
    expect(seasonVerdict({ ...curso, position: 2 })).toBe('met');
    // Tercero es quedarse fuera por un puesto, que no es lo mismo que subir.
    expect(seasonVerdict({ ...curso, position: 3 })).toBe('failed');
  });

  it('subir y bajar de categoría pesan más que cualquier temporada', () => {
    const subiendo = confidenceAfterDivisionChange(50, 'promoted');
    const bajando = confidenceAfterDivisionChange(50, 'relegated');

    expect(subiendo).toBeGreaterThan(50);
    expect(bajando).toBeLessThan(50);
    // Y no se salen de la escala por mucho que se acumulen.
    expect(confidenceAfterDivisionChange(95, 'promoted')).toBeLessThanOrEqual(100);
    expect(confidenceAfterDivisionChange(5, 'relegated')).toBeGreaterThanOrEqual(0);
  });
});

describe('confianza', () => {
  it('lo de fuera de la liga pesa la mitad, y nunca en contra', () => {
    // Quince partidos contra la élite del continente no pueden costarle el
    // puesto a un entrenador que va bien en su liga.
    expect(confidenceAfterGame(60, { won: false, expectedToWin: false, secondary: true })).toBe(60);
    expect(confidenceAfterGame(60, { won: true, expectedToWin: false, secondary: true })).toBe(61);
    // Perder contra quien debías ganar sí resta, pero menos.
    expect(confidenceAfterGame(60, { won: false, expectedToWin: true, secondary: true })).toBe(59);
    expect(confidenceAfterGame(60, { won: false, expectedToWin: true })).toBe(57);
  });

  it('perder contra quien debías ganar duele el triple', () => {
    const tropiezo = confidenceAfterGame(60, { won: false, expectedToWin: true });
    const derrotaLogica = confidenceAfterGame(60, { won: false, expectedToWin: false });

    expect(60 - tropiezo).toBe(3);
    expect(60 - derrotaLogica).toBe(1);
  });

  it('ganar donde no se esperaba suma más', () => {
    expect(confidenceAfterGame(60, { won: true, expectedToWin: false })).toBeGreaterThan(
      confidenceAfterGame(60, { won: true, expectedToWin: true })
    );
  });

  it('no se sale de la escala', () => {
    expect(confidenceAfterGame(MAX_CONFIDENCE, { won: true, expectedToWin: false })).toBe(
      MAX_CONFIDENCE
    );
    expect(confidenceAfterGame(1, { won: false, expectedToWin: true })).toBe(DISMISSAL_CONFIDENCE);
  });

  it('el repaso mensual mira la tabla y la caja', () => {
    const bien = confidenceAfterMonth(50, {
      position: 2,
      targetPosition: 8,
      balanceCents: 1_000_000_00
    });
    const mal = confidenceAfterMonth(50, {
      position: 15,
      targetPosition: 8,
      balanceCents: 1_000_000_00
    });
    const enRojo = confidenceAfterMonth(50, {
      position: 2,
      targetPosition: 8,
      balanceCents: -1_00
    });

    expect(bien).toBeGreaterThan(50);
    expect(mal).toBeLessThan(50);
    // Ir segundo no salva de estar en números rojos.
    expect(enRojo).toBeLessThan(bien);
    // Y el repaso no es simétrico: ir por detrás resta menos de lo que suma ir
    // por delante, porque quien juzga de verdad es el veredicto de junio. Sin
    // eso, a un club al que se le pide el título se le acababa la paciencia en
    // enero por ir tercero.
    expect(50 - mal).toBeLessThan(bien - 50);
  });

  it('el cierre de temporada pesa más que cualquier partido', () => {
    // Fallar un objetivo desde la confianza de partida te deja justo en la
    // línea de peligro: una temporada mala no te echa, dos sí.
    expect(confidenceAfterSeason(START_CONFIDENCE, 'failed')).toBeLessThanOrEqual(
      DANGER_CONFIDENCE
    );
    expect(confidenceAfterSeason(START_CONFIDENCE, 'exceeded')).toBeGreaterThan(80);
  });

  it('pone nombre a la paciencia que queda', () => {
    expect(confidenceLabel(80)).toBe('Plena confianza');
    expect(confidenceLabel(55)).toBe('Confianza');
    expect(confidenceLabel(35)).toBe('Dudas');
    expect(confidenceLabel(10)).toBe('En la cuerda floja');
    expect(confidenceLabel(0)).toBe('Destituido');
  });
});

describe('veredicto de la temporada', () => {
  const base = { teams: 18, playoffRound: 0, champion: false };

  it('al que le piden el título, sólo vale la final', () => {
    expect(seasonVerdict({ ...base, objective: 'title', position: 1, playoffRound: 2 })).toBe(
      'failed'
    );
    expect(seasonVerdict({ ...base, objective: 'title', position: 1, playoffRound: 3 })).toBe(
      'met'
    );
    expect(
      seasonVerdict({ ...base, objective: 'title', position: 1, playoffRound: 3, champion: true })
    ).toBe('met');
  });

  it('ganar el título siempre supera cualquier otro objetivo', () => {
    expect(
      seasonVerdict({ ...base, objective: 'survive', position: 9, playoffRound: 3, champion: true })
    ).toBe('exceeded');
  });

  it('clasificarse cumple, y llegar lejos supera', () => {
    expect(seasonVerdict({ ...base, objective: 'playoffs', position: 7, playoffRound: 1 })).toBe(
      'met'
    );
    expect(seasonVerdict({ ...base, objective: 'playoffs', position: 7, playoffRound: 2 })).toBe(
      'exceeded'
    );
    expect(seasonVerdict({ ...base, objective: 'playoffs', position: 12 })).toBe('failed');
  });

  it('al pequeño le basta con no bajar, y entrar en el cuadro es una fiesta', () => {
    expect(seasonVerdict({ ...base, objective: 'survive', position: 15 })).toBe('met');
    expect(seasonVerdict({ ...base, objective: 'survive', position: 17 })).toBe('failed');
    expect(seasonVerdict({ ...base, objective: 'survive', position: 8, playoffRound: 1 })).toBe(
      'exceeded'
    );
  });
});
