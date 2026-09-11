import {
  promotePlayerRequestSchema,
  upgradeYouthRequestSchema,
  type PromotePlayerRequest,
  type UpgradeYouthRequest,
  type YouthAcademy,
  type YouthPlayer
} from '@shared/contracts/youth.contract';
import { teamIdRequestSchema } from '@shared/contracts/rotation.contract';
import { overallForPosition, type PlayerAttributes } from '@shared/domain/attributes';
import type { Position } from '@shared/domain/positions';
import {
  MAX_ROSTER,
  MAX_YOUTH_LEVEL,
  MAX_YOUTH_PLAYERS,
  agedOut,
  canPromote,
  intakeSize,
  youthLevelLabel,
  youthUpgradeCostCents,
  youthUpkeepCents
} from '@shared/domain/youth';
import { createRng, seedFromString } from '@shared/engine/basketball/rng';
import type { SaveDatabase } from '../../database/save-database';
import type { PlayerRow } from '../../database/schema/save';
import { ageAt } from '../players/players.mapper';
import { ClubService } from '../club/club.service';
import { YouthRepository } from './youth.repository';
import { buildYouthPlayers } from './youth-factory';

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

export class SquadFullError extends Error {
  constructor() {
    super(`La plantilla ya tiene ${MAX_ROSTER} jugadores`);
    this.name = 'SquadFullError';
  }
}

export class NotAProspectError extends Error {
  constructor() {
    super('Ese jugador no está en la cantera del club');
    this.name = 'NotAProspectError';
  }
}

export class NotEnoughMoneyError extends Error {
  constructor() {
    super('No hay dinero en caja para la obra de la cantera');
    this.name = 'NotEnoughMoneyError';
  }
}

export class MaxYouthLevelError extends Error {
  constructor() {
    super('La cantera ya está al máximo');
    this.name = 'MaxYouthLevelError';
  }
}

/**
 * La cantera.
 *
 * Cada verano sale una hornada —cuántos y con qué techo lo decide el nivel de
 * las instalaciones— y los que cumplen diecinueve sin que nadie los suba se van
 * libres. Promocionar es la decisión: un hueco de plantilla por un jugador que
 * hoy es peor que cualquiera y dentro de tres años puede ser el mejor.
 *
 * El directorio de nombres sale del dataset, igual que las plantillas: la gente
 * que inventa el juego después de empezar se llama como la que venía de fábrica.
 */
export class YouthService {
  /** Ver el porqué del resolutor en {@link SeasonService}. */
  constructor(private readonly resolveDb: () => SaveDatabase) {}

  get(teamId: string): YouthAcademy {
    const validated = teamIdRequestSchema.parse({ teamId });
    const repository = new YouthRepository(this.resolveDb());
    const team = repository.findTeam(validated.teamId);
    if (!team) {
      throw new TeamNotFoundError(validated.teamId);
    }

    const today = repository.currentDate();
    const rosterSize = repository.countRoster(team.id);

    return {
      teamId: team.id,
      teamName: team.name,
      level: team.youthLevel,
      levelLabel: youthLevelLabel(team.youthLevel),
      upgradeCostCents:
        team.youthLevel >= MAX_YOUTH_LEVEL ? null : youthUpgradeCostCents(team.youthLevel),
      upkeepCents: youthUpkeepCents(team.youthLevel),
      players: repository.listYouth(team.id).map((row) => toYouthPlayer(row, today)),
      rosterSize,
      maxRoster: MAX_ROSTER,
      canPromote: canPromote(rosterSize),
      isManaged: repository.managedTeamId() === team.id
    };
  }

  /** Sube a un juvenil al primer equipo. Necesita hueco en la plantilla. */
  promote(request: PromotePlayerRequest): YouthAcademy {
    const validated = promotePlayerRequestSchema.parse(request);
    const repository = new YouthRepository(this.resolveDb());
    this.requireManaged(repository, validated.teamId);

    const player = repository.findPlayer(validated.playerId);
    if (!player || !player.isYouth || player.teamId !== validated.teamId) {
      throw new NotAProspectError();
    }
    if (!canPromote(repository.countRoster(validated.teamId))) {
      throw new SquadFullError();
    }

    repository.promote(player.id);
    return this.get(validated.teamId);
  }

  /** Mejora las instalaciones. Se paga al contado, como las obras del pabellón. */
  upgrade(request: UpgradeYouthRequest): YouthAcademy {
    const validated = upgradeYouthRequestSchema.parse(request);
    const repository = new YouthRepository(this.resolveDb());
    const team = this.requireManaged(repository, validated.teamId);

    if (team.youthLevel >= MAX_YOUTH_LEVEL) {
      throw new MaxYouthLevelError();
    }

    const cost = youthUpgradeCostCents(team.youthLevel);
    if (cost > team.budgetCents) {
      throw new NotEnoughMoneyError();
    }

    repository.setYouthLevel(team.id, team.youthLevel + 1);
    new ClubService(this.resolveDb).recordEntry({
      teamId: team.id,
      seasonId: null,
      happenedOn: repository.currentDate(),
      type: 'facilities',
      description: `Mejora de la cantera a nivel ${team.youthLevel + 1}`,
      amountCents: -cost
    });

    return this.get(validated.teamId);
  }

  /**
   * La hornada del verano, para toda la liga.
   *
   * Primero se van los que ya no son juveniles y luego entran los nuevos, con
   * tope de plantilla de cantera: si no, en diez temporadas cada club tendría
   * cincuenta chavales guardados.
   */
  runIntake(seasonNumber: number, seasonStartYear: number): void {
    const repository = new YouthRepository(this.resolveDb());
    const today = repository.currentDate();

    for (const team of repository.listTeams()) {
      const current = repository.listYouth(team.id);
      for (const row of current) {
        if (agedOut(ageAt(row.birthDate, today))) {
          repository.release(row.id);
        }
      }

      const remaining = current.filter((row) => !agedOut(ageAt(row.birthDate, today))).length;
      const rng = createRng(seedFromString(`${team.id}-cantera-${seasonNumber}`));
      const count = Math.max(
        0,
        Math.min(intakeSize(team.youthLevel, rng), MAX_YOUTH_PLAYERS - remaining)
      );
      if (count === 0) {
        continue;
      }

      repository.insertPlayers(
        buildYouthPlayers({
          teamId: team.id,
          level: team.youthLevel,
          count,
          rng,
          seasonStartYear,
          nationality: team.country
        })
      );
    }
  }

  // ------------------------------------------------------------------------

  private requireManaged(repository: YouthRepository, teamId: string) {
    const team = repository.findTeam(teamId);
    if (!team) {
      throw new TeamNotFoundError(teamId);
    }
    if (repository.managedTeamId() !== teamId) {
      throw new NotManagedTeamError(teamId);
    }
    return team;
  }
}

function toYouthPlayer(row: PlayerRow, today: Date): YouthPlayer {
  const attributes: PlayerAttributes = {
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
  const position = row.position as Position;

  return {
    playerId: row.id,
    playerName: `${row.firstName} ${row.lastName}`,
    age: ageAt(row.birthDate, today),
    position,
    secondaryPosition: (row.secondaryPosition as Position | null) ?? null,
    overall: overallForPosition(attributes, position),
    potential: row.potential,
    heightCm: row.heightCm
  };
}
