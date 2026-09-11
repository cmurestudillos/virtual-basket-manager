import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '@shared/ipc-channels';
import type { StaffRequest } from '@shared/contracts/staff.contract';
import { requireActiveSaveDatabase } from '../../database/resolve-save-database';
import { StaffService } from './staff.service';

export function registerStaffIpcHandlers(): void {
  const service = new StaffService(requireActiveSaveDatabase);

  ipcMain.handle(IPC_CHANNELS.staffGet, (_event, teamId: string) => service.get(teamId));
  ipcMain.handle(IPC_CHANNELS.staffHire, (_event, request: StaffRequest) => service.hire(request));
  ipcMain.handle(IPC_CHANNELS.staffFire, (_event, request: StaffRequest) => service.fire(request));
}
