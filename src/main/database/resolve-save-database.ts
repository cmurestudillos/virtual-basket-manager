import { getSaveDatabase, type SaveDatabase } from './client';

/**
 * Partida activa.
 *
 * Todo lo que es "datos de juego" (equipos, jugadores, partidos) vive en el
 * fichero de la partida cargada, no en la base de aplicación. Cada feature
 * pide aquí la conexión en lugar de recibir la ruta por parámetro, para que
 * añadir una pantalla nueva no obligue a pasar la ruta por diez sitios.
 */

let activeSaveFilePath: string | null = null;

export class NoActiveSaveError extends Error {
  constructor() {
    super('No hay ninguna partida cargada');
    this.name = 'NoActiveSaveError';
  }
}

export function setActiveSaveFilePath(filePath: string | null): void {
  activeSaveFilePath = filePath;
}

export function getActiveSaveFilePath(): string | null {
  return activeSaveFilePath;
}

/**
 * Conexión a la partida activa. Lanza si no hay ninguna cargada: es un error de
 * programación (una pantalla de juego abierta sin partida), no un caso normal,
 * y devolver `null` sólo lo escondería hasta el primer `undefined` raro.
 */
export function requireActiveSaveDatabase(): SaveDatabase {
  if (!activeSaveFilePath) {
    throw new NoActiveSaveError();
  }
  return getSaveDatabase(activeSaveFilePath);
}
