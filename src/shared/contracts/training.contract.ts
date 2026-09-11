import { z } from 'zod';
import type { Position } from '@shared/domain/positions';
import { TRAINING_FOCUSES, type TrainingFocus } from '@shared/domain/training';

export const trainingFocusSchema = z.enum(TRAINING_FOCUSES);

export const saveTrainingPlanRequestSchema = z.object({
  teamId: z.string().min(1),
  /** Intensidad del bloque, 1-10. */
  intensity: z.number().int().min(1).max(10),
  focus: trainingFocusSchema,
  /** Focos individuales; `null` en un jugador significa «el del bloque». */
  players: z
    .array(
      z.object({
        playerId: z.string().min(1),
        focus: trainingFocusSchema.nullable()
      })
    )
    .max(40)
});

export type SaveTrainingPlanRequest = z.infer<typeof saveTrainingPlanRequestSchema>;

export interface TrainingPlayer {
  playerId: string;
  playerName: string;
  position: Position;
  age: number;
  overall: number;
  potential: number;
  condition: number;
  /** «Fresco», «Cargado»… lo que se lee de un vistazo en la plantilla. */
  conditionLabel: string;
  /** Foco propio; `null` si sigue al del bloque. */
  focus: TrainingFocus | null;
  /** El que se le aplica de verdad: el suyo, o el del bloque si no tiene. */
  effectiveFocus: TrainingFocus;
  injuryName: string | null;
  injuryDaysLeft: number;
  /** «3 semanas», «Disponible». */
  injuryLabel: string;
  available: boolean;
}

export interface TeamTrainingPlan {
  teamId: string;
  teamName: string;
  intensity: number;
  focus: TrainingFocus;
  players: TrainingPlayer[];
  /** Cuántos hay en la enfermería ahora mismo. */
  injuredCount: number;
  /** Sólo el plan del equipo del usuario se puede escribir. */
  isManaged: boolean;
}

export interface TrainingApi {
  getPlan: (teamId: string) => Promise<TeamTrainingPlan>;
  savePlan: (request: SaveTrainingPlanRequest) => Promise<TeamTrainingPlan>;
}
