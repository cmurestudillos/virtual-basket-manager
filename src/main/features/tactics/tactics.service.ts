import {
  saveTacticsRequestSchema,
  type SaveTacticsRequest,
  type TeamTacticsView
} from '@shared/contracts/tactics.contract';
import { teamIdRequestSchema } from '@shared/contracts/rotation.contract';
import {
  DEFAULT_TACTICS,
  type DefensiveSystem,
  type OffensiveSystem
} from '@shared/domain/tactics';
import type { SaveDatabase } from '../../database/save-database';
import type { TeamTacticsRow } from '../../database/schema/save';
import { TacticsRepository } from './tactics.repository';

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

export class InvalidTacticsError extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = 'InvalidTacticsError';
  }
}

/**
 * La pizarra: sistemas, deslizadores y referencia ofensiva.
 *
 * Todos los equipos tienen la suya —la IA también— pero sólo la del usuario se
 * puede escribir desde la interfaz. Leerla de un rival sí está permitido: es lo
 * que hará falta para la previa del partido y para el ojeo.
 */
export class TacticsService {
  /** Ver el porqué del resolutor en {@link SeasonService}. */
  constructor(private readonly resolveDb: () => SaveDatabase) {}

  get(teamId: string): TeamTacticsView {
    const validated = teamIdRequestSchema.parse({ teamId });
    const repository = new TacticsRepository(this.resolveDb());
    const teamName = requireTeamName(repository, validated.teamId);

    // Un equipo sin fila de pizarra juega con la de por defecto en vez de
    // reventar: el motor hace exactamente lo mismo al construir el equipo.
    const row = repository.findTactics(validated.teamId);
    return toView(repository, validated.teamId, teamName, row);
  }

  save(request: SaveTacticsRequest): TeamTacticsView {
    const validated = saveTacticsRequestSchema.parse(request);
    const repository = new TacticsRepository(this.resolveDb());
    const teamName = requireTeamName(repository, validated.teamId);

    if (repository.managedTeamId() !== validated.teamId) {
      throw new NotManagedTeamError(validated.teamId);
    }

    // La referencia ofensiva sube el uso de un jugador concreto: si no es de la
    // plantilla, el motor le daría posesiones a alguien que no está en pista.
    if (
      validated.focusPlayerId &&
      !repository.findPlayerNameInTeam(validated.teamId, validated.focusPlayerId)
    ) {
      throw new InvalidTacticsError(
        `El jugador ${validated.focusPlayerId} no está en la plantilla`
      );
    }

    const row: TeamTacticsRow = {
      teamId: validated.teamId,
      offensiveSystem: validated.offensiveSystem,
      defensiveSystem: validated.defensiveSystem,
      pace: validated.pace,
      defensiveIntensity: validated.defensiveIntensity,
      offensiveReboundEffort: validated.offensiveReboundEffort,
      focusPlayerId: validated.focusPlayerId
    };
    repository.upsert(row);

    return toView(repository, validated.teamId, teamName, row);
  }
}

function requireTeamName(repository: TacticsRepository, teamId: string): string {
  const teamName = repository.findTeamName(teamId);
  if (!teamName) {
    throw new TeamNotFoundError(teamId);
  }
  return teamName;
}

function toView(
  repository: TacticsRepository,
  teamId: string,
  teamName: string,
  row: TeamTacticsRow | null
): TeamTacticsView {
  const focusPlayerId = row?.focusPlayerId ?? null;

  return {
    teamId,
    teamName,
    offensiveSystem: (row?.offensiveSystem as OffensiveSystem) ?? DEFAULT_TACTICS.offensiveSystem,
    defensiveSystem: (row?.defensiveSystem as DefensiveSystem) ?? DEFAULT_TACTICS.defensiveSystem,
    pace: row?.pace ?? DEFAULT_TACTICS.pace,
    defensiveIntensity: row?.defensiveIntensity ?? DEFAULT_TACTICS.defensiveIntensity,
    offensiveReboundEffort: row?.offensiveReboundEffort ?? DEFAULT_TACTICS.offensiveReboundEffort,
    focusPlayerId,
    focusPlayerName: focusPlayerId ? repository.findPlayerNameInTeam(teamId, focusPlayerId) : null,
    isManaged: repository.managedTeamId() === teamId
  };
}
