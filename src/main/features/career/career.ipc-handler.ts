import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '@shared/ipc-channels';
import { requireActiveSaveDatabase } from '../../database/resolve-save-database';
import { CareerService } from './career.service';

export function registerCareerIpcHandlers(): void {
  const service = new CareerService(requireActiveSaveDatabase);

  ipcMain.handle(IPC_CHANNELS.careerGetStatus, () => service.getStatus());
  ipcMain.handle(IPC_CHANNELS.careerAccept, (_event, teamId: string) => service.accept(teamId));
  ipcMain.handle(IPC_CHANNELS.careerResign, () => service.resign());
  ipcMain.handle(IPC_CHANNELS.careerWait, () => service.wait());
}
