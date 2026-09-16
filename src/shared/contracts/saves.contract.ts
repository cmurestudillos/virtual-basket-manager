import { z } from 'zod';

export const createSaveRequestSchema = z.object({
  name: z.string().trim().min(1).max(60),
  /** Equipo que dirigirá el usuario. */
  teamId: z.string().min(1),
  managerName: z.string().trim().min(1).max(60),
  /** Nacionalidad del entrenador; nula = la del país del club. */
  managerNationality: z.string().trim().length(3).toUpperCase().nullable().default(null),
  /** Con el despido apagado el consejo sigue opinando, pero no te echa. */
  dismissalEnabled: z.boolean().default(true),
  /** Modo carrera: si te echan, buscas otro banquillo en vez de acabar la partida. */
  careerMode: z.boolean().default(false),
  /**
   * Países cuyas ligas se juegan. El del club va siempre, esté o no en la
   * lista; vacía, se juega sólo ese.
   */
  activeCountries: z.array(z.string().trim().min(2).max(3)).max(20).default([]),
  /** Selección que dirige además del club, por su código de nacionalidad; nula si ninguna. */
  nationalTeam: z.string().trim().length(3).nullable().default(null)
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
