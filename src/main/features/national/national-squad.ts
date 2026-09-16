import { and, asc, eq, inArray, isNull } from 'drizzle-orm';
import { NATIONAL_WINDOWS, dutyPeriod, type NationalWindow } from '@shared/domain/national-teams';
import type { SaveDatabase } from '../../database/save-database';
import {
  gameStateTable,
  nationalCallupsTable,
  nationalSpellsTable,
  playersTable,
  seasonsTable,
  teamsTable,
  type PlayerRow
} from '../../database/schema/save';

/**
 * Lo poco de las selecciones que necesitan el motor, la alineación y la
 * pizarra. Va aparte del servicio para que esos módulos no arrastren a toda la
 * competición —y para no crear dependencias circulares con el partido—.
 */

export const QUALIFIERS_COMPETITION_ID = 'mundial-clasificacion';
export const WORLD_CUP_COMPETITION_ID = 'mundial';
export const NATIONAL_TEAMS_COMPETITION_ID = 'selecciones';

/**
 * Los equipos que dirige el usuario: su club y, si la tiene, su selección.
 * El club va primero, que es el que manda cuando hay que elegir uno.
 */
export function userTeamIds(db: SaveDatabase): string[] {
  const club = db.select().from(gameStateTable).get()?.managedTeamId ?? null;
  const national = userNationalTeamId(db);
  return [club, national].filter((id): id is string => id !== null);
}

/** La selección que dirige el usuario, si dirige alguna. */
export function userNationalTeamId(db: SaveDatabase): string | null {
  return (
    db
      .select({ teamId: nationalSpellsTable.teamId })
      .from(nationalSpellsTable)
      .where(isNull(nationalSpellsTable.endSeason))
      .get()?.teamId ?? null
  );
}

export function isNationalTeam(db: SaveDatabase, teamId: string): boolean {
  return Boolean(
    db
      .select({ nationalOf: teamsTable.nationalOf })
      .from(teamsTable)
      .where(eq(teamsTable.id, teamId))
      .get()?.nationalOf
  );
}

/** Temporada en curso y año de arranque de su clasificación, si ya existe. */
function nationalCalendar(db: SaveDatabase): { seasonNumber: number; startYear: number } | null {
  const seasonNumber = db.select().from(gameStateTable).get()?.seasonNumber;
  if (seasonNumber === undefined) {
    return null;
  }
  const qualifiers = db
    .select()
    .from(seasonsTable)
    .where(
      and(
        eq(seasonsTable.competitionId, QUALIFIERS_COMPETITION_ID),
        eq(seasonsTable.seasonNumber, seasonNumber)
      )
    )
    .get();
  return qualifiers ? { seasonNumber, startYear: qualifiers.startYear } : null;
}

/**
 * La ventana que toca en una fecha: la primera que aún no ha terminado. Pasada
 * la de febrero, la de verano, que dura hasta la final del Mundial.
 */
export function windowForDate(startYear: number, date: Date): NationalWindow {
  return (
    NATIONAL_WINDOWS.find(
      (window) => dutyPeriod(startYear, window).to.getTime() >= date.getTime()
    ) ?? 'summer'
  );
}

/** Los convocados de una selección para la ventana que toca en esa fecha. */
export function nationalSquad(db: SaveDatabase, teamId: string, date: Date): PlayerRow[] {
  const calendar = nationalCalendar(db);
  if (!calendar) {
    return [];
  }
  const window = windowForDate(calendar.startYear, date);
  const ids = db
    .select({ playerId: nationalCallupsTable.playerId })
    .from(nationalCallupsTable)
    .where(
      and(
        eq(nationalCallupsTable.nationalTeamId, teamId),
        eq(nationalCallupsTable.seasonNumber, calendar.seasonNumber),
        eq(nationalCallupsTable.window, window)
      )
    )
    .all()
    .map((row) => row.playerId);
  if (ids.length === 0) {
    return [];
  }
  return db
    .select()
    .from(playersTable)
    .where(inArray(playersTable.id, ids))
    .orderBy(asc(playersTable.id))
    .all();
}

/**
 * Los jugadores que están con su selección en esa fecha: no juegan con su
 * club. Fuera de los días de ventana no hay nadie, y ni se consulta.
 */
export function playersOnNationalDuty(db: SaveDatabase, date: Date): Set<string> {
  const calendar = nationalCalendar(db);
  if (!calendar) {
    return new Set();
  }
  const window = NATIONAL_WINDOWS.find((candidate) => {
    const { from, to } = dutyPeriod(calendar.startYear, candidate);
    return date.getTime() >= from.getTime() && date.getTime() <= to.getTime();
  });
  if (!window) {
    return new Set();
  }
  return new Set(
    db
      .select({ playerId: nationalCallupsTable.playerId })
      .from(nationalCallupsTable)
      .where(
        and(
          eq(nationalCallupsTable.seasonNumber, calendar.seasonNumber),
          eq(nationalCallupsTable.window, window)
        )
      )
      .all()
      .map((row) => row.playerId)
  );
}
