import { and, asc, eq, isNull, or, sql } from 'drizzle-orm';
import type { SaveDatabase } from '../../database/client';
import {
  competitionsTable,
  gamesTable,
  gameStateTable,
  playersTable,
  seasonsTable,
  teamsTable,
  type CompetitionRow,
  type GameRow,
  type PlayerRow,
  type TeamRow
} from '../../database/schema/save';

export interface TeamWithContext {
  id: string;
  name: string;
  shortName: string;
  city: string;
  country: string;
  competitionId: string;
  competitionName: string;
  crest: string | null;
  pavilionName: string;
  pavilionCapacity: number;
  reputation: number;
  budgetCents: number;
  rosterSize: number;
}

/** Un partido del club con la competición a la que pertenece. */
export interface TeamGameWithCompetition {
  game: GameRow;
  competition: CompetitionRow;
}

export class TeamsRepository {
  constructor(private readonly db: SaveDatabase) {}

  list(): TeamWithContext[] {
    // Las selecciones no son clubes: no salen en el listado de equipos.
    return this.baseQuery()
      .where(isNull(teamsTable.nationalOf))
      .orderBy(asc(teamsTable.name))
      .all();
  }

  findById(id: string): TeamWithContext | null {
    return this.baseQuery().where(eq(teamsTable.id, id)).get() ?? null;
  }

  managedTeamId(): string | null {
    return this.db.select().from(gameStateTable).get()?.managedTeamId ?? null;
  }

  /** Fecha y curso del juego: la edad, los contratos y «esta temporada» se miden contra ellos. */
  calendar(): { today: Date; seasonNumber: number } {
    const state = this.db.select().from(gameStateTable).get();
    return { today: state?.currentDate ?? new Date(), seasonNumber: state?.seasonNumber ?? 1 };
  }

  /** La fila entera del equipo con su competición, para la ficha. */
  findWithCompetition(teamId: string): { team: TeamRow; competition: CompetitionRow } | null {
    return (
      this.db
        .select({ team: teamsTable, competition: competitionsTable })
        .from(teamsTable)
        .innerJoin(competitionsTable, eq(competitionsTable.id, teamsTable.competitionId))
        .where(eq(teamsTable.id, teamId))
        .get() ?? null
    );
  }

  /** El primer equipo: los juveniles no salen en la ficha, igual que en la plantilla. */
  listRoster(teamId: string): PlayerRow[] {
    return this.db
      .select()
      .from(playersTable)
      .where(and(eq(playersTable.teamId, teamId), eq(playersTable.isYouth, false)))
      .orderBy(asc(playersTable.lastName))
      .all();
  }

  /**
   * Los partidos del club en un curso, de todas sus competiciones, por fecha.
   * Van con la competición porque la ficha pinta cada uno de su color.
   */
  listSeasonGames(teamId: string, seasonNumber: number): TeamGameWithCompetition[] {
    return this.db
      .select({ game: gamesTable, competition: competitionsTable })
      .from(gamesTable)
      .innerJoin(seasonsTable, eq(seasonsTable.id, gamesTable.seasonId))
      .innerJoin(competitionsTable, eq(competitionsTable.id, seasonsTable.competitionId))
      .where(
        and(
          eq(seasonsTable.seasonNumber, seasonNumber),
          or(eq(gamesTable.homeTeamId, teamId), eq(gamesTable.awayTeamId, teamId))
        )
      )
      .orderBy(asc(gamesTable.scheduledOn), asc(gamesTable.id))
      .all();
  }

  /** La temporada de este curso de una competición, si se juega. */
  seasonIdOf(competitionId: string, seasonNumber: number): string | null {
    return (
      this.db
        .select({ id: seasonsTable.id })
        .from(seasonsTable)
        .where(
          and(
            eq(seasonsTable.competitionId, competitionId),
            eq(seasonsTable.seasonNumber, seasonNumber)
          )
        )
        .get()?.id ?? null
    );
  }

  teamNames(): Map<string, string> {
    return new Map(
      this.db
        .select({ id: teamsTable.id, name: teamsTable.name })
        .from(teamsTable)
        .all()
        .map((row) => [row.id, row.name])
    );
  }

  /**
   * Una sola consulta con el nombre de la competición y el tamaño de plantilla
   * ya resueltos. La alternativa —listar equipos y luego contar jugadores por
   * cada uno— son 19 consultas para pintar una pantalla.
   */
  private baseQuery() {
    return this.db
      .select({
        id: teamsTable.id,
        name: teamsTable.name,
        shortName: teamsTable.shortName,
        city: teamsTable.city,
        country: teamsTable.country,
        competitionId: teamsTable.competitionId,
        competitionName: competitionsTable.name,
        crest: teamsTable.crest,
        pavilionName: teamsTable.pavilionName,
        pavilionCapacity: teamsTable.pavilionCapacity,
        reputation: teamsTable.reputation,
        budgetCents: teamsTable.budgetCents,
        rosterSize: sql<number>`(
          select count(*) from ${playersTable} where ${playersTable.teamId} = ${teamsTable.id}
        )`
      })
      .from(teamsTable)
      .innerJoin(competitionsTable, eq(competitionsTable.id, teamsTable.competitionId));
  }
}
