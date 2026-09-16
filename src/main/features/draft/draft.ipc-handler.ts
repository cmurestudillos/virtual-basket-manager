import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '@shared/ipc-channels';
import { requireActiveSaveDatabase } from '../../database/resolve-save-database';
import { DraftService } from './draft.service';

export function registerDraftIpcHandlers(): void {
  const service = new DraftService(requireActiveSaveDatabase);

  ipcMain.handle(IPC_CHANNELS.draftGet, () => service.get());
  ipcMain.handle(IPC_CHANNELS.draftSimulateToUser, () => service.simulateToUser());
  ipcMain.handle(IPC_CHANNELS.draftPick, (_event, playerId: string) => service.pick(playerId));
  ipcMain.handle(IPC_CHANNELS.draftPass, () => service.pass());
  ipcMain.handle(IPC_CHANNELS.draftSimulateAll, () => service.simulateAll());
}
