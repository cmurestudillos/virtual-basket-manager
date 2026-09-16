import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

/**
 * Comprueba que el dataset real está donde tiene que estar y tiene buena pinta
 * antes de construir la edición privada o de arrancarla en desarrollo.
 *
 * Sin esta comprobación, un `pnpm build:win:private` en un clon sin el dataset
 * real fallaría a mitad del empaquetado con un error de ruta, o —peor— se
 * instalaría una edición privada que revienta al crear la primera partida.
 *
 *   node scripts/real-data/check-real-dataset.mjs
 */

const PROJECT = resolve(import.meta.dirname, '..', '..');
export const REAL_DATA_DIR = resolve(PROJECT, 'resources', 'real-data');
export const REAL_DATASET = resolve(REAL_DATA_DIR, 'dataset.json');

/** Devuelve el resumen del dataset o lanza un error que explica qué falta. */
export function checkRealDataset(path = REAL_DATASET) {
  if (!existsSync(path)) {
    throw new Error(
      `No está el dataset real en ${path}.\n` +
        'Es normal en un clon nuevo: el dataset real no se versiona. Restáuralo de la copia\n' +
        'con `pnpm dataset:restore` o genéralo con los scripts de extracción\n' +
        '(ver docs/DATASET-REAL.md).'
    );
  }

  let dataset;
  try {
    dataset = JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    throw new Error(`El dataset real no es un JSON válido: ${error.message}`, { cause: error });
  }

  for (const key of ['competitions', 'teams', 'players']) {
    if (!Array.isArray(dataset[key]) || dataset[key].length === 0) {
      throw new Error(`El dataset real no trae «${key}» (o está vacío).`);
    }
  }
  if (typeof dataset.seasonStartYear !== 'number') {
    throw new Error('El dataset real no trae «seasonStartYear».');
  }

  return {
    competitions: dataset.competitions.length,
    teams: dataset.teams.length,
    players: dataset.players.length
  };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try {
    const summary = checkRealDataset();
    console.log(
      `Dataset real: ${summary.competitions} competiciones, ${summary.teams} equipos, ${summary.players} jugadores.`
    );
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
