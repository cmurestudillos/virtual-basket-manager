import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '@shared/ipc-channels';
import { getSeedDataDirectory } from '../../config/paths';
import { getAppDatabase } from '../../database/client';
import { WorldEditorRepository } from '../world-editor/world-editor.repository';
import { TeamsService } from './teams.service';

export function registerTeamsIpcHandlers(): void {
  const worldEdits = new WorldEditorRepository(getAppDatabase());
  const service = new TeamsService(getSeedDataDirectory(), () => worldEdits.all());

  ipcMain.handle(IPC_CHANNELS.teamsList, () => service.list());
  ipcMain.handle(IPC_CHANNELS.teamsGet, (_event, id: string) => service.get(id));
  ipcMain.handle(IPC_CHANNELS.teamsListCatalog, () => service.listCatalog());
  ipcMain.handle(IPC_CHANNELS.teamsListLeagues, () => service.listLeagues());
  ipcMain.handle(IPC_CHANNELS.teamsListScope, () => service.listScope());
}
