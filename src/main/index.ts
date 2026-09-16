import { app, BrowserWindow } from 'electron';
import { electronApp, optimizer } from '@electron-toolkit/utils';
import { createMainWindow } from './app/createMainWindow';
import { appUserModelId, currentEdition } from './config/edition';
import { registerIpcHandlers } from './ipc/registerIpcHandlers';
import { getUpdatesService } from './features/updates/updates.ipc-handler';

void app.whenReady().then(() => {
  // Tiene que coincidir con el `appId` del instalador de cada edición: si no,
  // Windows agrupa mal la ventana y las notificaciones no llevan su nombre.
  electronApp.setAppUserModelId(appUserModelId(currentEdition()));

  // Comodidad de desarrollo: F12 abre devtools, se desactivan los atajos de
  // recarga, etc.
  app.on('browser-window-created', (_event, window) => {
    optimizer.watchWindowShortcuts(window);
  });

  registerIpcHandlers();
  createMainWindow();

  // Una comprobación al arrancar, con la ventana ya abierta y sin prisa: que no
  // haya conexión no puede retrasar la entrada al juego ni romperla.
  setTimeout(() => {
    void getUpdatesService().check();
  }, 5000);

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
