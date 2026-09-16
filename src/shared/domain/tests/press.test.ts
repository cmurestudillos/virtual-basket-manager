import { describe, expect, it } from 'vitest';
import { DANGER_CONFIDENCE } from '../board';
import {
  PRESS_ANSWERS,
  PRESS_TONES,
  currentStreak,
  pressAnswer,
  pressQuestion,
  pressReaction,
  pressTopicFor,
  type PressContext
} from '../press';

/**
 * Ruedas de prensa.
 *
 * Dos cosas importan de verdad y son las que se comprueban: que no haya rueda
 * de prensa en cada partido, y que **ninguna respuesta sea siempre la buena**.
 * Si una ganara en todo, dejaría de haber decisión.
 */

function context(overrides: Partial<PressContext> = {}): PressContext {
  return {
    won: true,
    margin: 6,
    streak: 1,
    isPlayoff: false,
    confidence: 60,
    opponentName: 'Basket Ríoseco',
    ...overrides
  };
}

describe('cuándo hay rueda de prensa', () => {
  it('un partido normal no da que hablar', () => {
    expect(pressTopicFor(context())).toBeNull();
    expect(pressTopicFor(context({ won: false, margin: -5, streak: -1 }))).toBeNull();
  });

  it('las rachas, las palizas y los playoffs sí', () => {
    expect(pressTopicFor(context({ won: false, margin: -4, streak: -3 }))).toBe('losingStreak');
    expect(pressTopicFor(context({ streak: 4 }))).toBe('winningStreak');
    expect(pressTopicFor(context({ won: false, margin: -25, streak: -1 }))).toBe('heavyDefeat');
    expect(pressTopicFor(context({ margin: 22 }))).toBe('bigWin');
    expect(pressTopicFor(context({ isPlayoff: true }))).toBe('playoffs');
  });

  it('un tema por partido, y manda el que más pesa', () => {
    // Unos playoffs son noticia aunque además haya racha.
    expect(pressTopicFor(context({ isPlayoff: true, streak: 5 }))).toBe('playoffs');
    // Un consejo al borde del despido tapa la paliza.
    expect(
      pressTopicFor(
        context({ won: false, margin: -30, streak: -4, confidence: DANGER_CONFIDENCE - 1 })
      )
    ).toBe('boardPressure');
    // Y la paliza tapa la racha.
    expect(pressTopicFor(context({ won: false, margin: -30, streak: -4 }))).toBe('heavyDefeat');
  });

  it('con el consejo en peligro, ganar no provoca la pregunta del despido', () => {
    expect(pressTopicFor(context({ confidence: DANGER_CONFIDENCE - 1 }))).toBeNull();
  });
});

describe('las preguntas', () => {
  it('llevan el partido dentro', () => {
    expect(pressQuestion('losingStreak', context({ streak: -4 }))).toContain('4 derrotas');
    expect(pressQuestion('heavyDefeat', context({ won: false, margin: -27 }))).toContain('27');
    expect(pressQuestion('bigWin', context({ margin: 21 }))).toContain('Basket Ríoseco');
  });

  it('en playoffs no se pregunta igual ganando que perdiendo', () => {
    expect(pressQuestion('playoffs', context({ won: true }))).not.toBe(
      pressQuestion('playoffs', context({ won: false }))
    );
  });
});

describe('las respuestas', () => {
  it('cada tema tiene sus tres tonos, y cada uno su texto', () => {
    for (const answers of Object.values(PRESS_ANSWERS)) {
      expect(answers.map((answer) => answer.tone).sort()).toEqual([...PRESS_TONES].sort());
      for (const answer of answers) {
        expect(answer.text.length).toBeGreaterThan(20);
      }
    }
  });

  it('ninguna respuesta gana en las dos cosas a la vez a las demás', () => {
    for (const [topic, answers] of Object.entries(PRESS_ANSWERS)) {
      for (const answer of answers) {
        const dominaATodas = answers
          .filter((other) => other !== answer)
          .every(
            (other) =>
              answer.effect.confidence >= other.effect.confidence &&
              answer.effect.support >= other.effect.support
          );
        expect(dominaATodas, `${topic}: «${answer.text}» es siempre la buena`).toBe(false);
      }
    }
  });

  it('los efectos son pequeños: una rueda de prensa no salva un año', () => {
    for (const answers of Object.values(PRESS_ANSWERS)) {
      for (const { effect } of answers) {
        expect(Math.abs(effect.confidence)).toBeLessThanOrEqual(4);
        expect(Math.abs(effect.support)).toBeLessThanOrEqual(4);
      }
    }
  });

  it('se encuentra la respuesta por tema y tono', () => {
    expect(pressAnswer('losingStreak', 'combative').tone).toBe('combative');
  });

  it('la reacción se cuenta en palabras, no en números', () => {
    const reaccion = pressReaction({ confidence: -2, support: 3 });
    expect(reaccion).toContain('grada');
    expect(reaccion).toContain('consejo');
    expect(reaccion).not.toMatch(/\d/);
  });
});

describe('rachas', () => {
  it('cuenta las últimas iguales, con signo', () => {
    expect(currentStreak([])).toBe(0);
    expect(currentStreak([true])).toBe(1);
    expect(currentStreak([false, true, true, true])).toBe(3);
    expect(currentStreak([true, true, false, false])).toBe(-2);
  });
});
