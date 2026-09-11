import { z } from 'zod';
import {
  DEFENSIVE_SYSTEMS,
  OFFENSIVE_SYSTEMS,
  SLIDER_MAX,
  SLIDER_MIN,
  type TeamTactics
} from '@shared/domain/tactics';

export const saveTacticsRequestSchema = z.object({
  teamId: z.string().min(1),
  offensiveSystem: z.enum(OFFENSIVE_SYSTEMS),
  defensiveSystem: z.enum(DEFENSIVE_SYSTEMS),
  pace: z.number().int().min(SLIDER_MIN).max(SLIDER_MAX),
  defensiveIntensity: z.number().int().min(SLIDER_MIN).max(SLIDER_MAX),
  offensiveReboundEffort: z.number().int().min(SLIDER_MIN).max(SLIDER_MAX),
  /** Referencia ofensiva; `null` es reparto sin estrella designada. */
  focusPlayerId: z.string().min(1).nullable()
});

export type SaveTacticsRequest = z.infer<typeof saveTacticsRequestSchema>;

export interface TeamTacticsView extends TeamTactics {
  teamId: string;
  teamName: string;
  /** Nombre de la referencia ofensiva, para no tener que cruzarlo en la pantalla. */
  focusPlayerName: string | null;
  isManaged: boolean;
}

export interface TacticsApi {
  get: (teamId: string) => Promise<TeamTacticsView>;
  save: (request: SaveTacticsRequest) => Promise<TeamTacticsView>;
}
