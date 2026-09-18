import { and, desc, eq, inArray, like } from 'drizzle-orm';
import type { SaveDatabase } from '../../database/client';
import {
  competitionsTable,
  gamesTable,
  gameStateTable,
  seasonsTable,
  teamsTable
} from '../../database/schema/save';

/** Lo que el calendario necesita de un equipo: nombre, bandera y pabellón. */
export interface CalendarTeamRow {
  id: string;
  name: string;
  nationalOf: string | null;
  pavilionName: string;
}

export class CalendarRepository {
  constructor(private readonly db: SaveDatabase) {}

  currentDate(): Date {
    const state = this.db.select().from(gameStateTable).get();
    if (!state) {
      throw new Error('La partida no tiene estado de juego');
    }
    return state.currentDate;
  }

  /** Los equipos de un mes de partidos, de una sola consulta. */
  teams(teamIds: readonly string[]): Map<string, CalendarTeamRow> {
    if (teamIds.length === 0) {
      return new Map();
    }
    return new Map(
      this.db
        .select({
          id: teamsTable.id,
          name: teamsTable.name,
          nationalOf: teamsTable.nationalOf,
          pavilionName: teamsTable.pavilionName
        })
        .from(teamsTable)
        .where(inArray(teamsTable.id, [...new Set(teamIds)]))
        .all()
        .map((row) => [row.id, row])
    );
  }

  /** El día del último partido que hay en el calendario de una temporada. */
  lastGameDate(seasonId: string): Date | null {
    return (
      this.db
        .select({ scheduledOn: gamesTable.scheduledOn })
        .from(gamesTable)
        .where(eq(gamesTable.seasonId, seasonId))
        .orderBy(desc(gamesTable.scheduledOn))
        .get()?.scheduledOn ?? null
    );
  }

  /** Si el curso tiene partidos de selecciones: con muy pocas no hay clasificación. */
  hasNationalGames(seasonNumber: number): boolean {
    return (
      this.db
        .select({ id: gamesTable.id })
        .from(gamesTable)
        .innerJoin(seasonsTable, eq(seasonsTable.id, gamesTable.seasonId))
        .innerJoin(competitionsTable, eq(competitionsTable.id, seasonsTable.competitionId))
        .where(
          and(
            eq(seasonsTable.seasonNumber, seasonNumber),
            like(competitionsTable.format, 'national%')
          )
        )
        .get() !== undefined
    );
  }
}
