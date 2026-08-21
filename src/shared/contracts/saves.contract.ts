import { z } from 'zod';

export const createSaveRequestSchema = z.object({
  name: z.string().trim().min(1).max(60),
  /** Equipo que dirigirá el usuario. */
  teamId: z.string().min(1),
  managerName: z.string().trim().min(1).max(60)
});
export type CreateSaveRequest = z.infer<typeof createSaveRequestSchema>;

export const saveIdSchema = z.object({ id: z.string().min(1) });

export interface SaveSummary {
  id: string;
  name: string;
  fileName: string;
  createdAt: number;
  lastPlayedAt: number | null;
  /** Nombre del equipo dirigido; se lee del propio fichero de la partida. */
  teamName: string | null;
  managerName: string | null;
  seasonNumber: number | null;
}

export interface SavesApi {
  list: () => Promise<SaveSummary[]>;
  create: (request: CreateSaveRequest) => Promise<SaveSummary>;
  load: (id: string) => Promise<SaveSummary>;
  delete: (id: string) => Promise<void>;
}
