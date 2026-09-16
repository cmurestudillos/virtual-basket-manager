import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '@shared/ipc-channels';
import { requireActiveSaveDatabase } from '../../database/resolve-save-database';
import { HistoryService } from './history.service';

export function registerHistoryIpcHandlers(): void {
  const service = new HistoryService(requireActiveSaveDatabase);

  ipcMain.handle(IPC_CHANNELS.historyGet, () => service.get());
}
