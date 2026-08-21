import {
  settingsGetRequestSchema,
  settingsSetRequestSchema,
  type SettingsKey
} from '@shared/contracts/settings.contract';
import type { SettingsRepository } from './settings.repository';

/**
 * Lógica de negocio de los ajustes. Cada lectura y escritura se revalida aquí
 * con Zod aunque la frontera IPC ya reciba un valor tipado: los payloads de
 * `ipcRenderer.invoke` cruzan una serialización y no se pueden dar por buenos
 * sólo por los tipos de TypeScript.
 */
export class SettingsService {
  constructor(private readonly repository: SettingsRepository) {}

  get(key: SettingsKey): string | null {
    const validated = settingsGetRequestSchema.parse({ key });
    return this.repository.findByKey(validated.key);
  }

  set(key: SettingsKey, value: string): void {
    const validated = settingsSetRequestSchema.parse({ key, value });
    this.repository.upsert(validated.key, validated.value);
  }
}
