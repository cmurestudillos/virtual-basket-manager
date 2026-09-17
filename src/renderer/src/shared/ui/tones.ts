/**
 * Tonos del juego.
 *
 * Un tono es lo que **significa** un dato, no de qué color se pinta: `good` es
 * «esto va bien», `bad` es «esto va mal». Los componentes del kit traducen el
 * tono a color en un único sitio, así que cambiar lo que significa verde no
 * obliga a recorrer catorce pantallas — que es exactamente lo que pasaba con
 * los veinte `text-red-400` y dieciséis `text-emerald-400` sueltos que había.
 *
 * Los colores son los de la piel de IBM y están pensados para ir **sobre papel
 * claro** (`tv-paper`, `tv-cell`): el texto usa las variantes `-ink`, que son
 * las que se leen en letra pequeña.
 */

export type Tone = 'neutral' | 'accent' | 'good' | 'warn' | 'bad';

export const TONE_TEXT: Record<Tone, string> = {
  neutral: 'text-tv-muted',
  accent: 'text-tv-blue-ink',
  good: 'text-tv-green-ink',
  warn: 'text-tv-amber-ink',
  bad: 'text-tv-red'
};

export const TONE_BORDER: Record<Tone, string> = {
  neutral: 'border-tv-box',
  accent: 'border-tv-blue',
  good: 'border-tv-green',
  warn: 'border-tv-amber',
  bad: 'border-tv-red'
};

export const TONE_FILL: Record<Tone, string> = {
  neutral: 'bg-tv-box',
  accent: 'bg-tv-blue',
  good: 'bg-tv-green',
  warn: 'bg-tv-amber',
  bad: 'bg-tv-red'
};

/**
 * La etiqueta rellena. «Lo tuyo» es azul pálido con letra oscura, igual que tu
 * fila en una tabla; el resto, el color del tono con la letra que se lea encima.
 */
export const TONE_CHIP: Record<Tone, string> = {
  neutral: 'bg-tv-box text-tv-ink',
  accent: 'bg-tv-select text-tv-ink',
  good: 'bg-tv-green text-white',
  warn: 'bg-tv-amber text-tv-ink',
  bad: 'bg-tv-red text-white'
};

// ---------------------------------------------------------------------------
// La escala de 0 a 100
// ---------------------------------------------------------------------------

/**
 * Los cuatro tramos de cualquier valor de 0 a 100 —media, atributos, forma
 * física, moral, confianza—, los del anillo de media de IBM. Es **una** escala
 * para todo el juego: si 70 fuera lima en una pantalla y amarillo en otra, el
 * color dejaría de decir nada.
 */
export type RatingBand = 'top' | 'high' | 'mid' | 'low';

/** De mejor a peor. */
export const RATING_BANDS: readonly RatingBand[] = ['top', 'high', 'mid', 'low'];

/** El valor más bajo que entra en cada tramo. */
export const RATING_BAND_FLOOR: Record<RatingBand, number> = {
  top: 80,
  high: 70,
  mid: 60,
  low: 0
};

/** Cómo se cuenta cada tramo en la guía y en las leyendas. */
export const RATING_BAND_LABEL: Record<RatingBand, string> = {
  top: '80 o más',
  high: '70 a 79',
  mid: '60 a 69',
  low: 'menos de 60'
};

/**
 * El tramo de un valor. Se redondea antes de cortar, porque lo que se enseña es
 * el número redondeado: un 79,6 se lee «80» y tiene que pintarse como un 80.
 */
export function bandForValue(value: number): RatingBand {
  const rounded = Math.round(value);
  if (rounded >= RATING_BAND_FLOOR.top) return 'top';
  if (rounded >= RATING_BAND_FLOOR.high) return 'high';
  if (rounded >= RATING_BAND_FLOOR.mid) return 'mid';
  return 'low';
}

/** Relleno: barras, cajas, aros. */
export const RATING_FILL: Record<RatingBand, string> = {
  top: 'bg-tv-rate-top',
  high: 'bg-tv-rate-high',
  mid: 'bg-tv-rate-mid',
  low: 'bg-tv-rate-low'
};

/**
 * Como color de trazo (`currentColor` de un SVG). No sirve para letra sobre
 * papel: el lima y el amarillo no se leen ahí; para una cifra, {@link RATING_CHIP}.
 */
export const RATING_STROKE: Record<RatingBand, string> = {
  top: 'text-tv-rate-top',
  high: 'text-tv-rate-high',
  mid: 'text-tv-rate-mid',
  low: 'text-tv-rate-low'
};

/** Una cifra en su cajita del color del tramo, con la letra que se lee encima. */
export const RATING_CHIP: Record<RatingBand, string> = {
  top: 'bg-tv-rate-top text-tv-ink',
  high: 'bg-tv-rate-high text-tv-ink',
  mid: 'bg-tv-rate-mid text-tv-ink',
  low: 'bg-tv-rate-low text-white'
};

/** El tono de cada tramo, para quien sólo necesita decir «bien, ojo, mal». */
export const TONE_FOR_BAND: Record<RatingBand, Tone> = {
  top: 'good',
  high: 'good',
  mid: 'warn',
  low: 'bad'
};

/**
 * Tono de un valor 0-100 en el que más es mejor. Sale de la escala de cuatro
 * tramos —70 o más va bien, de 60 a 69 es ojo, por debajo va mal— y no de
 * cortes propios, para que el tono y el color de la escala nunca se contradigan.
 */
export function toneForLevel(value: number): Tone {
  return TONE_FOR_BAND[bandForValue(value)];
}

/** Y el de una diferencia, donde lo que importa es el signo. */
export function toneForDelta(value: number): Tone {
  if (value > 0) return 'good';
  if (value < 0) return 'bad';
  return 'neutral';
}
