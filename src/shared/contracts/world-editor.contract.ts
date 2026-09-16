import { z } from 'zod';
import { ATTRIBUTE_KEYS } from '@shared/domain/attributes';
import { POSITIONS } from '@shared/domain/positions';

/**
 * El editor del mundo base: clubes y jugadores de las partidas nuevas.
 *
 * Lo que cruza el puente se valida aquí, con límites de verdad: un pabellón de
 * cinco espectadores o un triple de 400 no rompen el formulario, rompen la
 * partida que se cree después, y eso ya no se ve en el editor.
 */

const name = z.string().trim().min(1).max(60);
const rating = z.number().int().min(1).max(99);

export const teamPatchSchema = z
  .object({
    name,
    shortName: z.string().trim().min(2).max(4),
    city: name,
    pavilionName: name,
    pavilionCapacity: z.number().int().min(1000).max(30000),
    reputation: z.number().int().min(1).max(100),
    budgetCents: z.number().int().min(0).max(100_000_000_000)
  })
  .partial()
  .strict();
export type TeamPatch = z.infer<typeof teamPatchSchema>;

export const playerPatchSchema = z
  .object({
    firstName: name,
    lastName: name,
    nationality: z.string().trim().length(3).toUpperCase(),
    position: z.enum(POSITIONS),
    heightCm: z.number().int().min(160).max(240),
    potential: rating,
    attributes: z.object(Object.fromEntries(ATTRIBUTE_KEYS.map((key) => [key, rating]))).partial()
  })
  .partial()
  .strict();
export type PlayerPatch = z.infer<typeof playerPatchSchema>;

export interface EditorLeague {
  competitionId: string;
  name: string;
  country: string;
  tier: number;
  teams: number;
}

export interface EditorTeamSummary {
  teamId: string;
  name: string;
  city: string;
  competitionId: string;
  reputation: number;
  rosterSize: number;
  /** Este club, o alguno de sus jugadores, tiene cambios sobre el original. */
  edited: boolean;
}

export interface EditorPlayer {
  playerId: string;
  teamId: string;
  firstName: string;
  lastName: string;
  nationality: string;
  position: string;
  heightCm: number;
  age: number;
  potential: number;
  overall: number;
  attributes: Record<string, number>;
  edited: boolean;
}

export interface EditorTeam {
  teamId: string;
  name: string;
  shortName: string;
  city: string;
  country: string;
  competitionId: string;
  competitionName: string;
  pavilionName: string;
  pavilionCapacity: number;
  reputation: number;
  budgetCents: number;
  edited: boolean;
  players: EditorPlayer[];
}

export interface EditorOverview {
  leagues: EditorLeague[];
  teams: EditorTeamSummary[];
  /** Clubes y jugadores con cambios, para la cabecera. */
  editedTeams: number;
  editedPlayers: number;
}

/** El «no» del editor lleva siempre su motivo. */
export interface EditorResult<T> {
  ok: boolean;
  reason: string | null;
  value: T | null;
}

export interface WorldEditorApi {
  overview: () => Promise<EditorOverview>;
  team: (teamId: string) => Promise<EditorTeam | null>;
  updateTeam: (teamId: string, patch: TeamPatch) => Promise<EditorResult<EditorTeam>>;
  updatePlayer: (playerId: string, patch: PlayerPatch) => Promise<EditorResult<EditorTeam>>;
  /** Pasa un jugador a otra plantilla, respetando el mínimo y el máximo de cada una. */
  movePlayer: (playerId: string, toTeamId: string) => Promise<EditorResult<EditorTeam>>;
  /** Devuelve un club y sus jugadores al original. */
  resetTeam: (teamId: string) => Promise<EditorResult<EditorTeam>>;
  /** Devuelve el mundo entero al original. */
  resetAll: () => Promise<EditorOverview>;
}
