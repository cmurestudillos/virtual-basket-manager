/**
 * Tonos del juego.
 *
 * Un tono es lo que **significa** un dato, no de qué color se pinta: `good` es
 * «esto va bien», `bad` es «esto va mal». Los componentes del kit traducen el
 * tono a color en un único sitio, así que cambiar lo que significa verde no
 * obliga a recorrer catorce pantallas — que es exactamente lo que pasaba con
 * los veinte `text-red-400` y dieciséis `text-emerald-400` sueltos que había.
 */

export type Tone = 'neutral' | 'accent' | 'good' | 'warn' | 'bad';

export const TONE_TEXT: Record<Tone, string> = {
  neutral: 'text-court-300',
  accent: 'text-ball-400',
  good: 'text-good-400',
  warn: 'text-warn-400',
  bad: 'text-bad-400'
};

export const TONE_BORDER: Record<Tone, string> = {
  neutral: 'border-court-700',
  accent: 'border-ball-500',
  good: 'border-good-500',
  warn: 'border-warn-500',
  bad: 'border-bad-500'
};

export const TONE_FILL: Record<Tone, string> = {
  neutral: 'bg-court-600',
  accent: 'bg-ball-500',
  good: 'bg-good-500',
  warn: 'bg-warn-500',
  bad: 'bg-bad-500'
};

export const TONE_CHIP: Record<Tone, string> = {
  neutral: 'border-court-600 text-court-300',
  accent: 'border-ball-600 text-ball-400',
  good: 'border-good-500 text-good-400',
  warn: 'border-warn-500 text-warn-400',
  bad: 'border-bad-500 text-bad-400'
};

/**
 * Tono de un porcentaje 0-100 en el que más es mejor: forma física, confianza
 * del consejo, moral. Los cortes son los mismos en todo el juego para que el
 * jugador aprenda a leer el color una sola vez.
 */
export function toneForLevel(value: number): Tone {
  if (value >= 70) return 'good';
  if (value >= 40) return 'warn';
  return 'bad';
}

/** Y el de una diferencia, donde lo que importa es el signo. */
export function toneForDelta(value: number): Tone {
  if (value > 0) return 'good';
  if (value < 0) return 'bad';
  return 'neutral';
}
