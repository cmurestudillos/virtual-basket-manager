import { asc, eq, sql } from 'drizzle-orm';
import type { SaveDatabase } from '../../database/client';
import { competitionsTable, playersTable, teamsTable } from '../../database/schema/save';

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

export class TeamsRepository {
  constructor(private readonly db: SaveDatabase) {}

  list(): TeamWithContext[] {
    return this.baseQuery().orderBy(asc(teamsTable.name)).all();
  }

  findById(id: string): TeamWithContext | null {
    return this.baseQuery().where(eq(teamsTable.id, id)).get() ?? null;
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
