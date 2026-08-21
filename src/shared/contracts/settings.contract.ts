import { z } from 'zod';

/**
 * Claves de ajuste conocidas. El esquema Zod es la única frontera de
 * validación que cruza cada llamada renderer -> preload -> main, así que una
 * clave inválida nunca llega al repositorio.
 */
export const settingsKeySchema = z.enum(['resolution', 'ruleset']);
export type SettingsKey = z.infer<typeof settingsKeySchema>;

export const settingsGetRequestSchema = z.object({
  key: settingsKeySchema
});

export const settingsSetRequestSchema = z.object({
  key: settingsKeySchema,
  value: z.string().min(1).max(200)
});

/** Forma que expone el puente de preload en `window.api.settings`. */
export interface SettingsApi {
  get: (key: SettingsKey) => Promise<string | null>;
  set: (key: SettingsKey, value: string) => Promise<void>;
}
