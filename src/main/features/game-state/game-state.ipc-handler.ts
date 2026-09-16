import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '@shared/ipc-channels';
import { GameStateService } from './game-state.service';

export function registerGameStateIpcHandlers(): void {
  const service = new GameStateService();

  ipcMain.handle(IPC_CHANNELS.gameStateGet, () => service.get());
  ipcMain.handle(IPC_CHANNELS.gameStateSetManagerNationality, (_event, code: string) =>
    service.setManagerNationality(code)
  );
}
