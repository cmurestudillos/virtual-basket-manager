import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '@shared/ipc-channels';
import { getSeedDataDirectory } from '../../config/paths';
import { getAppDatabase } from '../../database/client';
import { requireActiveSaveDatabase } from '../../database/resolve-save-database';
import { WorldEditorRepository } from '../world-editor/world-editor.repository';
import { TeamProfileService } from './team-profile.service';
import { TeamsService } from './teams.service';

export function registerTeamsIpcHandlers(): void {
  const worldEdits = new WorldEditorRepository(getAppDatabase());
  const service = new TeamsService(
    getSeedDataDirectory(),
    () => worldEdits.all(),
    requireActiveSaveDatabase
  );
  const profiles = new TeamProfileService(requireActiveSaveDatabase);

  ipcMain.handle(IPC_CHANNELS.teamsList, () => service.list());
  ipcMain.handle(IPC_CHANNELS.teamsGet, (_event, id: string) => service.get(id));
  ipcMain.handle(IPC_CHANNELS.teamsListCatalog, () => service.listCatalog());
  ipcMain.handle(IPC_CHANNELS.teamsListLeagues, () => service.listLeagues());
  ipcMain.handle(IPC_CHANNELS.teamsListScope, () => service.listScope());
  ipcMain.handle(IPC_CHANNELS.teamsGetProfile, (_event, teamId: string) => profiles.get(teamId));
}
