import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '@shared/ipc-channels';
import type { PromotePlayerRequest, UpgradeYouthRequest } from '@shared/contracts/youth.contract';
import { requireActiveSaveDatabase } from '../../database/resolve-save-database';
import { YouthService } from './youth.service';

export function registerYouthIpcHandlers(): void {
  const service = new YouthService(requireActiveSaveDatabase);

  ipcMain.handle(IPC_CHANNELS.youthGet, (_event, teamId: string) => service.get(teamId));
  ipcMain.handle(IPC_CHANNELS.youthPromote, (_event, request: PromotePlayerRequest) =>
    service.promote(request)
  );
  ipcMain.handle(IPC_CHANNELS.youthUpgrade, (_event, request: UpgradeYouthRequest) =>
    service.upgrade(request)
  );
}
