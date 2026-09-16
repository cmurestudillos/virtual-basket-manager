import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '@shared/ipc-channels';
import { UpdatesService } from './updates.service';

/** Una sola instancia: el estado de la descarga es de la aplicación, no de una ventana. */
let service: UpdatesService | null = null;

export function getUpdatesService(): UpdatesService {
  service ??= new UpdatesService();
  return service;
}

export function registerUpdatesIpcHandlers(): void {
  const updates = getUpdatesService();

  ipcMain.handle(IPC_CHANNELS.updatesGet, () => updates.view());
  ipcMain.handle(IPC_CHANNELS.updatesCheck, () => updates.check());
  ipcMain.handle(IPC_CHANNELS.updatesInstall, () => {
    updates.install();
  });
}
