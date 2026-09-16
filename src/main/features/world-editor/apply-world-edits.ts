import type { PlayerPatch, TeamPatch } from '@shared/contracts/world-editor.contract';
import type { Dataset } from '../saves/dataset';

/** Una edición tal y como se guarda: a qué entidad y qué campos. */
export type WorldEdit =
  | { entityType: 'team'; entityId: string; data: TeamPatch }
  | { entityType: 'player'; entityId: string; data: PlayerPatch & { teamId?: string } };

/**
 * El mundo base con las ediciones del usuario encima.
 *
 * **No toca el dataset que recibe**: el cargador lo cachea para toda la sesión,
 * y mutarlo haría que una edición deshecha siguiera aplicada hasta reiniciar.
 * Sólo se copian los clubes y jugadores que cambian; el resto se comparte.
 *
 * Una edición de algo que ya no existe —un jugador que una versión nueva del
 * dataset quitó— se ignora en silencio: no hay nada sobre lo que aplicarla, y
 * romper la creación de partida por ello sería castigar al usuario por
 * actualizar el juego.
 */
export function applyWorldEdits(dataset: Dataset, edits: readonly WorldEdit[]): Dataset {
  if (edits.length === 0) {
    return dataset;
  }

  const teamEdits = new Map<string, TeamPatch>();
  const playerEdits = new Map<string, PlayerPatch & { teamId?: string }>();
  for (const edit of edits) {
    if (edit.entityType === 'team') teamEdits.set(edit.entityId, edit.data);
    else playerEdits.set(edit.entityId, edit.data);
  }

  const teamIds = new Set(dataset.teams.map((team) => team.id));

  return {
    ...dataset,
    teams: dataset.teams.map((team) => {
      const patch = teamEdits.get(team.id);
      return patch ? { ...team, ...patch } : team;
    }),
    players: dataset.players.map((player) => {
      const patch = playerEdits.get(player.id);
      if (!patch) {
        return player;
      }
      const { attributes, teamId, ...rest } = patch;
      return {
        ...player,
        ...rest,
        // Un traspaso a un club que ya no existe se descarta: el jugador se
        // queda donde estaba en el original.
        teamId: teamId && teamIds.has(teamId) ? teamId : player.teamId,
        attributes: attributes ? { ...player.attributes, ...attributes } : player.attributes
      };
    })
  };
}

/**
 * Lo que de verdad cambia de un parche respecto al original.
 *
 * Guardar un campo con el mismo valor que ya tenía no es una edición: si se
 * guardara, el club saldría marcado como editado para siempre y «restaurar» no
 * tendría nada que restaurar. Así, deshacer a mano un cambio lo borra.
 */
export function effectiveTeamPatch(original: Record<string, unknown>, patch: TeamPatch): TeamPatch {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(patch)) {
    if (value !== undefined && original[key] !== value) {
      result[key] = value;
    }
  }
  return result as TeamPatch;
}

export function effectivePlayerPatch(
  original: { teamId: string; attributes: Record<string, number> } & Record<string, unknown>,
  patch: PlayerPatch & { teamId?: string }
): PlayerPatch & { teamId?: string } {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined || key === 'attributes') {
      continue;
    }
    if (original[key] !== value) {
      result[key] = value;
    }
  }
  if (patch.attributes) {
    const attributes: Record<string, number> = {};
    for (const [key, value] of Object.entries(patch.attributes)) {
      if (value !== undefined && original.attributes[key] !== value) {
        attributes[key] = value;
      }
    }
    if (Object.keys(attributes).length > 0) {
      result.attributes = attributes;
    }
  }
  return result as PlayerPatch & { teamId?: string };
}
