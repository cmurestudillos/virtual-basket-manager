import { describe, expect, it } from 'vitest';
import {
  DANGER_CONFIDENCE,
  DISMISSAL_CONFIDENCE,
  MAX_CONFIDENCE,
  START_CONFIDENCE,
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

  it('el puesto exigido acompaña al objetivo', () => {
    expect(targetPositionFor('title', 18)).toBe(1);
    expect(targetPositionFor('playoffs', 18)).toBe(8);
    expect(targetPositionFor('midtable', 18)).toBe(9);
    expect(targetPositionFor('survive', 18)).toBe(16);
  });
});

describe('confianza', () => {
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
