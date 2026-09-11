import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '@shared/ipc-channels';
import { requireActiveSaveDatabase } from '../../database/resolve-save-database';
import { StatsService } from './stats.service';

export function registerStatsIpcHandlers(): void {
  const service = new StatsService(requireActiveSaveDatabase);

  ipcMain.handle(IPC_CHANNELS.statsTeamSeason, (_event, teamId: string) =>
    service.teamSeason(teamId)
  );
  ipcMain.handle(IPC_CHANNELS.statsLeaders, (_event, category: string, limit?: number) =>
    service.leaders(category, limit)
  );
}
