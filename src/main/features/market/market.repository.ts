import { and, eq, isNull, ne, or, sql } from 'drizzle-orm';
import type { SaveDatabase } from '../../database/client';
import {
  gameStateTable,
  playersTable,
  rotationSlotsTable,
  teamsTable,
  type PlayerRow,
  type TeamRow
} from '../../database/schema/save';

export class MarketRepository {
  constructor(private readonly db: SaveDatabase) {}

  managedTeamId(): string | null {
    return this.db.select().from(gameStateTable).get()?.managedTeamId ?? null;
  }

  currentDate(): Date {
    return this.db.select().from(gameStateTable).get()?.currentDate ?? new Date();
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

  findPlayer(playerId: string): PlayerRow | null {
    return this.db.select().from(playersTable).where(eq(playersTable.id, playerId)).get() ?? null;
  }

  /**
   * Todo lo que se puede fichar: jugadores de otros clubes y agentes libres.
   * Los juveniles no están en el mercado — se promocionan, no se compran.
   */
  listSignable(managedTeamId: string): PlayerRow[] {
    return this.db
      .select()
      .from(playersTable)
      .where(
        and(
          eq(playersTable.isYouth, false),
          or(isNull(playersTable.teamId), ne(playersTable.teamId, managedTeamId))
        )
      )
      .all();
  }

  listRoster(teamId: string): PlayerRow[] {
    return this.db
      .select()
      .from(playersTable)
      .where(and(eq(playersTable.teamId, teamId), eq(playersTable.isYouth, false)))
      .all();
  }

  countRoster(teamId: string): number {
    return this.listRoster(teamId).length;
  }

  seasonWagesCents(teamId: string): number {
    const row = this.db
      .select({ total: sql<number>`coalesce(sum(${playersTable.wageCents}), 0)` })
      .from(playersTable)
      .where(and(eq(playersTable.teamId, teamId), eq(playersTable.isYouth, false)))
      .get();

    return row?.total ?? 0;
  }

  /**
   * Mueve a un jugador de club y le pone contrato nuevo.
   *
   * En una transacción con el dinero y con la limpieza de su hueco en la
   * rotación del club que lo deja: un jugador que cambia de equipo pero sigue
   * apareciendo en el quinteto del anterior es el clásico error que sólo se ve
   * tres jornadas después.
   */
  transfer(input: {
    playerId: string;
    fromTeamId: string | null;
    toTeamId: string;
    feeCents: number;
    wageCents: number;
    contractUntil: Date;
    valueCents: number;
  }): void {
    this.db.transaction((tx) => {
      tx.update(playersTable)
        .set({
          teamId: input.toTeamId,
          wageCents: input.wageCents,
          contractUntil: input.contractUntil,
          valueCents: input.valueCents,
          trainingFocus: null
        })
        .where(eq(playersTable.id, input.playerId))
        .run();

      tx.delete(rotationSlotsTable).where(eq(rotationSlotsTable.playerId, input.playerId)).run();

      if (input.feeCents > 0 && input.fromTeamId) {
        tx.update(teamsTable)
          .set({ budgetCents: sql`${teamsTable.budgetCents} + ${input.feeCents}` })
          .where(eq(teamsTable.id, input.fromTeamId))
          .run();
      }
    });
  }

  /**
   * Cede a un jugador: cambia de club pero no de dueño.
   *
   * `teamId` es siempre dónde juega hoy, así que el motor, la rotación y el
   * acta no necesitan saber que existe la figura de la cesión.
   */
  loan(input: {
    playerId: string;
    ownerTeamId: string;
    borrowerTeamId: string;
    until: Date;
  }): void {
    this.db.transaction((tx) => {
      tx.update(playersTable)
        .set({
          teamId: input.borrowerTeamId,
          loanFromTeamId: input.ownerTeamId,
          loanUntil: input.until,
          trainingFocus: null
        })
        .where(eq(playersTable.id, input.playerId))
        .run();
      tx.delete(rotationSlotsTable).where(eq(rotationSlotsTable.playerId, input.playerId)).run();
    });
  }

  /** Devuelve a un cedido a su club. */
  endLoan(playerId: string, ownerTeamId: string): void {
    this.db.transaction((tx) => {
      tx.update(playersTable)
        .set({
          teamId: ownerTeamId,
          loanFromTeamId: null,
          loanUntil: null,
          trainingFocus: null
        })
        .where(eq(playersTable.id, playerId))
        .run();
      tx.delete(rotationSlotsTable).where(eq(rotationSlotsTable.playerId, playerId)).run();
    });
  }

  /** Cesiones vivas en las que participa un club, de ida o de vuelta. */
  listLoans(teamId: string): PlayerRow[] {
    return this.db
      .select()
      .from(playersTable)
      .all()
      .filter(
        (row) =>
          row.loanFromTeamId !== null && (row.loanFromTeamId === teamId || row.teamId === teamId)
      );
  }

  /** Las que ya han vencido, de toda la liga. */
  listExpiredLoans(date: Date): PlayerRow[] {
    return this.db
      .select()
      .from(playersTable)
      .all()
      .filter((row) => row.loanUntil !== null && row.loanUntil <= date && row.loanFromTeamId);
  }

  /** Deja a un jugador sin equipo: rescisión o contrato terminado. */
  release(playerId: string): void {
    this.db.transaction((tx) => {
      tx.update(playersTable)
        .set({ teamId: null, trainingFocus: null })
        .where(eq(playersTable.id, playerId))
        .run();
      tx.delete(rotationSlotsTable).where(eq(rotationSlotsTable.playerId, playerId)).run();
    });
  }

  renew(playerId: string, wageCents: number, contractUntil: Date, valueCents: number): void {
    this.db
      .update(playersTable)
      .set({ wageCents, contractUntil, valueCents })
      .where(eq(playersTable.id, playerId))
      .run();
  }

  /** Contratos que vencen en una fecha o antes, de toda la liga. */
  listExpiring(date: Date): PlayerRow[] {
    return this.db
      .select()
      .from(playersTable)
      .where(and(eq(playersTable.isYouth, false)))
      .all()
      .filter((row) => row.contractUntil !== null && row.contractUntil <= date && row.teamId);
  }

  listFreeAgents(): PlayerRow[] {
    return this.db
      .select()
      .from(playersTable)
      .where(and(isNull(playersTable.teamId), eq(playersTable.isYouth, false)))
      .all();
  }

  listTeams(): TeamRow[] {
    return this.db.select().from(teamsTable).all();
  }
}
