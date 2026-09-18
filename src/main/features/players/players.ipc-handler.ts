import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '@shared/ipc-channels';
import { requireActiveSaveDatabase } from '../../database/resolve-save-database';
import { PlayersService } from './players.service';

export function registerPlayersIpcHandlers(): void {
  const service = new PlayersService(requireActiveSaveDatabase);

  ipcMain.handle(IPC_CHANNELS.playersListByTeam, (_event, teamId: string) =>
    service.listByTeam(teamId)
  );
  ipcMain.handle(IPC_CHANNELS.playersGet, (_event, id: string) => service.get(id));
}
