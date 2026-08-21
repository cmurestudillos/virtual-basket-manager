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
