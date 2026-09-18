/** Formateo compartido. Todo el dinero viaja en céntimos; aquí es donde se pinta. */

// En español, por norma, las cifras de cuatro dígitos van sin punto («9500»),
// pero en una tabla de aforos o de dinero eso descuadra la lectura: 9500 junto
// a 10.262 parece otra magnitud. Aquí se agrupan siempre.
const CURRENCY = new Intl.NumberFormat('es-ES', {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 0,
  useGrouping: 'always'
});

const WHOLE = new Intl.NumberFormat('es-ES', { useGrouping: 'always' });

const DATE = new Intl.DateTimeFormat('es-ES', {
  day: 'numeric',
  month: 'long',
  year: 'numeric'
});

export function formatMoney(cents: number): string {
  return CURRENCY.format(Math.round(cents / 100));
}

/** Un entero con el punto de los miles siempre: «9.500», «10.262». */
export function formatWhole(value: number): string {
  return WHOLE.format(value);
}

const POINTS = new Intl.NumberFormat('es-ES', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
  useGrouping: 'always'
});

/** Puntos del ranking de entrenadores, siempre con un decimal: «12,5», «2,0». */
export function formatPoints(value: number): string {
  return POINTS.format(value);
}

export function formatGameDate(milliseconds: number): string {
  return DATE.format(new Date(milliseconds));
}

/** Altura en metros, con la coma decimal: «2,06 m». */
export function formatHeight(centimetres: number): string {
  return `${(centimetres / 100).toFixed(2).replace('.', ',')} m`;
}

const MATCH_DATE = new Intl.DateTimeFormat('es-ES', {
  weekday: 'long',
  day: 'numeric',
  month: 'long'
});

/** Fecha de partido: «domingo, 12 de octubre», sin año, que ya está en la cabecera. */
export function formatMatchDate(milliseconds: number): string {
  return MATCH_DATE.format(new Date(milliseconds));
}

const SHORT_DATE = new Intl.DateTimeFormat('es-ES', {
  timeZone: 'UTC',
  day: 'numeric',
  month: 'short'
});

/** Fecha corta para listas apretadas: «21 nov». */
export function formatShortDate(milliseconds: number): string {
  return SHORT_DATE.format(new Date(milliseconds)).replace('.', '');
}

/** Minutos jugados en formato acta: `MM:SS`. */
export function formatPlayedMinutes(secondsPlayed: number): string {
  const minutes = Math.floor(secondsPlayed / 60);
  return `${minutes}:${String(secondsPlayed % 60).padStart(2, '0')}`;
}
