import { app, ipcMain } from 'electron';
import { IPC_CHANNELS } from '@shared/ipc-channels';

export function registerAppLifecycleIpcHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.appQuit, () => {
    app.quit();
  });
}
