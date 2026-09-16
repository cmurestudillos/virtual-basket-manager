import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { app, BrowserWindow } from 'electron';
import electronUpdater, { type AppUpdater } from 'electron-updater';
import type { UpdateState, UpdatesView } from '@shared/contracts/updates.contract';
import { IPC_CHANNELS } from '@shared/ipc-channels';

/**
 * Las actualizaciones, contra las publicaciones de GitHub.
 *
 * Sólo funcionan en la aplicación instalada: en desarrollo no hay versión que
 * actualizar ni instalador que sustituir, y buscar actualizaciones ahí sólo
 * daría errores confusos. Hay una excepción, a propósito: con la variable
 * `VBM_UPDATE_FEED` apuntando a una carpeta servida por HTTP —con un `latest.yml`
 * y su instalador, tal y como los deja electron-builder— se puede comprobar el
 * flujo entero en local sin publicar nada.
 *
 * La descarga va sola en segundo plano y se verifica contra el hash del
 * `latest.yml`; la instalación no: la decide el usuario, porque reiniciar a
 * mitad de una temporada sin avisar sería perderle el partido que estuviera
 * jugando.
 */
export class UpdatesService {
  private state: UpdateState = { status: 'idle' };
  private updater: AppUpdater | null = null;

  constructor() {
    const localFeed = process.env.VBM_UPDATE_FEED;
    if (!app.isPackaged && !localFeed) {
      this.state = {
        status: 'unsupported',
        reason: 'En desarrollo no hay actualizaciones: sólo en la aplicación instalada.'
      };
      return;
    }

    const updater = electronUpdater.autoUpdater;
    updater.autoDownload = true;
    // Instalar al cerrar sólo en la aplicación instalada. Con un servidor local
    // de pruebas NO: cerrar la ventana de desarrollo ejecutaba en silencio el
    // instalador descargado y dejaba instalada la versión de prueba en la
    // máquina — pasó al verificar este flujo por primera vez.
    updater.autoInstallOnAppQuit = !localFeed;
    // No se distribuye instalador web: sólo el completo.
    updater.disableWebInstaller = true;
    if (localFeed) {
      // En desarrollo electron-updater lee su configuración de un
      // `dev-app-update.yml` que no se versiona; se genera uno temporal que
      // apunta al servidor local, en vez de dejar un fichero de pruebas suelto
      // en la raíz del repositorio.
      const configPath = join(app.getPath('temp'), 'triple-manager-dev-app-update.yml');
      writeFileSync(
        configPath,
        `provider: generic
url: ${localFeed}
updaterCacheDirName: triple-manager-updater
`
      );
      updater.forceDevUpdateConfig = true;
      updater.updateConfigPath = configPath;
      updater.setFeedURL({ provider: 'generic', url: localFeed });
    }

    updater.on('checking-for-update', () => this.set({ status: 'checking' }));
    updater.on('update-not-available', () =>
      this.set({ status: 'up-to-date', checkedAt: Date.now() })
    );
    updater.on('update-available', (info) =>
      this.set({ status: 'available', version: info.version })
    );
    updater.on('download-progress', (progress) =>
      this.set({
        status: 'downloading',
        version: 'version' in this.state ? this.state.version : '',
        percent: Math.round(progress.percent)
      })
    );
    updater.on('update-downloaded', (info) =>
      this.set({ status: 'downloaded', version: info.version })
    );
    updater.on('error', (error) => this.set({ status: 'error', message: friendlyError(error) }));

    this.updater = updater;
  }

  view(): UpdatesView {
    return { currentVersion: app.getVersion(), state: this.state };
  }

  async check(): Promise<UpdatesView> {
    if (!this.updater) {
      return this.view();
    }
    // Una comprobación en marcha, o una descarga hecha o en curso, no se vuelve
    // a pedir: la del arranque y la del botón no pueden pisarse.
    if (
      this.state.status === 'checking' ||
      this.state.status === 'available' ||
      this.state.status === 'downloading' ||
      this.state.status === 'downloaded'
    ) {
      return this.view();
    }
    try {
      const result = await this.updater.checkForUpdates();
      // La descarga sigue en segundo plano y sus fallos ya llegan por el evento
      // `error`; sin esto, además, quedarían como promesa rechazada sin atender.
      result?.downloadPromise?.catch(() => undefined);
    } catch (error) {
      this.set({ status: 'error', message: friendlyError(error) });
    }
    return this.view();
  }

  install(): void {
    if (this.updater && this.state.status === 'downloaded') {
      this.updater.quitAndInstall();
    }
  }

  private set(state: UpdateState): void {
    this.state = state;
    const view = this.view();
    for (const window of BrowserWindow.getAllWindows()) {
      window.webContents.send(IPC_CHANNELS.updatesChanged, view);
    }
  }
}

/**
 * Lo que se le cuenta al usuario cuando algo falla. El error de red crudo no le
 * sirve de nada; saber que no hay conexión, o que aún no hay nada publicado, sí.
 */
function friendlyError(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error);
  // El error crudo va al registro del proceso principal: al usuario no le
  // sirve, pero sin él un fallo de actualización no hay forma de diagnosticarlo.
  console.warn('[actualizaciones]', text);
  if (/ENOTFOUND|ECONNREFUSED|ETIMEDOUT|net::ERR/i.test(text)) {
    return 'No se pudo comprobar: no hay conexión con el servidor de actualizaciones.';
  }
  if (/404|latest\.yml/i.test(text)) {
    return 'Todavía no hay ninguna versión publicada.';
  }
  if (/sha512|checksum/i.test(text)) {
    return 'La descarga llegó dañada y se ha descartado. Vuelve a intentarlo.';
  }
  return 'No se pudo comprobar si hay actualizaciones.';
}
