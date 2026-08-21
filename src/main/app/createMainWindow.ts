import { BrowserWindow, shell } from 'electron';
import { is } from '@electron-toolkit/utils';
import { join } from 'node:path';
import { getAppDatabase } from '../database/client';
import { SettingsRepository } from '../features/settings/settings.repository';
import { DEFAULT_WINDOW_RESOLUTION, parseWindowResolution } from '@shared/domain/window-resolution';

/**
 * Aplica la resolución guardada en Ajustes antes de crear la ventana. La
 * lectura es síncrona (better-sqlite3), así que no hace falta abrir primero una
 * ventana con el tamaño equivocado y redimensionarla después.
 */
function resolveStartupSize(): { width: number; height: number } {
  const saved = new SettingsRepository(getAppDatabase()).findByKey('resolution');
  const parsed = saved ? parseWindowResolution(saved) : null;
  return parsed ?? parseWindowResolution(DEFAULT_WINDOW_RESOLUTION)!;
}

export function createMainWindow(): BrowserWindow {
  const { width, height } = resolveStartupSize();
  const mainWindow = new BrowserWindow({
    width,
    height,
    minWidth: 1024,
    minHeight: 700,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  mainWindow.on('ready-to-show', () => {
    mainWindow.show();
  });

  // Cualquier window.open()/target=_blank va al navegador del sistema, nunca a
  // una segunda ventana de Electron con acceso a Node.
  mainWindow.webContents.setWindowOpenHandler((details) => {
    void shell.openExternal(details.url);
    return { action: 'deny' };
  });

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    void mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL']);
  } else {
    void mainWindow.loadFile(join(__dirname, '../renderer/index.html'));
  }

  return mainWindow;
}
