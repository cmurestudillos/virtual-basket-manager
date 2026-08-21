import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '@shared/ipc-channels';
import type { SettingsKey } from '@shared/contracts/settings.contract';
import { getAppDatabase } from '../../database/client';
import { SettingsRepository } from './settings.repository';
import { SettingsService } from './settings.service';

export function registerSettingsIpcHandlers(): void {
  const service = new SettingsService(new SettingsRepository(getAppDatabase()));

  ipcMain.handle(IPC_CHANNELS.settingsGet, (_event, key: SettingsKey) => service.get(key));

  ipcMain.handle(IPC_CHANNELS.settingsSet, (_event, key: SettingsKey, value: string) => {
    service.set(key, value);
  });
}
