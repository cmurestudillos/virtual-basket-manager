import { createHash } from 'node:crypto';
import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync
} from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { REAL_DATA_DIR } from './check-real-dataset.mjs';

/**
 * Copia de seguridad del dataset real, que no está en git.
 *
 *   pnpm dataset:backup    copia resources/real-data a la carpeta de copias
 *   pnpm dataset:verify    comprueba que la copia está entera y al día
 *   pnpm dataset:restore   la devuelve a resources/real-data
 *
 * La carpeta de copias es, por orden: `--dir <ruta>`, la variable
 * `TM_REAL_DATA_BACKUP` o `../triple-manager-real-data-backup` (al lado del
 * repositorio, fuera de él). Cada copia lleva un `manifest.json` con el SHA-256
 * de cada fichero: sin él no hay forma de saber si una copia se ha quedado a
 * medias o se ha corrompido hasta el día que hace falta restaurarla.
 */

const PROJECT = resolve(import.meta.dirname, '..', '..');
const MANIFEST = 'manifest.json';

function backupDir(args) {
  const flag = args.indexOf('--dir');
  if (flag >= 0 && args[flag + 1]) return resolve(args[flag + 1]);
  if (process.env.TM_REAL_DATA_BACKUP) return resolve(process.env.TM_REAL_DATA_BACKUP);
  return resolve(PROJECT, '..', 'triple-manager-real-data-backup');
}

function listFiles(root) {
  if (!existsSync(root)) return [];
  const out = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir)) {
      const path = join(dir, entry);
      if (statSync(path).isDirectory()) walk(path);
      else out.push(relative(root, path).split('\\').join('/'));
    }
  };
  walk(root);
  return out.filter((file) => file !== MANIFEST).sort();
}

function hashOf(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function manifestOf(root) {
  return Object.fromEntries(listFiles(root).map((file) => [file, hashOf(join(root, file))]));
}

function readManifest(root) {
  const path = join(root, MANIFEST);
  if (!existsSync(path)) throw new Error(`La copia de ${root} no tiene ${MANIFEST}.`);
  return JSON.parse(readFileSync(path, 'utf8'));
}

/** Diferencias entre lo que dice un manifiesto y lo que hay en disco. */
function differences(expected, actual) {
  const problems = [];
  for (const [file, hash] of Object.entries(expected)) {
    if (!(file in actual)) problems.push(`falta ${file}`);
    else if (actual[file] !== hash) problems.push(`cambiado ${file}`);
  }
  for (const file of Object.keys(actual)) {
    if (!(file in expected)) problems.push(`sobra ${file}`);
  }
  return problems;
}

function backup(target) {
  const files = manifestOf(REAL_DATA_DIR);
  if (Object.keys(files).length === 0) {
    throw new Error(`No hay nada que copiar en ${REAL_DATA_DIR}.`);
  }
  rmSync(target, { recursive: true, force: true });
  mkdirSync(target, { recursive: true });
  cpSync(REAL_DATA_DIR, target, { recursive: true });
  writeFileSync(
    join(target, MANIFEST),
    JSON.stringify({ createdAt: new Date().toISOString(), files }, null, 2)
  );
  // Se verifica lo recién escrito: una copia que no se ha comprobado no es una copia.
  const problems = differences(files, manifestOf(target));
  if (problems.length > 0) throw new Error(`La copia ha salido mal:\n  ${problems.join('\n  ')}`);
  console.log(`Copia hecha en ${target}: ${Object.keys(files).length} ficheros.`);
}

function verify(target) {
  const manifest = readManifest(target);
  const broken = differences(manifest.files, manifestOf(target));
  if (broken.length > 0) {
    throw new Error(`La copia de ${target} está dañada:\n  ${broken.join('\n  ')}`);
  }
  console.log(
    `Copia íntegra (${manifest.createdAt}): ${Object.keys(manifest.files).length} ficheros.`
  );

  const stale = differences(manifest.files, manifestOf(REAL_DATA_DIR));
  if (stale.length > 0) {
    console.log(`Pero no está al día con resources/real-data:\n  ${stale.join('\n  ')}`);
    console.log('Haz `pnpm dataset:backup` para actualizarla.');
    process.exitCode = 2;
  } else {
    console.log('Y coincide con resources/real-data.');
  }
}

function restore(target, force) {
  const manifest = readManifest(target);
  const broken = differences(manifest.files, manifestOf(target));
  if (broken.length > 0) {
    throw new Error(`No se restaura una copia dañada:\n  ${broken.join('\n  ')}`);
  }
  const current = manifestOf(REAL_DATA_DIR);
  if (
    Object.keys(current).length > 0 &&
    differences(manifest.files, current).length > 0 &&
    !force
  ) {
    throw new Error(
      'resources/real-data ya tiene datos distintos de la copia. Restaurar los perdería:\n' +
        'haz antes `pnpm dataset:backup --dir <otra carpeta>` o repite con `--force`.'
    );
  }
  rmSync(REAL_DATA_DIR, { recursive: true, force: true });
  mkdirSync(REAL_DATA_DIR, { recursive: true });
  for (const file of Object.keys(manifest.files)) {
    mkdirSync(resolve(REAL_DATA_DIR, file, '..'), { recursive: true });
    cpSync(join(target, file), join(REAL_DATA_DIR, file));
  }
  console.log(`Restaurados ${Object.keys(manifest.files).length} ficheros en ${REAL_DATA_DIR}.`);
}

const [command, ...args] = process.argv.slice(2);
const target = backupDir(args);
try {
  if (command === 'backup') backup(target);
  else if (command === 'verify') verify(target);
  else if (command === 'restore') restore(target, args.includes('--force'));
  else
    throw new Error('Uso: backup-real-dataset.mjs backup|verify|restore [--dir <ruta>] [--force]');
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
