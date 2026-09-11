import { BrowserWindow, shell } from 'electron';
import { is } from '@electron-toolkit/utils';
import { existsSync } from 'node:fs';
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

/**
 * Icono de la ventana en desarrollo.
 *
 * El de la aplicación empaquetada lo pone el instalador; esto es sólo para que
 * la ventana de `pnpm dev` y el arnés no salgan con el icono de Electron.
 */
const DEV_ICON = join(__dirname, '../../assets/iconos/icono_256.png');

export function createMainWindow(): BrowserWindow {
  const { width, height } = resolveStartupSize();
  const mainWindow = new BrowserWindow({
    width,
    height,
    ...(existsSync(DEV_ICON) ? { icon: DEV_ICON } : {}),
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
