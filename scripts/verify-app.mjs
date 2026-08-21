import { _electron as electron } from 'playwright-core';
import { mkdirSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Arnés de verificación de la aplicación real.
 *
 * Arranca Electron, recorre el flujo completo (menú -> nueva partida -> club ->
 * plantilla -> ficha -> competición) y deja una captura de cada pantalla en
 * `.dev-data/shots`. Es la única forma de saber que algo funciona de verdad:
 * los tests unitarios no ven ni una pantalla en blanco ni un `window.api`
 * que no llegó a exponerse.
 *
 *   pnpm build && pnpm verify:app
 *
 * Ojo: `pnpm dev` NO recompila. Este script carga lo que hay en `out/`, así que
 * hay que construir antes o se verifica la versión anterior del código.
 *
 * Si falla con "Process failed to launch!", es que el binario de Electron no se
 * descargó al instalar; se arregla con `node node_modules/electron/install.js`.
 */

const PROJECT = resolve(import.meta.dirname, '..');
const SHOTS = resolve(PROJECT, '.dev-data/shots');

// Cada verificación arranca de cero: si no, la segunda pasada se encuentra la
// partida de la primera y el flujo de creación no se prueba.
rmSync(resolve(PROJECT, '.dev-data'), { recursive: true, force: true });
mkdirSync(SHOTS, { recursive: true });

const app = await electron.launch({
  args: ['.'],
  cwd: PROJECT,
  executablePath: resolve(PROJECT, 'node_modules/electron/dist/electron.exe')
});

const page = await app.firstWindow();
await page.waitForLoadState('domcontentloaded');
page.on('console', (message) => console.log('[console]', message.type(), message.text()));
page.on('pageerror', (error) => console.log('[pageerror]', error.message));

await page.waitForTimeout(1500);
console.log('título:', await page.title());
await page.screenshot({ path: `${SHOTS}/01-menu.png` });

await page.getByText('Nueva partida').click();
await page.waitForTimeout(1200);
console.log('equipos en el catálogo:', await page.locator('tbody tr').count());
await page.locator('tbody tr').nth(3).click();
await page.locator('input').first().fill('Carlos');
await page.screenshot({ path: `${SHOTS}/02-nueva-partida.png` });

await page.getByText('Empezar').click();
await page.waitForTimeout(2500);
console.log('cabecera:', (await page.locator('header').first().innerText()).replace(/\n/g, ' · '));
await page.screenshot({ path: `${SHOTS}/03-club.png` });

await page.getByRole('link', { name: 'Plantilla' }).click();
await page.waitForTimeout(1200);
console.log('jugadores en plantilla:', await page.locator('tbody tr').count());
await page.screenshot({ path: `${SHOTS}/04-plantilla.png` });

await page.locator('tbody tr a').first().click();
await page.waitForTimeout(1200);
console.log('ficha:', await page.locator('h1').first().innerText());
await page.screenshot({ path: `${SHOTS}/05-ficha.png` });

await page.getByRole('link', { name: 'Competición' }).click();
await page.waitForTimeout(1200);
console.log('equipos en competición:', await page.locator('tbody tr').count());
await page.screenshot({ path: `${SHOTS}/06-competicion.png` });

await app.close();
console.log(`OK — capturas en ${SHOTS}`);
