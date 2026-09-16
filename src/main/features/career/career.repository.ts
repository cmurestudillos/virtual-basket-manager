import { and, asc, eq, inArray, isNull } from 'drizzle-orm';
import type { SaveDatabase } from '../../database/save-database';
import {
  boardTable,
  careerSpellsTable,
  competitionsTable,
  gameStateTable,
  seasonsTable,
  teamsTable,
  type CareerSpellRow,
  type CompetitionRow,
  type NewCareerSpellRow,
  type TeamRow
} from '../../database/schema/save';

/** Las consultas del modo carrera. */
export class CareerRepository {
  constructor(private readonly db: SaveDatabase) {}

  gameState(): {
    managedTeamId: string | null;
    managerName: string;
    seasonNumber: number;
    careerMode: boolean;
    currentDate: Date;
  } {
    const state = this.db.select().from(gameStateTable).get();
    return {
      managedTeamId: state?.managedTeamId ?? null,
      managerName: state?.managerName ?? 'Entrenador',
      seasonNumber: state?.seasonNumber ?? 1,
      careerMode: state?.careerMode ?? false,
      currentDate: state?.currentDate ?? new Date()
    };
  }

  /** Pone al entrenador al frente de otro club. */
  setManagedTeam(teamId: string): void {
    this.db.update(gameStateTable).set({ managedTeamId: teamId }).run();
  }

  spells(): CareerSpellRow[] {
    return this.db
      .select()
      .from(careerSpellsTable)
      .orderBy(asc(careerSpellsTable.startSeason))
      .all();
  }

  /**
   * En carrera y sin etapa abierta: sin banquillo.
   *
   * Exige modo carrera **y** que haya etapas: una partida de mánager siempre
   * tiene la suya abierta, pero una creada antes de existir las etapas no tiene
   * ninguna, y no por eso su entrenador está en el paro.
   */
  isUnemployed(): boolean {
    if (!this.gameState().careerMode) {
      return false;
    }
    return this.spells().length > 0 && this.openSpell() === null;
  }

  /** La etapa en curso, si la hay: es la que dice si estás colocado. */
  openSpell(): CareerSpellRow | null {
    return (
      this.db.select().from(careerSpellsTable).where(isNull(careerSpellsTable.endSeason)).get() ??
      null
    );
  }

  insertSpell(row: NewCareerSpellRow): void {
    this.db.insert(careerSpellsTable).values(row).run();
  }

  closeSpell(id: string, endSeason: number, endReason: string): void {
    this.db
      .update(careerSpellsTable)
      .set({ endSeason, endReason })
      .where(eq(careerSpellsTable.id, id))
      .run();
  }

  findTeam(teamId: string): TeamRow | null {
    return this.db.select().from(teamsTable).where(eq(teamsTable.id, teamId)).get() ?? null;
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

  findCompetition(competitionId: string): CompetitionRow | null {
    return (
      this.db
        .select()
        .from(competitionsTable)
        .where(eq(competitionsTable.id, competitionId))
        .get() ?? null
    );
  }

  /**
   * Los clubes de las ligas de unos países.
   *
   * Las ofertas salen sólo de los países que se juegan, y no de las veintiuna
   * ligas del mundo, por una razón de fondo: únicamente esas ligas tienen
   * calendario este año. Un entrenador al que echan en enero y se va a una liga
   * que no se simula se encontraría una competición que esta temporada no
   * existe.
   */
  clubsInCountries(countries: readonly string[]): { team: TeamRow; competition: CompetitionRow }[] {
    if (countries.length === 0) {
      return [];
    }
    return this.db
      .select({ team: teamsTable, competition: competitionsTable })
      .from(teamsTable)
      .innerJoin(competitionsTable, eq(competitionsTable.id, teamsTable.competitionId))
      .where(
        and(
          inArray(competitionsTable.country, [...countries]),
          eq(competitionsTable.format, 'league')
        )
      )
      .all();
  }

  /** Campeones de cada temporada, para repartir los títulos entre las etapas. */
  champions(): { seasonNumber: number; championTeamId: string | null }[] {
    return this.db
      .select({
        seasonNumber: seasonsTable.seasonNumber,
        championTeamId: seasonsTable.championTeamId
      })
      .from(seasonsTable)
      .all();
  }

  /** La temporada de una competición en un curso, para leer su clasificación. */
  seasonOf(competitionId: string, seasonNumber: number): { id: string; stage: string } | null {
    return (
      this.db
        .select({ id: seasonsTable.id, stage: seasonsTable.stage })
        .from(seasonsTable)
        .where(
          and(
            eq(seasonsTable.competitionId, competitionId),
            eq(seasonsTable.seasonNumber, seasonNumber)
          )
        )
        .get() ?? null
    );
  }

  /**
   * Borra la ficha del consejo de un club.
   *
   * Hace falta al fichar por uno que ya te echó alguna vez: su fila sigue
   * marcada como destituido, y sin limpiarla el consejo nuevo nacería con el
   * despido puesto y no volvería a moverse.
   */
  clearBoard(teamId: string): void {
    this.db.delete(boardTable).where(eq(boardTable.teamId, teamId)).run();
  }
}
