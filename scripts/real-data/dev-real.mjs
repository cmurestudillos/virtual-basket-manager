import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import electron from 'electron';
import { checkRealDataset } from './check-real-dataset.mjs';

/**
 * Arranca el juego en desarrollo con el dataset REAL (`pnpm dev:real`).
 *
 * Es `pnpm dev` con `TM_DATASET=real`: se hace con un script y no con la
 * variable en la línea del `package.json` porque en Windows esa sintaxis no
 * existe, y meter una dependencia sólo para eso no merece la pena.
 */

try {
  const summary = checkRealDataset();
  console.log(`Dataset real: ${summary.teams} equipos, ${summary.players} jugadores.`);
} catch (error) {
  console.error(error.message);
  process.exit(1);
}

const child = spawn(String(electron), ['.'], {
  cwd: resolve(import.meta.dirname, '..', '..'),
  stdio: 'inherit',
  env: { ...process.env, TM_DATASET: 'real' }
});
child.on('exit', (code) => process.exit(code ?? 0));
