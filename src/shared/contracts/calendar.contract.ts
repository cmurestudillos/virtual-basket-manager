import { z } from 'zod';
import type { CalendarEventKind } from '@shared/domain/calendar-events';
import type { MonthRef } from '@shared/domain/calendar-month';
import type { CompetitionKind } from '@shared/domain/competition-kind';

/** El mes que se pide: el año y el mes, de 1 (enero) a 12. */
export const calendarMonthRequestSchema = z.object({
  year: z.number().int().min(1900).max(9999),
  month: z.number().int().min(1).max(12)
});

export type CalendarMonthRequest = z.infer<typeof calendarMonthRequestSchema>;

/** De qué banquillo es un partido: el del club o el de la selección. */
export type CalendarScope = 'club' | 'national';

export interface CalendarTeam {
  teamId: string;
  name: string;
  /** Código del país si es una selección: lleva bandera en vez de escudo. */
  nationOf: string | null;
}

/** Un partido del usuario, con lo que pinta su día en el calendario. */
export interface CalendarGame {
  gameId: string;
  scope: CalendarScope;
  scheduledOn: number;
  competitionId: string;
  competitionName: string;
  /** El tipo de competición, que decide el color (`competitionKind`). */
  kind: CompetitionKind;
  /** «Jornada 12», «Cuartos de final», «Semifinales · 2º partido»: sin el nombre de la competición. */
  roundLabel: string;
  /** Dónde juega el usuario. */
  side: 'home' | 'away';
  neutralVenue: boolean;
  /** El pabellón del local. En sede neutral, el de la sede. */
  venue: string;
  /** El equipo del usuario: su club o su selección. */
  team: CalendarTeam;
  rival: CalendarTeam;
  homeScore: number | null;
  awayScore: number | null;
  overtimes: number;
  played: boolean;
  /** Si ganó el usuario; `null` sin jugar. */
  won: boolean | null;
}

/** Algo que pasa un día sin ser un partido: nóminas, mercado, selecciones. */
export interface CalendarDayEvent {
  on: number;
  kind: CalendarEventKind;
  label: string;
  short: string;
  /** Del club, o de todos (`null`). */
  scope: 'club' | null;
}

export interface CalendarMonth extends MonthRef {
  /** Hoy en el juego, para recuadrarlo. */
  today: number;
  /** Los meses de la temporada en curso: no se navega fuera de ellos. */
  first: MonthRef;
  last: MonthRef;
  /** Los banquillos del usuario con partidos este curso: con los dos, se elige cuál ver. */
  scopes: CalendarScope[];
  /**
   * Los partidos del usuario en el mes, ya sorteados. Lo que aún no se ha
   * sorteado (Copa, cuadros, playoffs) no sale.
   */
  games: CalendarGame[];
  events: CalendarDayEvent[];
}

export interface CalendarApi {
  /** Un mes de la temporada en curso; fuera de ella, el mes más cercano que sí lo es. */
  getMonth: (request: CalendarMonthRequest) => Promise<CalendarMonth>;
}
