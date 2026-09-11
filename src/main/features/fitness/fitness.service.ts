import {
  saveTrainingPlanRequestSchema,
  type SaveTrainingPlanRequest,
  type TeamTrainingPlan,
  type TrainingPlayer
} from '@shared/contracts/training.contract';
import { teamIdRequestSchema } from '@shared/contracts/rotation.contract';
import { overallForPosition, type PlayerAttributes } from '@shared/domain/attributes';
import {
  RECOVERY_FOCUS_BONUS,
  conditionAfterGame,
  conditionAfterRest,
  conditionLabel,
  trainingWear
} from '@shared/domain/conditioning';
import {
  gameInjuryRisk,
  injuryLabel,
  rollInjury,
  trainingInjuryRisk
} from '@shared/domain/injuries';
import type { Position } from '@shared/domain/positions';
import {
  DEFAULT_TRAINING_INTENSITY,
  applyChanges,
  trainWeek,
  type TrainingFocus
} from '@shared/domain/training';
import { createRng, seedFromString } from '@shared/engine/basketball/rng';
import type { SaveDatabase } from '../../database/save-database';
import type { PlayerRow } from '../../database/schema/save';
import { ageAt } from '../players/players.mapper';
import { FitnessRepository, type PlayerFitnessUpdate } from './fitness.repository';

const DAY_MS = 24 * 60 * 60 * 1000;
/** Lunes: el día en que se cierra la semana de entrenamiento. */
const TRAINING_WEEKDAY = 1;
/** Tope de días que se procesan de una vez, por si alguien mueve el reloj un año. */
const MAX_DAYS = 400;

export class TeamNotFoundError extends Error {
  constructor(teamId: string) {
    super(`No existe el equipo ${teamId}`);
    this.name = 'TeamNotFoundError';
  }
}

export class NotManagedTeamError extends Error {
  constructor(teamId: string) {
    super(`El equipo ${teamId} no lo dirige el usuario`);
    this.name = 'NotManagedTeamError';
  }
}

/**
 * Estado físico y entrenamiento.
 *
 * Aquí se cierra el círculo que abrieron la rotación y el motor: los minutos
 * que reparte el entrenador desgastan, el desgaste lesiona, y lo que se entrena
 * entre semana decide si la plantilla mejora o se va apagando. Toca a todos los
 * equipos, no sólo al del usuario — una liga en la que sólo se lesiona uno no
 * es una liga.
 */
export class FitnessService {
  /** Ver el porqué del resolutor en {@link SeasonService}. */
  constructor(private readonly resolveDb: () => SaveDatabase) {}

  getPlan(teamId: string): TeamTrainingPlan {
    const validated = teamIdRequestSchema.parse({ teamId });
    const repository = new FitnessRepository(this.resolveDb());
    const teamName = repository.findTeamName(validated.teamId);
    if (!teamName) {
      throw new TeamNotFoundError(validated.teamId);
    }

    const plan = repository.findPlan(validated.teamId);
    const intensity = plan?.intensity ?? DEFAULT_TRAINING_INTENSITY;
    const focus = (plan?.focus as TrainingFocus | undefined) ?? 'balanced';
    const today = repository.currentDate();
    const players = repository
      .listRoster(validated.teamId)
      .map((row) => toTrainingPlayer(row, focus, today));

    return {
      teamId: validated.teamId,
      teamName,
      intensity,
      focus,
      players,
      injuredCount: players.filter((player) => !player.available).length,
      isManaged: repository.managedTeamId() === validated.teamId
    };
  }

  savePlan(request: SaveTrainingPlanRequest): TeamTrainingPlan {
    const validated = saveTrainingPlanRequestSchema.parse(request);
    const repository = new FitnessRepository(this.resolveDb());
    if (!repository.findTeamName(validated.teamId)) {
      throw new TeamNotFoundError(validated.teamId);
    }
    if (repository.managedTeamId() !== validated.teamId) {
      throw new NotManagedTeamError(validated.teamId);
    }

    repository.upsertPlan({
      teamId: validated.teamId,
      intensity: validated.intensity,
      focus: validated.focus
    });

    // Un foco individual de alguien que no es de la plantilla se ignora en
    // silencio: es un jugador traspasado mientras la pantalla estaba abierta.
    const roster = new Set(repository.listRoster(validated.teamId).map((row) => row.id));
    for (const player of validated.players) {
      if (roster.has(player.playerId)) {
        repository.setPlayerFocus(player.playerId, player.focus);
      }
    }

    return this.getPlan(validated.teamId);
  }

  /**
   * Lo que deja un partido: minutos en las piernas y, con suerte, nada más.
   *
   * El riesgo se mide con la forma **con la que llegó** al partido, no con la
   * que le queda: lesionarse es consecuencia de haber salido cargado, y eso ya
   * estaba decidido antes del salto inicial.
   */
  applyGameEffects(
    gameId: string,
    lines: readonly { playerId: string; secondsPlayed: number }[],
    playedOn: Date
  ): void {
    const repository = new FitnessRepository(this.resolveDb());
    const rows = new Map(
      repository.listPlayersById(lines.map((line) => line.playerId)).map((row) => [row.id, row])
    );

    const updates: PlayerFitnessUpdate[] = [];
    for (const line of lines) {
      const row = rows.get(line.playerId);
      if (!row || line.secondsPlayed <= 0) {
        continue;
      }

      const minutesPlayed = line.secondsPlayed / 60;
      const injury =
        row.injuryDaysLeft > 0
          ? null
          : rollInjury(
              createRng(seedFromString(`${gameId}-${row.id}-lesion`)),
              gameInjuryRisk({
                minutesPlayed,
                condition: row.condition,
                age: ageAt(row.birthDate, playedOn),
                stamina: row.stamina
              })
            );

      updates.push({
        playerId: row.id,
        condition: conditionAfterGame(row.condition, minutesPlayed, row.stamina),
        injuryDaysLeft: injury?.days ?? row.injuryDaysLeft,
        injuryName: injury?.name ?? row.injuryName
      });
    }

    repository.applyUpdates(updates);
  }

  /**
   * Días de calendario: se recupera forma, bajan las bajas y, cada lunes que se
   * cruce, se entrena.
   *
   * Recibe el tramo entero y no un día suelto porque el reloj del juego avanza
   * a saltos —«ir a la jornada» se come seis días de una vez— y saltarse el
   * tramo dejaría a la liga sin descansar ni entrenar media temporada.
   */
  advanceDays(from: Date, to: Date): void {
    const days = daysBetween(from, to);
    if (days <= 0) {
      return;
    }

    const repository = new FitnessRepository(this.resolveDb());
    repository.applyUpdates(
      repository
        .listAllPlayers()
        .map((row) => restUpdate(row, days))
        .filter(changesSomething)
    );

    for (const monday of trainingDaysBetween(from, to)) {
      this.runTrainingWeek(monday);
    }
  }

  /**
   * Verano: la plantilla vuelve a cien y las lesiones siguen corriendo.
   *
   * No se entrena en la pretemporada, a propósito: dos meses de entrenamiento
   * automático moverían la liga entera sin que nadie lo decidiera, y eso es
   * justo lo que esta pantalla existe para evitar.
   */
  startNewSeason(from: Date, to: Date): void {
    const days = daysBetween(from, to);
    const repository = new FitnessRepository(this.resolveDb());

    repository.applyUpdates(
      repository.listAllPlayers().map((row) => ({
        playerId: row.id,
        condition: 100,
        injuryDaysLeft: Math.max(0, row.injuryDaysLeft - days),
        injuryName: row.injuryDaysLeft - days > 0 ? row.injuryName : null
      }))
    );
  }

  /** Una semana de entrenamiento de toda la liga. */
  runTrainingWeek(date: Date): void {
    const repository = new FitnessRepository(this.resolveDb());
    const plans = repository.listPlans();
    const dateKey = date.toISOString().slice(0, 10);

    const updates: PlayerFitnessUpdate[] = [];
    for (const row of repository.listAllPlayers()) {
      // Sin equipo no hay plan, y lesionado no se entrena: se recupera.
      if (!row.teamId || row.injuryDaysLeft > 0) {
        continue;
      }

      const plan = plans.get(row.teamId);
      const intensity = plan?.intensity ?? DEFAULT_TRAINING_INTENSITY;
      const focus =
        (row.trainingFocus as TrainingFocus | null) ?? (plan?.focus as TrainingFocus) ?? 'balanced';
      const recovering = focus === 'recovery';
      const age = ageAt(row.birthDate, date);
      const rng = createRng(seedFromString(`${dateKey}-${row.id}-entreno`));

      const changes = trainWeek({
        attributes: toAttributes(row),
        position: row.position as Position,
        potential: row.potential,
        age,
        focus,
        intensity,
        rng
      });

      const condition = Math.min(
        100,
        Math.max(
          0,
          Math.round(
            row.condition + (recovering ? RECOVERY_FOCUS_BONUS : -trainingWear(intensity, false))
          )
        )
      );

      const injury = rollInjury(
        rng,
        recovering ? 0 : trainingInjuryRisk({ intensity, condition: row.condition, age })
      );

      updates.push({
        playerId: row.id,
        condition,
        injuryDaysLeft: injury?.days ?? 0,
        injuryName: injury?.name ?? null,
        attributes: changes.length > 0 ? changedAttributes(row, changes) : undefined
      });
    }

    repository.applyUpdates(updates);
  }
}

/**
 * Si un jugador está a cien y sano, un día de descanso no le hace nada: no hay
 * por qué escribir su fila. La mayoría de los días eso vale para casi toda la
 * liga, y el reloj se mueve muchas veces por partida.
 */
function changesSomething(update: PlayerFitnessUpdate & { previous: PlayerRow }): boolean {
  return (
    update.condition !== update.previous.condition ||
    update.injuryDaysLeft !== update.previous.injuryDaysLeft ||
    update.injuryName !== update.previous.injuryName
  );
}

function restUpdate(row: PlayerRow, days: number): PlayerFitnessUpdate & { previous: PlayerRow } {
  const injuryDaysLeft = Math.max(0, row.injuryDaysLeft - days);

  return {
    playerId: row.id,
    condition: conditionAfterRest(row.condition, days, row.stamina),
    injuryDaysLeft,
    injuryName: injuryDaysLeft > 0 ? row.injuryName : null,
    previous: row
  };
}

function changedAttributes(
  row: PlayerRow,
  changes: ReturnType<typeof trainWeek>
): Partial<PlayerAttributes> {
  const applied = applyChanges(toAttributes(row), changes);
  const result: Partial<PlayerAttributes> = {};

  for (const change of changes) {
    result[change.key] = applied[change.key];
  }

  return result;
}

function toTrainingPlayer(row: PlayerRow, teamFocus: TrainingFocus, today: Date): TrainingPlayer {
  const focus = (row.trainingFocus as TrainingFocus | null) ?? null;
  const attributes = toAttributes(row);

  return {
    playerId: row.id,
    playerName: `${row.firstName} ${row.lastName}`,
    position: row.position as Position,
    age: ageAt(row.birthDate, today),
    overall: overallForPosition(attributes, row.position as Position),
    potential: row.potential,
    condition: row.condition,
    conditionLabel: conditionLabel(row.condition),
    focus,
    effectiveFocus: focus ?? teamFocus,
    injuryName: row.injuryName,
    injuryDaysLeft: row.injuryDaysLeft,
    injuryLabel: injuryLabel(row.injuryDaysLeft),
    available: row.injuryDaysLeft === 0
  };
}

/** La fila de base de datos, con los 21 atributos, vista como atributos. */
function toAttributes(row: PlayerRow): PlayerAttributes {
  return {
    close: row.close,
    midRange: row.midRange,
    threePoint: row.threePoint,
    freeThrow: row.freeThrow,
    finishing: row.finishing,
    passing: row.passing,
    handling: row.handling,
    driving: row.driving,
    perimeterDefense: row.perimeterDefense,
    interiorDefense: row.interiorDefense,
    steal: row.steal,
    block: row.block,
    offensiveRebound: row.offensiveRebound,
    defensiveRebound: row.defensiveRebound,
    speed: row.speed,
    strength: row.strength,
    jumping: row.jumping,
    stamina: row.stamina,
    basketballIQ: row.basketballIq,
    consistency: row.consistency,
    aggression: row.aggression
  };
}

function daysBetween(from: Date, to: Date): number {
  return Math.min(MAX_DAYS, Math.max(0, Math.round((to.getTime() - from.getTime()) / DAY_MS)));
}

/** Los lunes que quedan dentro del tramo `(from, to]`. */
function trainingDaysBetween(from: Date, to: Date): Date[] {
  const days = daysBetween(from, to);
  const mondays: Date[] = [];

  for (let index = 1; index <= days; index += 1) {
    const date = new Date(from.getTime() + index * DAY_MS);
    if (date.getUTCDay() === TRAINING_WEEKDAY) {
      mondays.push(date);
    }
  }

  return mondays;
}
