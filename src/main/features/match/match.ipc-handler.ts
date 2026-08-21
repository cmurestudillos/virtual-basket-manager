import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '@shared/ipc-channels';
import { requireActiveSaveDatabase } from '../../database/resolve-save-database';
import { MatchService } from './match.service';

export function registerMatchIpcHandlers(): void {
  const service = new MatchService(requireActiveSaveDatabase);

  ipcMain.handle(IPC_CHANNELS.matchStart, (_event, gameId: string) => service.start(gameId));
  ipcMain.handle(IPC_CHANNELS.matchAdvancePeriod, (_event, gameId: string) =>
    service.advancePeriod(gameId)
  );
  ipcMain.handle(IPC_CHANNELS.matchGet, (_event, gameId: string) => service.get(gameId));
}
