import {
  playerPatchSchema,
  teamPatchSchema,
  type EditorOverview,
  type EditorPlayer,
  type EditorResult,
  type EditorTeam,
  type PlayerPatch,
  type TeamPatch
} from '@shared/contracts/world-editor.contract';
import { overallForPosition } from '@shared/domain/attributes';
import type { Position } from '@shared/domain/positions';
import { MAX_ROSTER } from '@shared/domain/youth';
import { MIN_ROSTER } from '../market/market.service';
import { loadDataset, type Dataset, type DatasetPlayer } from '../saves/dataset';
import {
  applyWorldEdits,
  effectivePlayerPatch,
  effectiveTeamPatch,
  type WorldEdit
} from './apply-world-edits';
import type { WorldEditorRepository } from './world-editor.repository';

/**
 * El editor del mundo base.
 *
 * Trabaja siempre sobre dos capas: el dataset original, que nunca se toca, y
 * las ediciones del usuario encima. Todo lo que enseña es el resultado de
 * aplicar la segunda sobre la primera —lo mismo que recibirá la próxima partida
 * nueva—, y todo lo que guarda es la diferencia, nunca el club entero.
 *
 * Las partidas ya empezadas no se enteran: se siembran al crearse, y a partir
 * de ahí son suyas.
 */
export class WorldEditorService {
  constructor(
    private readonly repository: WorldEditorRepository,
    private readonly seedDirectory: string
  ) {}

  /** El mundo tal y como lo recibirá la próxima partida nueva. */
  merged(): Dataset {
    return applyWorldEdits(this.original(), this.repository.all());
  }

  overview(): EditorOverview {
    const edits = this.repository.all();
    const world = applyWorldEdits(this.original(), edits);
    const edited = this.editedTeamIds(edits);

    const rosterSize = new Map<string, number>();
    for (const player of world.players) {
      rosterSize.set(player.teamId, (rosterSize.get(player.teamId) ?? 0) + 1);
    }

    return {
      leagues: world.competitions
        .filter((competition) => competition.format === 'league')
        .map((competition) => ({
          competitionId: competition.id,
          name: competition.name,
          country: competition.country,
          tier: competition.tier,
          teams: world.teams.filter((team) => team.competitionId === competition.id).length
        })),
      teams: world.teams.map((team) => ({
        teamId: team.id,
        name: team.name,
        city: team.city,
        competitionId: team.competitionId,
        reputation: team.reputation,
        rosterSize: rosterSize.get(team.id) ?? 0,
        edited: edited.has(team.id)
      })),
      editedTeams: edits.filter((edit) => edit.entityType === 'team').length,
      editedPlayers: edits.filter((edit) => edit.entityType === 'player').length
    };
  }

  team(teamId: string): EditorTeam | null {
    const edits = this.repository.all();
    const world = applyWorldEdits(this.original(), edits);
    const team = world.teams.find((row) => row.id === teamId);
    if (!team) {
      return null;
    }

    const editedPlayers = new Set(
      edits.filter((edit) => edit.entityType === 'player').map((edit) => edit.entityId)
    );
    const competition = world.competitions.find((row) => row.id === team.competitionId);

    return {
      teamId: team.id,
      name: team.name,
      shortName: team.shortName,
      city: team.city,
      country: team.country,
      competitionId: team.competitionId,
      competitionName: competition?.name ?? team.competitionId,
      pavilionName: team.pavilionName,
      pavilionCapacity: team.pavilionCapacity,
      reputation: team.reputation,
      budgetCents: team.budgetCents,
      edited: this.editedTeamIds(edits).has(team.id),
      players: world.players
        .filter((player) => player.teamId === team.id)
        .map((player) =>
          toEditorPlayer(player, world.seasonStartYear, editedPlayers.has(player.id))
        )
        .sort((a, b) => b.overall - a.overall)
    };
  }

  updateTeam(teamId: string, patch: TeamPatch): EditorResult<EditorTeam> {
    const parsed = teamPatchSchema.safeParse(patch);
    if (!parsed.success) {
      return refuse(firstIssue(parsed.error));
    }
    const original = this.original().teams.find((row) => row.id === teamId);
    if (!original) {
      return refuse('Ese club no existe en el mundo base');
    }

    const existing = (this.repository.find('team', teamId)?.data ?? {}) as TeamPatch;
    const next = effectiveTeamPatch(original as unknown as Record<string, unknown>, {
      ...existing,
      ...parsed.data
    });
    this.save('team', teamId, next);
    return accept(this.team(teamId));
  }

  updatePlayer(playerId: string, patch: PlayerPatch): EditorResult<EditorTeam> {
    const parsed = playerPatchSchema.safeParse(patch);
    if (!parsed.success) {
      return refuse(firstIssue(parsed.error));
    }
    const original = this.original().players.find((row) => row.id === playerId);
    if (!original) {
      return refuse('Ese jugador no existe en el mundo base');
    }

    const existing = (this.repository.find('player', playerId)?.data ?? {}) as PlayerPatch & {
      teamId?: string;
    };
    const next = effectivePlayerPatch(asRecord(original), {
      ...existing,
      ...parsed.data,
      attributes: { ...(existing.attributes ?? {}), ...(parsed.data.attributes ?? {}) }
    });
    this.save('player', playerId, next);

    const teamId = applyWorldEdits(this.original(), this.repository.all()).players.find(
      (row) => row.id === playerId
    )?.teamId;
    return accept(teamId ? this.team(teamId) : null);
  }

  /**
   * Pasa un jugador a otra plantilla.
   *
   * Respeta los límites con los que se juega: ninguna plantilla por debajo de
   * diez ni por encima de catorce. Un club de nueve no puede vestir a doce en
   * la primera jornada de la partida que se cree con él.
   */
  movePlayer(playerId: string, toTeamId: string): EditorResult<EditorTeam> {
    const world = this.merged();
    const player = world.players.find((row) => row.id === playerId);
    const target = world.teams.find((row) => row.id === toTeamId);
    if (!player) {
      return refuse('Ese jugador no existe en el mundo base');
    }
    if (!target) {
      return refuse('Ese club no existe en el mundo base');
    }
    if (player.teamId === toTeamId) {
      return refuse('Ya juega en ese club');
    }

    const size = (teamId: string): number =>
      world.players.filter((row) => row.teamId === teamId).length;
    if (size(player.teamId) <= MIN_ROSTER) {
      return refuse(`Su club se quedaría por debajo de ${MIN_ROSTER} jugadores`);
    }
    if (size(toTeamId) >= MAX_ROSTER) {
      return refuse(`${target.name} ya tiene ${MAX_ROSTER} jugadores`);
    }

    const fromTeamId = player.teamId;
    const original = this.original().players.find((row) => row.id === playerId) as DatasetPlayer;
    const existing = (this.repository.find('player', playerId)?.data ?? {}) as PlayerPatch & {
      teamId?: string;
    };
    this.save(
      'player',
      playerId,
      effectivePlayerPatch(asRecord(original), { ...existing, teamId: toTeamId })
    );
    return accept(this.team(fromTeamId));
  }

  /**
   * Devuelve un club al original: sus datos y los jugadores que eran suyos.
   * Los que llegaron de otro club se restauran desde el suyo.
   */
  resetTeam(teamId: string): EditorResult<EditorTeam> {
    const original = this.original();
    if (!original.teams.some((row) => row.id === teamId)) {
      return refuse('Ese club no existe en el mundo base');
    }
    this.repository.remove('team', teamId);
    this.repository.removePlayers(
      original.players.filter((row) => row.teamId === teamId).map((row) => row.id)
    );
    return accept(this.team(teamId));
  }

  resetAll(): EditorOverview {
    this.repository.removeAll();
    return this.overview();
  }

  // ------------------------------------------------------------------------

  private original(): Dataset {
    return loadDataset(this.seedDirectory);
  }

  private save(entityType: 'team' | 'player', entityId: string, data: object): void {
    if (Object.keys(data).length === 0) {
      this.repository.remove(entityType, entityId);
    } else {
      this.repository.upsert(entityType, entityId, data);
    }
  }

  /** Clubes con cambios propios o con algún jugador cambiado, en su plantilla de antes o de ahora. */
  private editedTeamIds(edits: readonly WorldEdit[]): Set<string> {
    const original = this.original();
    const originalTeam = new Map(original.players.map((row) => [row.id, row.teamId]));
    const ids = new Set<string>();
    for (const edit of edits) {
      if (edit.entityType === 'team') {
        ids.add(edit.entityId);
        continue;
      }
      const from = originalTeam.get(edit.entityId);
      if (from) ids.add(from);
      if (edit.data.teamId) ids.add(edit.data.teamId);
    }
    return ids;
  }
}

function toEditorPlayer(
  player: DatasetPlayer,
  seasonStartYear: number,
  edited: boolean
): EditorPlayer {
  const born = new Date(player.birthDate);
  const seasonStart = new Date(Date.UTC(seasonStartYear, 8, 1));
  let age = seasonStart.getUTCFullYear() - born.getUTCFullYear();
  if (
    seasonStart.getUTCMonth() < born.getUTCMonth() ||
    (seasonStart.getUTCMonth() === born.getUTCMonth() &&
      seasonStart.getUTCDate() < born.getUTCDate())
  ) {
    age -= 1;
  }

  return {
    playerId: player.id,
    teamId: player.teamId,
    firstName: player.firstName,
    lastName: player.lastName,
    nationality: player.nationality,
    position: player.position,
    heightCm: player.heightCm,
    age,
    potential: player.potential,
    overall: overallForPosition(player.attributes, player.position as Position),
    attributes: { ...player.attributes },
    edited
  };
}

function asRecord(player: DatasetPlayer) {
  return player as unknown as { teamId: string; attributes: Record<string, number> } & Record<
    string,
    unknown
  >;
}

function refuse<T>(reason: string): EditorResult<T> {
  return { ok: false, reason, value: null };
}

function accept<T>(value: T | null): EditorResult<T> {
  return { ok: true, reason: null, value };
}

function firstIssue(error: { issues: { path: PropertyKey[]; message: string }[] }): string {
  const issue = error.issues[0];
  if (!issue) {
    return 'Hay un dato que no es válido';
  }
  const field = issue.path.map(String).join('.');
  return field ? `El campo ${field} no es válido: ${issue.message}` : issue.message;
}
