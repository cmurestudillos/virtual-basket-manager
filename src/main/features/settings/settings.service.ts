import {
  settingsGetRequestSchema,
  settingsSetRequestSchema,
  type SettingsKey
} from '@shared/contracts/settings.contract';
import { isRulesetMode } from '@shared/domain/ruleset-mode';
import { parseWindowResolution } from '@shared/domain/window-resolution';
import type { SettingsRepository } from './settings.repository';

export class InvalidSettingValueError extends Error {
  constructor(key: SettingsKey, value: string) {
    super(`«${value}» no es un valor válido para ${key}`);
    this.name = 'InvalidSettingValueError';
  }
}

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
    // Cada clave tiene sus valores: una resolución inventada no puede llegar a
    // la ventana, ni un reglamento que no existe a la próxima partida.
    const valid =
      validated.key === 'resolution'
        ? parseWindowResolution(validated.value) !== null
        : isRulesetMode(validated.value);
    if (!valid) {
      throw new InvalidSettingValueError(validated.key, validated.value);
    }
    this.repository.upsert(validated.key, validated.value);
  }
}
