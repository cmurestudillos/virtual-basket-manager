import { app, BrowserWindow } from 'electron';
import { electronApp, optimizer } from '@electron-toolkit/utils';
import { createMainWindow } from './app/createMainWindow';
import { registerIpcHandlers } from './ipc/registerIpcHandlers';

void app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.virtualbasketmanager.desktop');

  // Comodidad de desarrollo: F12 abre devtools, se desactivan los atajos de
  // recarga, etc.
  app.on('browser-window-created', (_event, window) => {
    optimizer.watchWindowShortcuts(window);
  });

  registerIpcHandlers();
  createMainWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
