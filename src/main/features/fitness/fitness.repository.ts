import { asc, eq, inArray, gt } from 'drizzle-orm';
import type { AttributeKey } from '@shared/domain/attributes';
import type { SaveDatabase } from '../../database/client';
import {
  gameStateTable,
  playersTable,
  teamsTable,
  teamTrainingTable,
  type PlayerRow,
  type TeamTrainingRow
} from '../../database/schema/save';

/** Cambios de estado físico de un jugador tras un partido, un día o una semana. */
export interface PlayerFitnessUpdate {
  playerId: string;
  condition: number;
  injuryDaysLeft: number;
  injuryName: string | null;
  /** Sólo los atributos que ha movido el entrenamiento. */
  attributes?: Partial<Record<AttributeKey, number>>;
}

/** La columna de cada atributo, para poder escribir sólo lo que cambia. */
const ATTRIBUTE_COLUMNS = {
  close: 'close',
  midRange: 'midRange',
  threePoint: 'threePoint',
  freeThrow: 'freeThrow',
  finishing: 'finishing',
  passing: 'passing',
  handling: 'handling',
  driving: 'driving',
  perimeterDefense: 'perimeterDefense',
  interiorDefense: 'interiorDefense',
  steal: 'steal',
  block: 'block',
  offensiveRebound: 'offensiveRebound',
  defensiveRebound: 'defensiveRebound',
  speed: 'speed',
  strength: 'strength',
  jumping: 'jumping',
  stamina: 'stamina',
  basketballIQ: 'basketballIq',
  consistency: 'consistency',
  aggression: 'aggression'
} as const satisfies Record<AttributeKey, keyof PlayerRow>;

export class FitnessRepository {
  constructor(private readonly db: SaveDatabase) {}

  managedTeamId(): string | null {
    return this.db.select().from(gameStateTable).get()?.managedTeamId ?? null;
  }

  currentDate(): Date {
    return this.db.select().from(gameStateTable).get()?.currentDate ?? new Date();
  }

  findTeamName(teamId: string): string | null {
    return this.db.select().from(teamsTable).where(eq(teamsTable.id, teamId)).get()?.name ?? null;
  }

  listRoster(teamId: string): PlayerRow[] {
    return this.db
      .select()
      .from(playersTable)
      .where(eq(playersTable.teamId, teamId))
      .orderBy(asc(playersTable.lastName))
      .all();
  }

  /** Toda la liga: el entrenamiento y el descanso valen para los equipos de la IA igual. */
  listAllPlayers(): PlayerRow[] {
    return this.db.select().from(playersTable).all();
  }

  listPlayersById(ids: readonly string[]): PlayerRow[] {
    if (ids.length === 0) {
      return [];
    }
    return this.db
      .select()
      .from(playersTable)
      .where(inArray(playersTable.id, [...ids]))
      .all();
  }

  listInjured(): PlayerRow[] {
    return this.db.select().from(playersTable).where(gt(playersTable.injuryDaysLeft, 0)).all();
  }

  findPlan(teamId: string): TeamTrainingRow | null {
    return (
      this.db.select().from(teamTrainingTable).where(eq(teamTrainingTable.teamId, teamId)).get() ??
      null
    );
  }

  listPlans(): Map<string, TeamTrainingRow> {
    return new Map(
      this.db
        .select()
        .from(teamTrainingTable)
        .all()
        .map((row) => [row.teamId, row])
    );
  }

  upsertPlan(row: TeamTrainingRow): void {
    this.db
      .insert(teamTrainingTable)
      .values(row)
      .onConflictDoUpdate({ target: teamTrainingTable.teamId, set: row })
      .run();
  }

  setPlayerFocus(playerId: string, focus: string | null): void {
    this.db
      .update(playersTable)
      .set({ trainingFocus: focus })
      .where(eq(playersTable.id, playerId))
      .run();
  }

  /**
   * Escribe el estado físico de varios jugadores de una vez.
   *
   * En una transacción porque un día de calendario toca a los 216 jugadores de
   * la liga: fuera de transacción son 216 escrituras a disco y se nota al
   * avanzar el reloj.
   */
  applyUpdates(updates: readonly PlayerFitnessUpdate[]): void {
    if (updates.length === 0) {
      return;
    }

    this.db.transaction((tx) => {
      for (const update of updates) {
        const values: Record<string, number | string | null> = {
          condition: update.condition,
          injuryDaysLeft: update.injuryDaysLeft,
          injuryName: update.injuryName
        };

        for (const [key, value] of Object.entries(update.attributes ?? {})) {
          values[ATTRIBUTE_COLUMNS[key as AttributeKey]] = value as number;
        }

        tx.update(playersTable).set(values).where(eq(playersTable.id, update.playerId)).run();
      }
    });
  }
}
