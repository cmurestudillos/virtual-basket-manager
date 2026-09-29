import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '@shared/ipc-channels';
import { requireActiveSaveDatabase } from '../../database/resolve-save-database';
import { TrophyService } from './trophies.service';

/** Trofeos, pantallas de campeón y gala (2026-09-29). */
export function registerTrophiesIpcHandlers(): void {
  const service = new TrophyService(requireActiveSaveDatabase);

  ipcMain.handle(IPC_CHANNELS.trophiesListPending, () => service.listPending());
  ipcMain.handle(IPC_CHANNELS.trophiesMarkSeen, (_event, celebrationId: string) =>
    service.markSeen(celebrationId)
  );
  ipcMain.handle(IPC_CHANNELS.trophiesGetGala, (_event, seasonId: string) =>
    service.getGala(seasonId)
  );
  ipcMain.handle(IPC_CHANNELS.trophiesGetManagerCabinet, () => service.getManagerCabinet());
}
