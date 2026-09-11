import { z } from 'zod';
import { POSITIONS, type Position } from '@shared/domain/positions';
import { LINEUP_SIZE, MAX_TARGET_MINUTES } from '@shared/domain/rotation';

/** Posición válida, para los payloads que la traen del renderer. */
export const positionSchema = z.enum(POSITIONS);

export const rotationSlotInputSchema = z.object({
  playerId: z.string().min(1),
  depth: z.number().int().min(0).max(29),
  slotPosition: positionSchema,
  targetMinutes: z.number().int().min(0).max(MAX_TARGET_MINUTES)
});

export const saveRotationRequestSchema = z.object({
  teamId: z.string().min(1),
  /** La rotación entera, de titular a último: no se guarda por trozos. */
  slots: z.array(rotationSlotInputSchema).min(LINEUP_SIZE).max(30)
});

export type RotationSlotInput = z.infer<typeof rotationSlotInputSchema>;
export type SaveRotationRequest = z.infer<typeof saveRotationRequestSchema>;

export const teamIdRequestSchema = z.object({ teamId: z.string().min(1) });

/** Un hueco de la rotación con lo que la pantalla necesita pintar del jugador. */
export interface RotationSlotView {
  playerId: string;
  playerName: string;
  /** Posición natural del jugador, que no tiene por qué ser la que juega. */
  position: Position;
  secondaryPosition: Position | null;
  overall: number;
  condition: number;
  /** Días de baja; 0 = disponible. Un lesionado no sale a la pista. */
  injuryDaysLeft: number;
  depth: number;
  slotPosition: Position;
  targetMinutes: number;
  isStarter: boolean;
  /**
   * Penalización por jugar fuera de sitio, 0-100: 100 es su posición natural.
   * Se calcula aquí porque es lo que convierte la pantalla en una decisión y no
   * en un formulario — poner al base de pívot tiene que verse antes de jugar.
   */
  positionFit: number;
}

export interface TeamRotation {
  teamId: string;
  teamName: string;
  /** Plantilla entera en orden de rotación; los que no juegan van con 0 minutos. */
  slots: RotationSlotView[];
  totalTargetMinutes: number;
  /** Minutos que reparte un equipo en un partido: 200. */
  regulationTeamMinutes: number;
  /** Si es el equipo del usuario. Sólo ese se puede editar. */
  isManaged: boolean;
}

export interface RotationApi {
  get: (teamId: string) => Promise<TeamRotation>;
  save: (request: SaveRotationRequest) => Promise<TeamRotation>;
  /** Rotación automática: la misma que propone el juego al crear la partida. */
  auto: (teamId: string) => Promise<TeamRotation>;
}
