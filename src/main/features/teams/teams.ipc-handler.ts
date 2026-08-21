import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '@shared/ipc-channels';
import { getSeedDataDirectory } from '../../config/paths';
import { TeamsService } from './teams.service';

export function registerTeamsIpcHandlers(): void {
  const service = new TeamsService(getSeedDataDirectory());

  ipcMain.handle(IPC_CHANNELS.teamsList, () => service.list());
  ipcMain.handle(IPC_CHANNELS.teamsGet, (_event, id: string) => service.get(id));
  ipcMain.handle(IPC_CHANNELS.teamsListCatalog, () => service.listCatalog());
}
