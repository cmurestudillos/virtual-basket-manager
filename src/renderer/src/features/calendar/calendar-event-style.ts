import type { CalendarEventKind } from '@shared/domain/calendar-events';
import type { GameIconName } from '@renderer/features/app-shell/components/GameIcon.vue';

/**
 * Cómo se pintan las citas del club en el calendario mensual: cada tipo con su
 * color y su icono, para que «Nóminas» o «Mercado» se vean de un vistazo en la
 * rejilla y no se pierdan como etiquetas grises.
 *
 * Las siete citas del dominio (`calendar-events.ts`) se agrupan en cuatro: el
 * mercado que abre y el que cierra son el mismo color, y las listas, el
 * principio y el final de una ventana de selecciones, también. Los colores son
 * los tokens `tv-event-*` (ver docs/DESIGN-SYSTEM.md), todos con letra blanca
 * encima; el de selecciones es el mismo que su competición.
 */

export type CalendarEventGroup = 'season' | 'payroll' | 'market' | 'national';

/** El orden de la leyenda. */
export const CALENDAR_EVENT_GROUPS: readonly CalendarEventGroup[] = [
  'season',
  'payroll',
  'market',
  'national'
];

export const CALENDAR_EVENT_GROUP: Record<CalendarEventKind, CalendarEventGroup> = {
  'season-start': 'season',
  payroll: 'payroll',
  'market-opens': 'market',
  'market-closes': 'market',
  'national-callup': 'national',
  'national-window-start': 'national',
  'national-window-end': 'national'
};

export const CALENDAR_EVENT_LABEL: Record<CalendarEventGroup, string> = {
  season: 'Temporada',
  payroll: 'Nóminas',
  market: 'Mercado',
  national: 'Selecciones'
};

/** El color liso con la letra blanca: etiqueta, marca y cuadradito de la leyenda. */
export const CALENDAR_EVENT_FILL: Record<CalendarEventGroup, string> = {
  season: 'bg-tv-event-season text-white',
  payroll: 'bg-tv-event-payroll text-white',
  market: 'bg-tv-event-market text-white',
  national: 'bg-tv-event-national text-white'
};

export const CALENDAR_EVENT_ICON: Record<CalendarEventGroup, GameIconName> = {
  season: 'trophy',
  payroll: 'money',
  market: 'market',
  national: 'national'
};
