import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '@shared/ipc-channels';
import type { SaveRotationRequest } from '@shared/contracts/rotation.contract';
import { requireActiveSaveDatabase } from '../../database/resolve-save-database';
import { RotationService } from './rotation.service';

export function registerRotationIpcHandlers(): void {
  const service = new RotationService(requireActiveSaveDatabase);

  ipcMain.handle(IPC_CHANNELS.rotationGet, (_event, teamId: string) => service.get(teamId));
  ipcMain.handle(IPC_CHANNELS.rotationSave, (_event, request: SaveRotationRequest) =>
    service.save(request)
  );
  ipcMain.handle(IPC_CHANNELS.rotationAuto, (_event, teamId: string) => service.auto(teamId));
}
