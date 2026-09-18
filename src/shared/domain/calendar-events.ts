/**
 * Lo que pasa en el club un día cualquiera aunque no haya partido: nóminas,
 * mercado, selecciones e inicio de temporada. Son los puntos del calendario
 * mensual.
 *
 * Todo sale de reglas de fecha que ya existen —`windowFor` para el mercado,
 * `callupDate` y `dutyPeriod` para las selecciones, el primero de mes del reloj
 * para las nóminas—, así que aquí no se decide nada nuevo: sólo se cuenta en el
 * calendario lo que el reloj va a hacer.
 *
 * Lo que depende de un sorteo (la Copa, los cuadros continentales, los playoffs,
 * las eliminatorias del Mundial) **no** sale: hasta que se sortea no se sabe si
 * el club lo juega, y un aviso de algo que igual no pasa confunde más que ayuda
 * (decisión del usuario, fase 5).
 *
 * Funciones puras, en UTC como el resto del reloj.
 */

import { windowFor, type TransferWindow } from './market';
import { NATIONAL_WINDOWS, callupDate, dutyPeriod, type NationalWindow } from './national-teams';

export type CalendarEventKind =
  | 'season-start'
  | 'payroll'
  | 'market-opens'
  | 'market-closes'
  | 'national-callup'
  | 'national-window-start'
  | 'national-window-end';

export interface CalendarEvent {
  /** El día, a las 00:00 UTC. */
  on: Date;
  kind: CalendarEventKind;
  /** La frase entera, para el panel del día. */
  label: string;
  /** Una o dos palabras, para la casilla. */
  short: string;
  /**
   * A quién le toca: al club (`club`) o a todos (`null`). Una ventana de
   * selecciones es de las dos: la selección juega y el club se queda sin sus
   * convocados.
   */
  scope: 'club' | null;
}

export interface CalendarEventsInput {
  /** Primer y último día que se miran, los dos incluidos. */
  from: Date;
  to: Date;
  seasonStartYear: number;
  /** Si el usuario dirige un club: sin club no hay nóminas ni mercado que contar. */
  hasClub: boolean;
  /**
   * El último día de la liga del club, si ya se sabe: la liga ha terminado o no
   * tiene playoffs. Después es verano y no se cobra. Con playoffs por jugar no
   * se sabe (depende del cuadro) y se da por hecho que llega a junio.
   */
  leagueEndsOn: Date | null;
  /** Si este curso hay clasificación de selecciones (con muy pocas no la hay). */
  nationalWindows: boolean;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** El orden dentro de un mismo día: lo más general primero. */
const KIND_ORDER: readonly CalendarEventKind[] = [
  'season-start',
  'payroll',
  'market-opens',
  'market-closes',
  'national-callup',
  'national-window-start',
  'national-window-end'
];

const MARKET_NAME: Record<Exclude<TransferWindow, 'closed'>, string> = {
  summer: 'mercado de verano',
  winter: 'mercado de invierno'
};

const NATIONAL_WINDOW_NAME: Record<NationalWindow, string> = {
  november: 'de noviembre',
  february: 'de febrero',
  summer: 'de verano'
};

export function calendarEvents(input: CalendarEventsInput): CalendarEvent[] {
  const from = startOfDay(input.from);
  const to = startOfDay(input.to);
  const inRange = (date: Date): boolean =>
    date.getTime() >= from.getTime() && date.getTime() <= to.getTime();
  const events: CalendarEvent[] = [];

  const seasonStart = new Date(Date.UTC(input.seasonStartYear, 8, 1));
  if (inRange(seasonStart)) {
    const next = String((input.seasonStartYear + 1) % 100).padStart(2, '0');
    events.push({
      on: seasonStart,
      kind: 'season-start',
      label: `Empieza la temporada ${input.seasonStartYear}-${next}`,
      short: 'Temporada',
      scope: null
    });
  }

  for (let time = from.getTime(); time <= to.getTime(); time += DAY_MS) {
    const day = new Date(time);

    if (input.hasClub && isPayday(day, seasonStart, input.leagueEndsOn)) {
      events.push({
        on: day,
        kind: 'payroll',
        label: 'Nóminas de la plantilla y del cuerpo técnico',
        short: 'Nóminas',
        scope: 'club'
      });
    }

    const window = windowFor(day);
    if (input.hasClub && window !== 'closed') {
      if (windowFor(new Date(time - DAY_MS)) !== window) {
        events.push({
          on: day,
          kind: 'market-opens',
          label: `Abre el ${MARKET_NAME[window]}`,
          short: 'Mercado',
          scope: 'club'
        });
      }
      if (windowFor(new Date(time + DAY_MS)) !== window) {
        events.push({
          on: day,
          kind: 'market-closes',
          label: `Último día del ${MARKET_NAME[window]}`,
          short: 'Mercado',
          scope: 'club'
        });
      }
    }
  }

  if (input.nationalWindows) {
    for (const window of NATIONAL_WINDOWS) {
      const name = NATIONAL_WINDOW_NAME[window];
      const period = dutyPeriod(input.seasonStartYear, window);
      const candidates: CalendarEvent[] = [
        {
          on: callupDate(input.seasonStartYear, window),
          kind: 'national-callup',
          label: `Listas de las selecciones para la ventana ${name}`,
          short: 'Listas',
          scope: null
        },
        {
          on: period.from,
          kind: 'national-window-start',
          label: `Empieza la ventana de selecciones ${name}`,
          short: 'Selecciones',
          scope: null
        }
      ];
      // El verano acaba con la final del Mundial, que es una ronda sin sortear.
      if (window !== 'summer') {
        candidates.push({
          on: period.to,
          kind: 'national-window-end',
          label: `Acaba la ventana de selecciones ${name}`,
          short: 'Selecciones',
          scope: null
        });
      }
      events.push(...candidates.filter((event) => inRange(event.on)));
    }
  }

  return events.sort(
    (a, b) =>
      a.on.getTime() - b.on.getTime() || KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind)
  );
}

/**
 * Si ese día se cobran las nóminas: el primero de cada mes una vez empezada la
 * temporada, mientras la liga del club siga viva. Es la misma regla del reloj
 * (`advanceCalendar`): el día de arranque no se cobra, y con la liga acabada es
 * verano y tampoco.
 */
export function isPayday(day: Date, seasonStart: Date, leagueEndsOn: Date | null): boolean {
  if (day.getUTCDate() !== 1 || day.getTime() <= seasonStart.getTime()) {
    return false;
  }
  if (leagueEndsOn) {
    return day.getTime() <= leagueEndsOn.getTime();
  }
  // Sin fecha de final, julio y agosto ya son verano.
  const month = day.getUTCMonth();
  return month !== 6 && month !== 7;
}

function startOfDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}
