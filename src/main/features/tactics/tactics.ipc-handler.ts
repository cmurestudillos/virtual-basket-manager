import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '@shared/ipc-channels';
import type { SaveTacticsRequest } from '@shared/contracts/tactics.contract';
import { requireActiveSaveDatabase } from '../../database/resolve-save-database';
import { TacticsService } from './tactics.service';

export function registerTacticsIpcHandlers(): void {
  const service = new TacticsService(requireActiveSaveDatabase);

  ipcMain.handle(IPC_CHANNELS.tacticsGet, (_event, teamId: string) => service.get(teamId));
  ipcMain.handle(IPC_CHANNELS.tacticsSave, (_event, request: SaveTacticsRequest) =>
    service.save(request)
  );
}
