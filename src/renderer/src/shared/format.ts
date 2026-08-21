/** Formateo compartido. Todo el dinero viaja en céntimos; aquí es donde se pinta. */

const CURRENCY = new Intl.NumberFormat('es-ES', {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 0
});

const DATE = new Intl.DateTimeFormat('es-ES', {
  day: 'numeric',
  month: 'long',
  year: 'numeric'
});

export function formatMoney(cents: number): string {
  return CURRENCY.format(Math.round(cents / 100));
}

export function formatGameDate(milliseconds: number): string {
  return DATE.format(new Date(milliseconds));
}

export function formatHeight(centimetres: number): string {
  return `${(centimetres / 100).toFixed(2)} m`;
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

/** Minutos jugados en formato acta: `MM:SS`. */
export function formatPlayedMinutes(secondsPlayed: number): string {
  const minutes = Math.floor(secondsPlayed / 60);
  return `${minutes}:${String(secondsPlayed % 60).padStart(2, '0')}`;
}
