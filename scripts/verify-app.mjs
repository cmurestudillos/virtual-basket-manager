import { _electron as electron } from 'playwright-core';
import { execSync } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Arnés de verificación de la aplicación real.
 *
 * Arranca Electron y recorre el flujo completo: menú, nueva partida, club,
 * plantilla, ficha, alineación, pizarra, entrenamiento, finanzas, cuerpo
 * técnico, cantera, mercado, partido jugado cuarto a cuarto, clasificación,
 * calendario, cuadro de playoffs y estadísticas. Deja una captura de cada
 * pantalla en `.dev-data/shots`.
 *
 * Es la única forma de saber que algo funciona de verdad: los tests unitarios
 * no ven ni una pantalla en blanco ni un `window.api` que no llegó a exponerse.
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

// Una segunda partida con la temporada ya jugada, para poder ver el cuadro de
// playoffs y la pantalla de campeón sin jugar 306 partidos a botonazos.
console.log('sembrando una partida con la temporada terminada…');
execSync('pnpm seed:finished', { cwd: PROJECT, stdio: 'inherit' });

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

// La guía de estilo, antes que nada: es la que enseña si alguna pieza del kit
// se ha roto, y verlo aquí es más barato que cazarlo en la pantalla donde esté
// escondida.
const appUrl = page.url().split('#')[0];
await page.goto(`${appUrl}#/estilo`);
await page.waitForTimeout(1200);
console.log('guía de estilo:', await page.locator('h1').first().innerText());
await page.screenshot({ path: `${SHOTS}/01b-guia-de-estilo.png`, fullPage: false });
await page.goto(`${appUrl}#/`);
await page.waitForTimeout(800);

await page.getByText('Nueva partida').click();
await page.waitForTimeout(1200);
console.log('equipos en el catálogo:', await page.locator('tbody tr').count());

// El catálogo va por reputación y lo encabezan los clubes de la liga
// americana, así que sin filtrar el arnés jugaría en otro país cada vez que se
// toque el dataset. Se filtra por la liga española, que es la que recorren
// después el resto de pasos.
await page.getByRole('button', { name: /^Liga Nacional ·/ }).click();
await page.waitForTimeout(800);
console.log('equipos tras filtrar:', await page.locator('tbody tr').count());
await page.locator('tbody tr').nth(3).click();
await page.locator('aside input').first().fill('Carlos');
await page.screenshot({ path: `${SHOTS}/02-nueva-partida.png` });

await page.getByText('Empezar').click();
await page.waitForTimeout(3000);
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

// --- Fase 2: decisiones del entrenador -------------------------------------

await page.getByRole('link', { name: 'Alineación' }).click();
await page.waitForTimeout(1200);
console.log('huecos de la rotación:', await page.locator('tbody tr').count());

// Un cambio de titular y un reparto de minutos distinto, que es justo lo que
// esta pantalla existe para hacer.
await page.locator('select').first().selectOption({ index: 6 });
await page.locator('input[type="number"]').first().fill('34');
await page.getByRole('button', { name: 'Guardar' }).click();
await page.waitForTimeout(1200);
console.log('rotación:', (await page.locator('footer').first().innerText()).split('\n')[0]);
await page.screenshot({ path: `${SHOTS}/06-alineacion.png` });

await page.getByRole('button', { name: 'Pizarra' }).click();
await page.waitForTimeout(1000);
await page.locator('select').first().selectOption('fastbreak');
await page.locator('select').nth(1).selectOption('zone23');
await page.getByRole('button', { name: 'Guardar' }).click();
await page.waitForTimeout(1200);
console.log('pizarra guardada:', await page.locator('footer p').first().innerText());
await page.screenshot({ path: `${SHOTS}/07-pizarra.png` });

await page.getByRole('link', { name: 'Entrenamiento' }).click();
await page.waitForTimeout(1200);
console.log('plantilla en el plan:', await page.locator('tbody tr').count());
await page.locator('select').first().selectOption('shooting');
await page.locator('input[type="range"]').first().fill('8');
await page.getByRole('button', { name: 'Guardar' }).click();
await page.waitForTimeout(1200);
const plan = await page.locator('footer').first().innerText();
console.log('plan:', plan.split('\n').join(' · '));
await page.screenshot({ path: `${SHOTS}/08-entrenamiento.png` });

// --- Bloque 2, fase 2: el dinero -------------------------------------------

await page.getByRole('link', { name: 'Finanzas' }).click();
await page.waitForTimeout(1500);
const caja = await page.locator('article').first().innerText();
console.log('caja:', caja.split('\n').join(' · '));
const consejo = await page.locator('section').first().innerText();
console.log('consejo:', consejo.split('\n').join(' · '));

// Bajar el precio de la entrada tiene que llenar más el pabellón.
const aforoAntes = (await page.locator('dl dd').nth(3).innerText()).trim();
await page.locator('input[type="number"]').first().fill('12');
await page.getByRole('button', { name: 'Guardar' }).click();
await page.waitForTimeout(1500);
console.log(
  'asistencia prevista:',
  aforoAntes,
  '->',
  (await page.locator('dl dd').nth(3).innerText()).trim()
);
console.log('apuntes en el libro:', await page.locator('tbody tr').count());
await page.screenshot({ path: `${SHOTS}/09-finanzas.png` });

// --- Bloque 2, fase 3: cuerpo técnico y cantera ----------------------------

await page.getByRole('link', { name: 'Entrenamiento' }).click();
await page.waitForTimeout(1200);
await page.getByRole('button', { name: 'Cuerpo técnico' }).click();
await page.waitForTimeout(1200);
console.log('técnicos en pantalla:', await page.locator('tbody tr').count());
await page.screenshot({ path: `${SHOTS}/10-cuerpo-tecnico.png` });

await page.getByRole('link', { name: 'Cantera' }).click();
await page.waitForTimeout(1500);
const cantera = await page.locator('article').first().innerText();
console.log('cantera:', cantera.split('\n').join(' · '));
console.log('juveniles:', await page.locator('tbody tr').count());
await page.getByRole('button', { name: 'Promocionar' }).first().click();
await page.waitForTimeout(1500);
console.log(
  'tras promocionar:',
  (await page.locator('article').nth(2).innerText()).split('\n').join(' · ')
);
await page.screenshot({ path: `${SHOTS}/11-cantera.png` });

// --- Bloque 3: el mercado --------------------------------------------------

await page.getByRole('link', { name: 'Mercado' }).click();
await page.waitForTimeout(1500);
const mercado = await page.locator('h1').first().innerText();
console.log('mercado:', mercado, '·', await page.locator('tbody tr').count(), 'fichables');

// Se ficha al primer agente libre de la lista, con lo que pide.
await page.getByRole('checkbox').first().check();
await page.waitForTimeout(1200);
await page.getByRole('button', { name: 'Ofertar' }).nth(1).click();
await page.waitForTimeout(800);
await page.getByRole('button', { name: 'Ofertar' }).first().click();
await page.waitForTimeout(1500);
const respuesta = await page.locator('main p').last().innerText();
console.log('oferta:', respuesta);
await page.screenshot({ path: `${SHOTS}/12-mercado.png` });

// Cesiones: se cede al último de la plantilla y se comprueba que sale del club.
await page.getByRole('button', { name: 'Contratos' }).click();
await page.waitForTimeout(1200);
await page.getByRole('button', { name: 'Ceder' }).last().click();
await page.waitForTimeout(1500);
await page.getByRole('button', { name: 'Cesiones' }).click();
await page.waitForTimeout(1200);
const cesiones = await page.locator('tbody tr').first().innerText();
console.log('cesión:', cesiones.split('\t').join(' · '));
await page.screenshot({ path: `${SHOTS}/12b-cesiones.png` });

// --- Fase 1: temporada -----------------------------------------------------

await page.getByRole('link', { name: 'Club' }).click();
await page.waitForTimeout(1200);
console.log('próximo partido:', await page.locator('section').first().innerText());

// El calendario se para solo en el partido del usuario.
await page.getByRole('button', { name: 'Ir a la jornada' }).click();
await page.waitForTimeout(2500);
console.log('url tras avanzar:', page.url());
await page.screenshot({ path: `${SHOTS}/13-previa.png` });

// Cuarto a cuarto, que es como se juega en modo resultado.
for (let quarter = 1; quarter <= 4; quarter += 1) {
  const button = page.locator('button', { hasText: /^Jugar/ }).first();
  if ((await button.count()) === 0) break;
  await button.click();
  await page.waitForTimeout(1500);
  const scoreboard = await page.locator('section').first().innerText();
  console.log(`tras el cuarto ${quarter}:`, scoreboard.split('\n').slice(0, 4).join(' '));
  await page.screenshot({ path: `${SHOTS}/14-cuarto-${quarter}.png` });
}

// Prórrogas, si las hubo.
for (let extra = 0; extra < 4; extra += 1) {
  const button = page.locator('button', { hasText: /^Jugar/ }).first();
  if ((await button.count()) === 0) break;
  await button.click();
  await page.waitForTimeout(1500);
}
await page.screenshot({ path: `${SHOTS}/15-acta.png` });
console.log('actas en pantalla:', await page.locator('table').count());

await page.getByRole('link', { name: 'Volver al club' }).click();
await page.waitForTimeout(1200);
await page.getByRole('button', { name: 'Avanzar día' }).click();
await page.waitForTimeout(3000);

// El partido tiene que haberse notado en las piernas de la plantilla.
await page.getByRole('link', { name: 'Plantilla' }).click();
await page.waitForTimeout(1200);
const primeraFila = await page.locator('tbody tr').first().innerText();
console.log('plantilla tras el partido:', primeraFila.split('\n').join(' · '));

await page.getByRole('link', { name: 'Competición' }).click();
await page.waitForTimeout(1500);
console.log('equipos en la clasificación:', await page.locator('tbody tr').count());
console.log('divisiones:', await page.locator('main nav').nth(1).innerText());
await page.screenshot({ path: `${SHOTS}/16-clasificacion.png` });

// La división de al lado: la que decide quién sube el año que viene.
await page.getByRole('button', { name: /Liga Plata/ }).click();
await page.waitForTimeout(1200);
console.log('equipos en la segunda:', await page.locator('tbody tr').count());
console.log('zonas:', (await page.locator('main ul li').allInnerTexts()).join(' · '));
await page.screenshot({ path: `${SHOTS}/16b-segunda-division.png` });
await page.getByRole('button', { name: /Liga Nacional/ }).click();
await page.waitForTimeout(1000);

await page.getByRole('button', { name: 'Calendario' }).click();
await page.waitForTimeout(1200);
console.log('partidos de la jornada:', await page.locator('ul li').count());
await page.screenshot({ path: `${SHOTS}/17-calendario.png` });

// El cuadro de playoffs todavía no existe en la jornada 1, pero la pantalla
// tiene que explicarlo en vez de quedarse en blanco.
await page.getByRole('button', { name: 'Copa' }).click();
await page.waitForTimeout(1200);
console.log('copa:', await page.locator('main p').first().innerText());
await page.screenshot({ path: `${SHOTS}/17b-copa.png` });

// Europa: la fase de liga arranca en octubre, así que en la jornada 1 la
// pantalla tiene que explicarse en vez de quedarse en blanco.
await page.getByRole('button', { name: 'Europa' }).click();
await page.waitForTimeout(1500);
console.log('europa:', (await page.locator('main nav').last().innerText()).replace(/\n/g, ' | '));
await page.screenshot({ path: `${SHOTS}/17c-europa.png` });

await page.getByRole('button', { name: 'Playoffs' }).click();
await page.waitForTimeout(1200);
console.log('playoffs:', await page.locator('main p').first().innerText());
await page.screenshot({ path: `${SHOTS}/18-playoffs.png` });

// --- Fase 2: estadísticas de temporada -------------------------------------

await page.getByRole('link', { name: 'Estadísticas' }).click();
await page.waitForTimeout(1500);
console.log('jugadores con estadística:', await page.locator('tbody tr').count());
await page.screenshot({ path: `${SHOTS}/19-estadisticas.png` });

await page.getByRole('button', { name: 'Líderes de la liga' }).click();
await page.waitForTimeout(1200);
console.log('líderes en la tabla:', await page.locator('tbody tr').count());
await page.screenshot({ path: `${SHOTS}/20-lideres.png` });

// --- Fase 3: playoffs y fin de temporada -----------------------------------

// La otra partida, la que llega con la temporada terminada.
await page.getByRole('link', { name: 'Salir al menú' }).click();
await page.waitForTimeout(1000);
await page.getByRole('link', { name: 'Cargar partida' }).click();
await page.waitForTimeout(1200);
await page
  .locator('li', { hasText: 'Temporada terminada' })
  .getByRole('button', { name: 'Cargar' })
  .click();
await page.waitForTimeout(2500);
const finDeTemporada = await page.locator('section').first().innerText();
console.log('fin de temporada:', finDeTemporada.split('\n').join(' · '));
await page.screenshot({ path: `${SHOTS}/21-campeon.png` });

await page.getByRole('link', { name: 'Competición' }).click();
await page.waitForTimeout(1800);
console.log('series en el cuadro:', await page.locator('main li').count());
await page.screenshot({ path: `${SHOTS}/22-cuadro.png` });

// Europa, ya terminada: fase de liga, cuadro y campeón.
await page.getByRole('button', { name: 'Europa' }).click();
await page.waitForTimeout(2000);
console.log('campeón continental:', await page.locator('main p').first().innerText());
console.log('equipos en la fase de liga:', await page.locator('tbody tr').count());
await page.screenshot({ path: `${SHOTS}/22c-europa.png` });

// Y la segunda, ya terminada: de sus dos primeros salen los ascendidos.
await page.getByRole('button', { name: 'Clasificación' }).click();
await page.waitForTimeout(1200);
await page.getByRole('button', { name: /Liga Plata/ }).click();
await page.waitForTimeout(1500);
const ascensos = await page.locator('tbody tr').first().innerText();
console.log('líder de la segunda:', ascensos.split('\n').join(' · '));
await page.screenshot({ path: `${SHOTS}/22b-ascensos.png` });

// Con la temporada entera jugada hay desgaste y enfermería de verdad.
await page.getByRole('link', { name: 'Entrenamiento' }).click();
await page.waitForTimeout(1500);
const disponibles = await page.locator('footer').first().innerText();
console.log('estado de la plantilla en junio:', disponibles.split('\n')[0]);
await page.screenshot({ path: `${SHOTS}/23-parte-medico.png` });

await page.getByRole('link', { name: 'Club' }).click();
await page.waitForTimeout(1500);
await page.getByRole('button', { name: /^Empezar temporada/ }).click();
await page.waitForTimeout(2500);
const cabecera = await page.locator('header').first().innerText();
console.log('cabecera tras el salto:', cabecera.replace(/\n/g, ' · '));
await page.screenshot({ path: `${SHOTS}/24-temporada-siguiente.png` });

await app.close();
console.log(`OK — capturas en ${SHOTS}`);
