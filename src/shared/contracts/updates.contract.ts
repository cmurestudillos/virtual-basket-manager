/**
 * Actualizaciones de la aplicación.
 *
 * El estado vive en el proceso principal —es quien habla con el servidor de
 * publicaciones— y la pantalla sólo lo lee y se suscribe a sus cambios: una
 * descarga de sesenta megas avanza sola, no a golpe de consulta.
 */

export type UpdateState =
  /** En desarrollo, o sin publicación configurada: no hay de dónde actualizar. */
  | { status: 'unsupported'; reason: string }
  | { status: 'idle' }
  | { status: 'checking' }
  | { status: 'up-to-date'; checkedAt: number }
  | { status: 'available'; version: string }
  | { status: 'downloading'; version: string; percent: number }
  /** Descargada y verificada: se instala al reiniciar. */
  | { status: 'downloaded'; version: string }
  | { status: 'error'; message: string };

export interface UpdatesView {
  currentVersion: string;
  state: UpdateState;
}

export interface UpdatesApi {
  get: () => Promise<UpdatesView>;
  /** Busca una versión nueva; si la hay, la descarga en segundo plano. */
  check: () => Promise<UpdatesView>;
  /** Cierra la aplicación e instala la versión descargada. */
  install: () => Promise<void>;
  /** Avisa de cada cambio de estado. Devuelve la función para dejar de escuchar. */
  onChange: (listener: (view: UpdatesView) => void) => () => void;
}
