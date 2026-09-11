import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '@shared/ipc-channels';
import { requireActiveSaveDatabase } from '../../database/resolve-save-database';
import { SeasonService } from './season.service';

export function registerSeasonIpcHandlers(): void {
  const service = new SeasonService(requireActiveSaveDatabase);

  ipcMain.handle(IPC_CHANNELS.seasonGetCurrent, () => service.getCurrent());
  ipcMain.handle(IPC_CHANNELS.seasonGetStandings, () => service.getStandings());
  ipcMain.handle(IPC_CHANNELS.seasonListFixtures, (_event, round?: number) =>
    service.listFixtures(round)
  );
  ipcMain.handle(IPC_CHANNELS.seasonListTeamFixtures, (_event, teamId: string) =>
    service.listTeamFixtures(teamId)
  );
  ipcMain.handle(IPC_CHANNELS.seasonGetNextGame, () => service.getNextGame());
  ipcMain.handle(IPC_CHANNELS.seasonAdvanceDay, () => service.advanceDay());
  ipcMain.handle(IPC_CHANNELS.seasonAdvanceToNextGame, () => service.advanceToNextGame());
  ipcMain.handle(IPC_CHANNELS.seasonGetPlayoffs, () => service.getPlayoffs());
  ipcMain.handle(IPC_CHANNELS.seasonStartNext, () => service.startNextSeason());
}
