import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { app } from 'electron';

/**
 * Qué edición del juego es esta: la **pública**, con el mundo inventado, o la
 * **privada**, con las ligas y los jugadores reales.
 *
 * La privada no se distribuye. Existe sólo en el PC del autor y se construye
 * aparte (`pnpm build:win:private`, ver `electron-builder.private.yml`), que es
 * el que le mete el dataset real y le pone la marca en su `package.json`
 * empaquetado. El código es el mismo en las dos: lo único que cambia es esa
 * marca, y todo lo que depende de la edición pregunta aquí.
 *
 * En desarrollo no hay `package.json` empaquetado: manda la variable
 * `TM_DATASET=real`, que es la forma de jugar con el dataset real sin
 * construir nada.
 */
export type Edition = 'public' | 'private';

/** El campo que el build privado añade al `package.json` empaquetado. */
export const EDITION_FIELD = 'tripleManagerEdition';

let cached: Edition | null = null;

export function currentEdition(): Edition {
  if (cached) return cached;
  cached = resolveEdition({
    packaged: app.isPackaged,
    datasetEnv: process.env.TM_DATASET,
    readPackageJson: () => readFileSync(join(app.getAppPath(), 'package.json'), 'utf8')
  });
  return cached;
}

/** La decisión, sin Electron de por medio, para poder probarla. */
export function resolveEdition(input: {
  packaged: boolean;
  datasetEnv: string | undefined;
  readPackageJson: () => string;
}): Edition {
  if (!input.packaged) {
    return input.datasetEnv === 'real' ? 'private' : 'public';
  }
  try {
    const manifest = JSON.parse(input.readPackageJson()) as Record<string, unknown>;
    return manifest[EDITION_FIELD] === 'private' ? 'private' : 'public';
  } catch {
    // Sin manifiesto legible se asume la pública: es la que no puede enseñar
    // nada que no deba.
    return 'public';
  }
}

/** El identificador de la aplicación para Windows: distinto en cada edición. */
export function appUserModelId(edition: Edition): string {
  return edition === 'private' ? 'com.triplemanager.desktop.private' : 'com.triplemanager.desktop';
}
