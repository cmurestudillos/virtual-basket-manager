import { BrowserWindow, ipcMain } from 'electron';
import { parseWindowResolution } from '@shared/domain/window-resolution';
import { IPC_CHANNELS } from '@shared/ipc-channels';
import type { SettingsKey } from '@shared/contracts/settings.contract';
import { getAppDatabase } from '../../database/client';
import { SettingsRepository } from './settings.repository';
import { SettingsService } from './settings.service';

export function registerSettingsIpcHandlers(): void {
  const service = new SettingsService(new SettingsRepository(getAppDatabase()));

  ipcMain.handle(IPC_CHANNELS.settingsGet, (_event, key: SettingsKey) => service.get(key));

  ipcMain.handle(IPC_CHANNELS.settingsSet, (event, key: SettingsKey, value: string) => {
    service.set(key, value);
    // La resolución se nota al momento: la ventana cambia de tamaño y se
    // recentra, sin esperar al próximo arranque.
    if (key === 'resolution') {
      const size = parseWindowResolution(value);
      const window = BrowserWindow.fromWebContents(event.sender);
      if (size && window && !window.isMaximized() && !window.isFullScreen()) {
        window.setSize(size.width, size.height);
        window.center();
      }
    }
  });
}
