/**
 * El mes como rejilla de calendario y los meses de una temporada.
 *
 * Los meses van de 1 a 12, como se leen, y no de 0 a 11 como los cuenta `Date`:
 * es lo que viaja por IPC y lo que se escribe en un test, y un «mes 11» que es
 * diciembre es un error esperando a pasar. Todo en UTC, como el resto del reloj
 * del juego (ver `matchdayDate`).
 *
 * Funciones puras: la usan el calendario mensual y el aviso de avance de días.
 */

export interface MonthRef {
  year: number;
  /** De 1 (enero) a 12 (diciembre). */
  month: number;
}

/** Un día de la rejilla; los huecos antes del día 1 y después del último son `null`. */
export interface MonthCell {
  day: number;
  /** El día a las 00:00 UTC, en milisegundos. */
  date: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Días que tiene el mes. */
export function daysInMonth(ref: MonthRef): number {
  return new Date(Date.UTC(ref.year, ref.month, 0)).getUTCDate();
}

/** El mes de una fecha del juego. */
export function monthOf(date: Date | number): MonthRef {
  const value = new Date(date);
  return { year: value.getUTCFullYear(), month: value.getUTCMonth() + 1 };
}

/** El primer instante del mes y el último, los dos dentro del mes. */
export function monthRange(ref: MonthRef): { from: Date; to: Date } {
  return {
    from: new Date(Date.UTC(ref.year, ref.month - 1, 1)),
    to: new Date(Date.UTC(ref.year, ref.month, 1) - 1)
  };
}

/** Un número que crece de mes en mes: para comparar meses y para el paginador. */
export function monthIndex(ref: MonthRef): number {
  return ref.year * 12 + (ref.month - 1);
}

export function monthFromIndex(index: number): MonthRef {
  return { year: Math.floor(index / 12), month: (index % 12) + 1 };
}

/**
 * El mes en semanas de lunes a domingo.
 *
 * Sin `weeks`, tantas semanas como pida el mes (cuatro, cinco o seis); con
 * `weeks`, siempre esas, rellenas de huecos: el calendario mensual lleva seis
 * para que la rejilla no cambie de alto al pasar de febrero a marzo.
 */
export function monthCells(ref: MonthRef, weeks?: number): (MonthCell | null)[] {
  const first = Date.UTC(ref.year, ref.month - 1, 1);
  const lead = (new Date(first).getUTCDay() + 6) % 7;
  const cells: (MonthCell | null)[] = Array.from({ length: lead }, () => null);

  for (let day = 1; day <= daysInMonth(ref); day += 1) {
    cells.push({ day, date: first + (day - 1) * DAY_MS });
  }

  const length = weeks === undefined ? Math.ceil(cells.length / 7) * 7 : weeks * 7;
  while (cells.length < length) {
    cells.push(null);
  }
  return cells;
}

/**
 * Los meses de una temporada: de septiembre, cuando arranca, a agosto, cuando
 * acaba el verano de selecciones. Si el reloj ya ha pasado de agosto —quedan
 * ligas por acabar—, llega hasta el mes de hoy.
 */
export function seasonMonths(
  startYear: number,
  today?: Date | number
): { first: MonthRef; last: MonthRef } {
  const first = { year: startYear, month: 9 };
  const august = { year: startYear + 1, month: 8 };
  const current = today === undefined ? null : monthOf(today);
  const last = current && monthIndex(current) > monthIndex(august) ? current : august;
  return { first, last };
}

/** Lleva un mes dentro de los límites: el de antes del primero es el primero. */
export function clampMonth(ref: MonthRef, bounds: { first: MonthRef; last: MonthRef }): MonthRef {
  const index = Math.min(
    monthIndex(bounds.last),
    Math.max(monthIndex(bounds.first), monthIndex(ref))
  );
  return monthFromIndex(index);
}
