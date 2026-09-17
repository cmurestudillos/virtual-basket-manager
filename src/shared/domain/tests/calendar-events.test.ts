import { describe, expect, it } from 'vitest';
import { calendarEvents, isPayday, type CalendarEventsInput } from '../calendar-events';
import {
  clampMonth,
  monthCells,
  monthFromIndex,
  monthIndex,
  monthRange,
  seasonMonths
} from '../calendar-month';
import { callupDate, dutyPeriod } from '../national-teams';

/** Lo que pasa cada día del calendario mensual aunque no haya partido. */

const START_YEAR = 2025;

function month(year: number, value: number, overrides: Partial<CalendarEventsInput> = {}) {
  const { from, to } = monthRange({ year, month: value });
  return calendarEvents({
    from,
    to,
    seasonStartYear: START_YEAR,
    hasClub: true,
    leagueEndsOn: null,
    nationalWindows: true,
    ...overrides
  });
}

function day(year: number, monthValue: number, dayValue: number): number {
  return Date.UTC(year, monthValue - 1, dayValue);
}

function kindsOn(events: ReturnType<typeof calendarEvents>, date: number): string[] {
  return events.filter((event) => event.on.getTime() === date).map((event) => event.kind);
}

describe('calendarEvents', () => {
  it('septiembre: arranca la temporada, que no cobra, y el último día del mercado de verano', () => {
    const events = month(2025, 9);

    expect(kindsOn(events, day(2025, 9, 1))).toEqual(['season-start']);
    expect(events[0]?.label).toBe('Empieza la temporada 2025-26');
    expect(kindsOn(events, day(2025, 9, 30))).toEqual(['market-closes']);
    expect(events.filter((event) => event.kind === 'payroll')).toHaveLength(0);
  });

  it('octubre: nóminas el día 1 y nada más', () => {
    const events = month(2025, 10);

    expect(events.map((event) => [event.on.getTime(), event.kind])).toEqual([
      [day(2025, 10, 1), 'payroll']
    ]);
  });

  it('enero: nóminas y el mercado de invierno abre y cierra', () => {
    const events = month(2026, 1);

    expect(kindsOn(events, day(2026, 1, 1))).toEqual(['payroll', 'market-opens']);
    expect(kindsOn(events, day(2026, 1, 31))).toEqual(['market-closes']);
    expect(events.find((event) => event.kind === 'market-opens')?.label).toBe(
      'Abre el mercado de invierno'
    );
  });

  it('verano: sin nóminas en julio ni en agosto, y abre el mercado', () => {
    const july = month(2026, 7);
    const august = month(2026, 8);

    expect(july.some((event) => event.kind === 'payroll')).toBe(false);
    expect(august.some((event) => event.kind === 'payroll')).toBe(false);
    expect(kindsOn(july, day(2026, 7, 1))).toEqual(['market-opens']);
  });

  it('con la liga acabada en mayo, junio ya no cobra', () => {
    const endsInMay = new Date(day(2026, 5, 17));

    expect(month(2026, 6).some((event) => event.kind === 'payroll')).toBe(true);
    expect(month(2026, 6, { leagueEndsOn: endsInMay }).some((e) => e.kind === 'payroll')).toBe(
      false
    );
    expect(month(2026, 5, { leagueEndsOn: endsInMay }).some((e) => e.kind === 'payroll')).toBe(
      true
    );
  });

  it('sin club no hay nóminas ni mercado, pero sí selecciones', () => {
    const events = month(2025, 11, { hasClub: false });

    expect(events.every((event) => event.scope === null)).toBe(true);
    expect(events.map((event) => event.kind)).toEqual([
      'national-callup',
      'national-window-start',
      'national-window-end'
    ]);
  });

  it('las ventanas de selecciones en las fechas del reloj de selecciones', () => {
    const events = month(2025, 11);
    const period = dutyPeriod(START_YEAR, 'november');

    expect(kindsOn(events, callupDate(START_YEAR, 'november').getTime())).toEqual([
      'national-callup'
    ]);
    expect(kindsOn(events, period.from.getTime())).toEqual(['national-window-start']);
    expect(kindsOn(events, period.to.getTime())).toEqual(['national-window-end']);
  });

  it('el verano de selecciones empieza, pero su final no sale: depende del Mundial', () => {
    const events = month(2026, 8);
    const period = dutyPeriod(START_YEAR, 'summer');

    expect(kindsOn(events, period.from.getTime())).toContain('national-window-start');
    expect(events.some((event) => event.kind === 'national-window-end')).toBe(false);
  });

  it('sin clasificación de selecciones no hay ventanas', () => {
    expect(
      month(2025, 11, { nationalWindows: false }).some((e) => e.kind.startsWith('national'))
    ).toBe(false);
  });

  it('las nóminas: el primero de mes después del arranque', () => {
    const seasonStart = new Date(day(2025, 9, 1));

    expect(isPayday(new Date(day(2025, 9, 1)), seasonStart, null)).toBe(false);
    expect(isPayday(new Date(day(2025, 12, 2)), seasonStart, null)).toBe(false);
    expect(isPayday(new Date(day(2026, 3, 1)), seasonStart, null)).toBe(true);
  });
});

describe('el mes en rejilla', () => {
  it('empieza en lunes: diciembre de 2024 empieza en domingo', () => {
    const cells = monthCells({ year: 2024, month: 12 });

    expect(cells.slice(0, 6).every((cell) => cell === null)).toBe(true);
    expect(cells[6]).toEqual({ day: 1, date: day(2024, 12, 1) });
    expect(cells).toHaveLength(42);
  });

  it('con seis semanas fijas, febrero también ocupa seis', () => {
    // Febrero de 2027 empieza en lunes y cabe en cuatro semanas.
    expect(monthCells({ year: 2027, month: 2 })).toHaveLength(28);
    expect(monthCells({ year: 2027, month: 2 }, 6)).toHaveLength(42);
  });

  it('la temporada va de septiembre a agosto, o hasta hoy si se alarga', () => {
    expect(seasonMonths(2025)).toEqual({
      first: { year: 2025, month: 9 },
      last: { year: 2026, month: 8 }
    });
    expect(seasonMonths(2025, day(2026, 9, 3)).last).toEqual({ year: 2026, month: 9 });
  });

  it('un mes fuera de la temporada se lleva al borde', () => {
    const bounds = seasonMonths(2025);

    expect(clampMonth({ year: 2025, month: 3 }, bounds)).toEqual({ year: 2025, month: 9 });
    expect(clampMonth({ year: 2027, month: 1 }, bounds)).toEqual({ year: 2026, month: 8 });
    expect(monthFromIndex(monthIndex({ year: 2026, month: 12 }))).toEqual({
      year: 2026,
      month: 12
    });
  });
});
