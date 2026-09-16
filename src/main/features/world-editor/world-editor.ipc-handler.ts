import { ipcMain } from 'electron';
import type { PlayerPatch, TeamPatch } from '@shared/contracts/world-editor.contract';
import { IPC_CHANNELS } from '@shared/ipc-channels';
import { getAppDatabase } from '../../database/client';
import { getSeedDataDirectory } from '../../config/paths';
import { WorldEditorRepository } from './world-editor.repository';
import { WorldEditorService } from './world-editor.service';

export function registerWorldEditorIpcHandlers(): void {
  const service = new WorldEditorService(
    new WorldEditorRepository(getAppDatabase()),
    getSeedDataDirectory()
  );

  ipcMain.handle(IPC_CHANNELS.editorOverview, () => service.overview());
  ipcMain.handle(IPC_CHANNELS.editorTeam, (_event, teamId: string) => service.team(teamId));
  ipcMain.handle(IPC_CHANNELS.editorUpdateTeam, (_event, teamId: string, patch: TeamPatch) =>
    service.updateTeam(teamId, patch)
  );
  ipcMain.handle(IPC_CHANNELS.editorUpdatePlayer, (_event, playerId: string, patch: PlayerPatch) =>
    service.updatePlayer(playerId, patch)
  );
  ipcMain.handle(IPC_CHANNELS.editorMovePlayer, (_event, playerId: string, toTeamId: string) =>
    service.movePlayer(playerId, toTeamId)
  );
  ipcMain.handle(IPC_CHANNELS.editorResetTeam, (_event, teamId: string) =>
    service.resetTeam(teamId)
  );
  ipcMain.handle(IPC_CHANNELS.editorResetAll, () => service.resetAll());
}
