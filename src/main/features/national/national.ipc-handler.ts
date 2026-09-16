import { ipcMain } from 'electron';
import type { SaveCallupRequest } from '@shared/contracts/national.contract';
import { IPC_CHANNELS } from '@shared/ipc-channels';
import { requireActiveSaveDatabase } from '../../database/resolve-save-database';
import { NationalService } from './national.service';

export function registerNationalIpcHandlers(): void {
  const service = new NationalService(requireActiveSaveDatabase);

  ipcMain.handle(IPC_CHANNELS.nationalGetOverview, () => service.getOverview());
  ipcMain.handle(IPC_CHANNELS.nationalGetCallup, () => service.getCallup());
  ipcMain.handle(IPC_CHANNELS.nationalSaveCallup, (_event, request: SaveCallupRequest) =>
    service.saveCallup(request)
  );
}
