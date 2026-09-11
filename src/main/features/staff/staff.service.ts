import {
  staffRequestSchema,
  type StaffMember,
  type StaffRequest,
  type TeamStaff
} from '@shared/contracts/staff.contract';
import { teamIdRequestSchema } from '@shared/contracts/rotation.contract';
import { monthlyWagesCents } from '@shared/domain/finance';
import {
  MAX_STAFF_LEVEL,
  STAFF_ROLES,
  STAFF_ROLE_HINTS,
  STAFF_ROLE_LABELS,
  injuryDurationFactor,
  injuryRiskFactor,
  recoveryBoost,
  scoutingError,
  staffLevelLabel,
  staffWageCents,
  trainingBoost,
  wearFactor,
  type StaffRole
} from '@shared/domain/staff';
import type { SaveDatabase } from '../../database/save-database';
import type { StaffRow } from '../../database/schema/save';
import { StaffRepository } from './staff.repository';

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

export class StaffNotAvailableError extends Error {
  constructor() {
    super('Ese técnico ya trabaja en otro club');
    this.name = 'StaffNotAvailableError';
  }
}

/** Niveles del cuerpo técnico de un equipo, con 0 en los puestos sin cubrir. */
export type StaffLevels = Record<StaffRole, number>;

export const EMPTY_STAFF: StaffLevels = {
  assistant: 0,
  fitness: 0,
  physio: 0,
  analyst: 0,
  scout: 0
};

/**
 * El cuerpo técnico.
 *
 * Un puesto por técnico: contratar a un segundo preparador físico despide al
 * primero, que vuelve al mercado. Es la regla que hace que la decisión sea «a
 * quién pongo aquí» y no «cuántos acumulo».
 *
 * Los efectos no viven aquí: viven donde se notan —el entrenamiento, la
 * recuperación, las lesiones, la ficha de un rival— y este servicio sólo dice
 * qué nivel tiene cada puesto.
 */
export class StaffService {
  /** Ver el porqué del resolutor en {@link SeasonService}. */
  constructor(private readonly resolveDb: () => SaveDatabase) {}

  get(teamId: string): TeamStaff {
    const validated = teamIdRequestSchema.parse({ teamId });
    const repository = new StaffRepository(this.resolveDb());
    const teamName = repository.findTeamName(validated.teamId);
    if (!teamName) {
      throw new TeamNotFoundError(validated.teamId);
    }

    const members = repository.listByTeam(validated.teamId).map(toMember);
    const covered = new Set(members.map((member) => member.role));
    const seasonWages = members.reduce((total, member) => total + member.wageCents, 0);

    return {
      teamId: validated.teamId,
      teamName,
      members,
      candidates: repository.listFree().map(toMember),
      vacancies: STAFF_ROLES.filter((role) => !covered.has(role)).map((role) => ({
        role,
        roleLabel: STAFF_ROLE_LABELS[role],
        roleHint: STAFF_ROLE_HINTS[role]
      })),
      seasonWagesCents: seasonWages,
      monthlyWagesCents: monthlyWagesCents(seasonWages),
      isManaged: repository.managedTeamId() === validated.teamId
    };
  }

  hire(request: StaffRequest): TeamStaff {
    const validated = staffRequestSchema.parse(request);
    const repository = new StaffRepository(this.resolveDb());
    this.requireManaged(repository, validated.teamId);

    const hire = repository.findById(validated.staffId);
    if (!hire) {
      throw new StaffNotAvailableError();
    }
    if (hire.teamId !== null && hire.teamId !== validated.teamId) {
      throw new StaffNotAvailableError();
    }

    // Un puesto, un técnico: el que estaba vuelve al mercado.
    const previous = repository
      .listByTeam(validated.teamId)
      .find((row) => row.role === hire.role && row.id !== hire.id);
    if (previous) {
      repository.setTeam(previous.id, null);
    }

    repository.setTeam(hire.id, validated.teamId);
    return this.get(validated.teamId);
  }

  fire(request: StaffRequest): TeamStaff {
    const validated = staffRequestSchema.parse(request);
    const repository = new StaffRepository(this.resolveDb());
    this.requireManaged(repository, validated.teamId);

    const member = repository.findById(validated.staffId);
    if (member?.teamId === validated.teamId) {
      repository.setTeam(member.id, null);
    }

    return this.get(validated.teamId);
  }

  /** Nivel de cada puesto; 0 donde no hay nadie contratado. */
  levels(teamId: string): StaffLevels {
    const repository = new StaffRepository(this.resolveDb());
    const levels: StaffLevels = { ...EMPTY_STAFF };

    for (const row of repository.listByTeam(teamId)) {
      const role = row.role as StaffRole;
      if (role in levels) {
        levels[role] = Math.max(levels[role], row.level);
      }
    }

    return levels;
  }

  /** Lo que cuesta el cuerpo técnico al año: entra en la nómina del club. */
  seasonWagesCents(teamId: string): number {
    const repository = new StaffRepository(this.resolveDb());
    return repository
      .listByTeam(teamId)
      .reduce((total, row) => total + staffWageCents(row.level), 0);
  }

  // ------------------------------------------------------------------------

  private requireManaged(repository: StaffRepository, teamId: string): void {
    if (!repository.findTeamName(teamId)) {
      throw new TeamNotFoundError(teamId);
    }
    if (repository.managedTeamId() !== teamId) {
      throw new NotManagedTeamError(teamId);
    }
  }
}

function toMember(row: StaffRow): StaffMember {
  const role = row.role as StaffRole;

  return {
    id: row.id,
    name: `${row.firstName} ${row.lastName}`,
    role,
    roleLabel: STAFF_ROLE_LABELS[role],
    roleHint: STAFF_ROLE_HINTS[role],
    level: row.level,
    levelLabel: staffLevelLabel(row.level),
    wageCents: staffWageCents(row.level),
    effect: effectLabel(role, row.level)
  };
}

/** El efecto del técnico dicho en números, que es como se compara a dos candidatos. */
function effectLabel(role: StaffRole, level: number): string {
  switch (role) {
    case 'assistant':
      return `Entrenamiento +${percent(trainingBoost(level) - 1)}`;
    case 'fitness':
      return `Recuperación +${percent(recoveryBoost(level) - 1)} · desgaste −${percent(1 - wearFactor(level))}`;
    case 'physio':
      return `Bajas −${percent(1 - injuryDurationFactor(level))} · riesgo −${percent(1 - injuryRiskFactor(level))}`;
    case 'analyst':
      return level >= 2 ? 'Enseña al rival en la previa' : 'Todavía no aporta nada en la previa';
    case 'scout':
      return `Fichas de rivales con ±${Math.round(scoutingError(level))}`;
  }
}

function percent(fraction: number): string {
  return `${Math.round(fraction * 100)} %`;
}

export { MAX_STAFF_LEVEL };
