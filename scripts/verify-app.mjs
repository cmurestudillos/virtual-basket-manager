// `document` y `window` sólo aparecen dentro de funciones que se evalúan en la
// ventana de la aplicación (`waitForFunction`, `evaluate`), no en Node.
/* global document, window */
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
 * resultados, cuadro de playoffs, estadísticas, calendario mensual y fichas de
 * club. Deja una captura de cada pantalla en `.dev-data/shots`.
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

// Y una tercera en modo carrera con el entrenador ya destituido: la pantalla de
// ofertas no se alcanza jugando, hacen falta media temporada de derrotas.
console.log('sembrando una partida de carrera sin equipo…');
execSync('pnpm seed:career', { cwd: PROJECT, stdio: 'inherit' });

// Y una cuarta con una rueda de prensa esperando: sólo las dan las palizas, las
// rachas y los playoffs, y el partido del recorrido puede no dar ninguna.
console.log('sembrando una partida con rueda de prensa pendiente…');
execSync('pnpm seed:press', { cwd: PROJECT, stdio: 'inherit' });

// Y una quinta en la liga americana, con la temporada acabada y el draft abierto.
console.log('sembrando una partida de la liga americana con el draft abierto…');
execSync('pnpm seed:nba', { cwd: PROJECT, stdio: 'inherit' });

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

// --- El marco del juego (fase 2 del estilo IBM) -----------------------------
//
// Dentro de la partida se navega con la barra lateral de iconos —que dicen su
// nombre en `aria-label`— y con las pestañas de la barra de sección. El
// calendario se mueve con CONTINUAR, arriba a la derecha.

/** Va a una sección por su icono y, si se da, a una de sus pestañas. */
async function goTo(section, tab) {
  await page
    .getByRole('navigation', { name: 'Secciones del juego' })
    .getByRole('link', { name: section, exact: typeof section === 'string' })
    .click();
  // El ratón fuera de la barra lateral: encima de un icono sale su etiqueta, y
  // taparía la esquina de la pantalla en las capturas.
  await page.mouse.move(560, 60);
  await page.waitForTimeout(300);
  if (tab) {
    await page
      .getByRole('navigation', { name: /^Pantallas de/ })
      .getByRole('link', { name: tab, exact: true })
      .click();
  }
}

/** El botón CONTINUAR de la barra de arriba; su texto dice qué va a hacer. */
function continuar() {
  return page.locator('header').getByRole('button', { name: /^Continuar/ });
}

/** Espera a que acabe lo que haya lanzado CONTINUAR (o sus acciones de al lado). */
async function waitForAdvance(timeout = 180_000) {
  await page.waitForTimeout(300);
  await page.waitForFunction(() => !document.querySelector('header [aria-busy="true"]'), null, {
    timeout
  });
  await page.waitForTimeout(800);
}

/** La fecha del juego, tal y como la enseña la barra de arriba. */
async function fechaDelJuego() {
  return (await page.locator('header time').innerText()).trim();
}

/** El selector negro de competición de la barra de sección, en Competiciones. */
function selectorDeCompeticion() {
  return page.getByRole('combobox', { name: 'Competición', exact: true });
}

/**
 * Carga una partida desde «Cargar partida»: se elige la fila y se pulsa CARGAR,
 * que va debajo de la lista y no en cada fila.
 */
async function cargarPartida(nombre) {
  await page.locator('li', { hasText: nombre }).getByRole('button').click();
  await page.waitForTimeout(300);
  await page.getByRole('button', { name: 'Cargar', exact: true }).click();
}

// La guía de estilo, antes que nada: es la que enseña si alguna pieza del kit
// se ha roto, y verlo aquí es más barato que cazarlo en la pantalla donde esté
// escondida.
const appUrl = page.url().split('#')[0];
await page.goto(`${appUrl}#/estilo`);
await page.waitForTimeout(1200);
console.log('guía de estilo:', await page.locator('h1').first().innerText());
await page.screenshot({ path: `${SHOTS}/01b-guia-de-estilo.png`, fullPage: false });
// Y el final de la guía, con los campos, las tarjetas de partido y los líderes:
// la guía se desplaza por dentro, así que una captura de página entera no llega.
await page.getByText('Sólo agentes libres').scrollIntoViewIfNeeded();
await page.waitForTimeout(400);
await page.screenshot({ path: `${SHOTS}/01b2-guia-de-estilo-campos.png` });
// Y los colores por tipo de competición con los bloques de victoria y derrota (fase 5).
await page.getByText('tv-comp-national').scrollIntoViewIfNeeded();
await page.waitForTimeout(400);
console.log(
  'guía · bloques de resultado:',
  (await page.locator('.sr-only', { hasText: /^(Victoria|Derrota)/ }).allInnerTexts())
    .slice(0, 3)
    .join(' · ')
);
await page.screenshot({ path: `${SHOTS}/01b3-guia-de-estilo-competiciones.png` });
await page.goto(`${appUrl}#/`);
await page.waitForTimeout(800);

// --- Editor del mundo -------------------------------------------------------

// Se renombra el cuarto club de la Liga Nacional —el mismo que elige después
// «Nueva partida», que también ordena por reputación— para comprobar lo único
// que de verdad importa del editor: que la partida nueva nace del mundo editado.
await page.getByRole('link', { name: 'Editor del mundo' }).click();
await page.waitForTimeout(1500);
await page.locator('nav ul li button').nth(3).click();
await page.waitForTimeout(1000);
await page.locator('#team-name').fill('Club Editado del Arnés');
await page.getByRole('button', { name: 'Guardar club' }).click();
await page.waitForTimeout(1000);
console.log('editor:', await page.locator('[role="status"]').first().innerText());
console.log(
  'cabecera del editor:',
  (await page.locator('header').first().innerText()).replace(/\n/g, ' · ')
);
await page.screenshot({ path: `${SHOTS}/01c-editor.png` });

// Y un jugador: un triple de 99 y de vuelta al menú.
await page.locator('#attr-threePoint').fill('99');
await page.getByRole('button', { name: 'Guardar jugador' }).click();
await page.waitForTimeout(1000);
console.log('jugador editado:', await page.locator('[role="status"]').first().innerText());
await page.getByRole('link', { name: 'Volver' }).click();
await page.waitForTimeout(800);

await page.getByText('Nueva partida').click();
await page.waitForTimeout(1200);
console.log('equipos en el catálogo:', await page.locator('tbody tr').count());

/** El «Siguiente» de la barra de abajo del asistente de nueva partida. */
async function siguientePaso() {
  await page.getByRole('button', { name: 'Siguiente' }).click();
  await page.waitForTimeout(800);
}

// Paso 1, el equipo. El catálogo va por reputación y lo encabezan los clubes de
// la liga americana, así que sin filtrar el arnés jugaría en otro país cada vez
// que se toque el dataset. Se filtra por la liga española, que es la que
// recorren después el resto de pasos.
await page.getByRole('button', { name: /^Liga Nacional ·/ }).click();
await page.waitForTimeout(800);
console.log('equipos tras filtrar:', await page.locator('tbody tr').count());
await page.locator('tbody tr').nth(3).click();
await page.waitForTimeout(400);
await page.screenshot({ path: `${SHOTS}/02a-nueva-partida-equipo.png` });
await siguientePaso();

// Paso 2, el entrenador.
await page.locator('#manager-name').fill('Carlos');
// Modo carrera: mientras no te echen se juega igual, y deja ver su pestaña.
await page.getByText('Modo carrera').click();
// Y la selección española, que se dirige a la vez que el club.
await page.locator('#national-team').selectOption('ESP');
await page.screenshot({ path: `${SHOTS}/02b-nueva-partida-entrenador.png` });
await siguientePaso();

// Paso 3, las ligas: Grecia además de España, dos países con calendario, copa y ascensos.
await page.locator('main li label', { hasText: 'Grecia' }).click();
console.log(
  'coste de la elección:',
  await page.locator('aside p', { hasText: 'por temporada' }).innerText()
);
await page.screenshot({ path: `${SHOTS}/02-nueva-partida.png` });
await siguientePaso();

// Paso 4, el resumen.
console.log(
  'resumen de la partida:',
  (await page.locator('main dl').first().innerText()).replace(/\n/g, ' · ')
);
await page.screenshot({ path: `${SHOTS}/02c-nueva-partida-resumen.png` });

await page.getByRole('button', { name: 'Empezar' }).click();
await page.waitForTimeout(3000);
console.log('cabecera:', (await page.locator('header').first().innerText()).replace(/\n/g, ' · '));
const cabeceraPartida = await page.locator('header').first().innerText();
console.log(
  'la partida nace del mundo editado:',
  cabeceraPartida.includes('Club Editado del Arnés')
);
console.log('continuar dice:', (await continuar().innerText()).replace(/\n/g, ' · '));
console.log(
  'barra de acciones sin acciones de la pantalla, oculta:',
  !(await page.getByRole('toolbar', { name: 'Acciones de la pantalla' }).isVisible())
);

// --- Ajustes, desde dentro de la partida ------------------------------------

await page.getByRole('link', { name: 'Ajustes', exact: true }).click();
await page.waitForTimeout(1200);
await page.locator('#ruleset-fiba').click();
await page.waitForTimeout(600);
console.log('ajustes:', await page.locator('[role="status"]').first().innerText());
// La misma resolución que ya tiene: ejercita el cambio sin mover las capturas.
await page.locator('#resolution-1600x900').click();
await page.waitForTimeout(600);
console.log('créditos:', await page.locator('main li, section li').count());
await page.screenshot({ path: `${SHOTS}/03b-ajustes.png` });
await page.getByRole('button', { name: 'Volver' }).click();
await page.waitForTimeout(1200);
await page.screenshot({ path: `${SHOTS}/03-club.png` });

await goTo('Equipo', 'Plantilla');
await page.waitForTimeout(1200);
console.log('jugadores en plantilla:', await page.locator('tbody tr').count());
await page.screenshot({ path: `${SHOTS}/04-plantilla.png` });

await page.locator('tbody tr a').first().click();
await page.waitForTimeout(1200);
console.log('ficha:', await page.locator('h1').first().innerText());
await page.screenshot({ path: `${SHOTS}/05-ficha.png` });

// --- Fase 2: decisiones del entrenador -------------------------------------

// Desde la ficha: el jugador cuenta como Equipo y sus pestañas siguen a la vista.
await page
  .getByRole('navigation', { name: /^Pantallas de/ })
  .getByRole('link', { name: 'Alineación', exact: true })
  .click();
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

await goTo('Equipo', 'Entrenamiento');
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

await goTo('Club', 'Finanzas');
await page.waitForTimeout(1500);
const caja = await page.locator('article').first().innerText();
console.log('caja:', caja.split('\n').join(' · '));
const consejo = await page.locator('section').first().innerText();
console.log('consejo:', consejo.split('\n').join(' · '));
// Las tres confianzas de IBM: directiva, afición y jugadores.
console.log(
  'anillos de confianza:',
  (await page.getByRole('list', { name: 'Confianza' }).locator('li').allInnerTexts())
    .map((texto) => texto.replace(/\n/g, ' '))
    .join(' · ')
);

// Bajar el precio de la entrada tiene que llenar más el pabellón. La fila se
// busca por su etiqueta y dentro de la pantalla: la cabecera del marco tiene su
// propia lista de datos y contar `dd` sueltos la mezclaba.
const asistencia = page
  .locator('main dl > div', { hasText: 'Próximo partido en casa' })
  .locator('dd');
const aforoAntes = (await asistencia.innerText()).trim();
await page.locator('main input[type="number"]').first().fill('12');
await page.getByRole('button', { name: 'Guardar' }).click();
await page.waitForTimeout(1500);
console.log('asistencia prevista:', aforoAntes, '->', (await asistencia.innerText()).trim());
console.log('apuntes en el libro:', await page.locator('tbody tr').count());
await page.screenshot({ path: `${SHOTS}/09-finanzas.png` });

// --- Bloque 2, fase 3: cuerpo técnico y cantera ----------------------------

await goTo('Equipo', 'Entrenamiento');
await page.waitForTimeout(1200);
await page.getByRole('button', { name: 'Cuerpo técnico' }).click();
await page.waitForTimeout(1200);
console.log('técnicos en pantalla:', await page.locator('tbody tr').count());
await page.screenshot({ path: `${SHOTS}/10-cuerpo-tecnico.png` });

await goTo('Equipo', 'Cantera');
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

await goTo('Mercado');
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

await goTo('Inicio');
await page.waitForTimeout(1200);
console.log('próximo partido:', await page.locator('section').first().innerText());

// El calendario se para solo en el partido del usuario: CONTINUAR avanza hasta
// él —pasando por los días con partidos de otras ligas— y entra en la previa.
console.log('continuar antes del partido:', (await continuar().innerText()).replace(/\n/g, ' · '));
await continuar().click();
// Si el avance tarda, sale el aviso de avance de días.
try {
  await page.getByRole('dialog', { name: 'Avance de días' }).waitFor({ timeout: 2500 });
  console.log('aviso de avance de días:', 'sí');
  await page.screenshot({ path: `${SHOTS}/12c-avance-de-dias.png` });
} catch {
  console.log('aviso de avance de días:', 'no hizo falta (avance corto)');
}
await page.waitForURL(/#\/game\/match\//, { timeout: 180_000 });
await page.waitForTimeout(2500);
console.log('url tras avanzar:', page.url());

/**
 * La previa, sobre el pabellón en 3D: los dos cincos, los jugadores de
 * referencia y las medias. Se pasa con «Continuar», pantalla a pantalla.
 */
console.log(
  'pabellón 3D de la previa:',
  await page.locator('[aria-label="Pabellón del partido en 3D"] canvas').count()
);
console.log(
  'titulares en la previa:',
  await page.locator('[aria-label="Cinco inicial"] li').count()
);
await page.screenshot({ path: `${SHOTS}/13-previa.png` });
await page.getByRole('button', { name: 'Continuar' }).click();
await page.waitForTimeout(1200);
await page.screenshot({ path: `${SHOTS}/13-previa-referencias.png` });
await page.getByRole('button', { name: 'Continuar' }).click();
await page.waitForTimeout(1200);
await page.screenshot({ path: `${SHOTS}/13-previa-medias.png` });
await page.getByRole('button', { name: 'Continuar' }).click();
await page.waitForTimeout(1200);
console.log(
  'cabecera del partido:',
  (await page.locator('header').first().innerText()).split('\n').join(' ')
);
await page.screenshot({ path: `${SHOTS}/13a-partido-sin-empezar.png` });

/**
 * El primer cuarto se **dirige en vivo**: es el único modo en el que el partido
 * se juega mientras se mira, así que es donde se comprueba que el banquillo
 * responde —cambio, tiempo muerto y pizarra— y que el reloj corre de verdad.
 */
await page.getByRole('button', { name: 'Resumen' }).click();
await page.getByRole('button', { name: 'Jugar', exact: true }).click();
await page.waitForTimeout(5000);
const enMarcha = await page.locator('header').first().innerText();
console.log('en vivo:', enMarcha.split('\n').join(' '));
console.log('comentarios en vivo:', await page.locator('ol li').count());
await page.screenshot({ path: `${SHOTS}/13b-en-vivo.png` });

// La pista 2D, con el directo corriendo: diez fichas y el balón moviéndose.
await page.getByRole('button', { name: 'Vista 2D' }).click();
await page.waitForTimeout(2500);
console.log(
  'fichas en la pista 2D:',
  await page.locator('svg[aria-label="Pista del partido"] g[transform]').count()
);
await page.screenshot({ path: `${SHOTS}/13e-pista-2d.png` });

// Un cambio: se abre el cajón, se señala a uno de pista y se pulsa a uno del banquillo.
await page.getByRole('button', { name: 'Sustituciones' }).click();
await page.waitForTimeout(500);
const cajon = page.getByRole('dialog', { name: 'Sustituciones' });
await cajon.locator('button', { hasText: /\d+f/ }).first().click();
await page.waitForTimeout(300);
await cajon.locator('button', { hasText: /\d+f/ }).nth(5).click();
await page.waitForTimeout(600);
await page.screenshot({ path: `${SHOTS}/13c-sustituciones.png` });
await page.getByRole('button', { name: 'Cerrar' }).click();
await page.getByRole('button', { name: 'Resumen' }).click();
await page.waitForTimeout(400);
console.log('tras el cambio:', await page.locator('ol li').first().innerText());

// Tiempo muerto y cambio de defensa, las otras dos decisiones del directo.
await page.getByRole('button', { name: /^Tiempo muerto/ }).click();
await page.waitForTimeout(600);
await page.getByRole('button', { name: 'Tácticas' }).click();
await page.waitForTimeout(400);
await page
  .getByRole('dialog', { name: 'Tácticas' })
  .locator('select')
  .first()
  .selectOption({ index: 1 });
await page.waitForTimeout(600);
await page.screenshot({ path: `${SHOTS}/13c-tacticas.png` });
await page.getByRole('button', { name: 'Cerrar' }).click();

// La pausa tiene que parar el reloj de verdad.
await page.getByRole('button', { name: 'Pausa' }).click();
const relojPausado = await page.getByLabel('Reloj').innerText();
await page.waitForTimeout(1500);
const relojDespues = await page.getByLabel('Reloj').innerText();
console.log('pausa efectiva:', relojPausado === relojDespues, relojPausado);
await page.getByRole('button', { name: 'Reanudar' }).click();

await page.getByRole('button', { name: 'Saltar cuarto' }).click();
await page.waitForTimeout(1500);
const finCuarto = await page.locator('header').first().innerText();
console.log('fin del 1er cuarto en vivo:', finCuarto.split('\n').join(' '));
await page.screenshot({ path: `${SHOTS}/13d-fin-cuarto-vivo.png` });

// Y el resto del partido, simulado: los dos modos conviven en el mismo partido.
// «Pasar cuarto» deja de dirigir, juega el cuarto siguiente y lo deja
// retransmitiéndose, así que hay que saltarlo antes de volver a pasar.
await page.getByRole('button', { name: 'Pasar cuarto' }).click();
await page.waitForTimeout(1500);
await page.getByRole('button', { name: 'Saltar cuarto' }).click();
await page.waitForTimeout(800);
const trasSimular = await page.locator('header').first().innerText();
console.log('tras pasar el cuarto:', trasSimular.split('\n').join(' '));

/**
 * Cada cuarto se retransmite con el reloj corriendo. El primero se deja correr
 * un rato para ver la retransmisión en marcha —reloj, marcador parcial y
 * comentarios entrando—; el resto se salta al final, que es lo que hace quien
 * sólo quiere el resultado.
 */
async function playQuarter(watchLive) {
  const button = page.getByRole('button', { name: 'Pasar cuarto' });
  if ((await button.count()) === 0) return false;
  await button.click();
  if (watchLive) {
    await page.waitForTimeout(6000);
    const live = await page.locator('header').first().innerText();
    console.log('retransmisión en marcha:', live.split('\n').join(' '));
    console.log('comentarios vistos:', await page.locator('ol li').count());
    await page.screenshot({ path: `${SHOTS}/14-retransmision.png` });
    await page.getByRole('button', { name: 'Estadísticas' }).click();
    await page.waitForTimeout(600);
    await page.screenshot({ path: `${SHOTS}/14b-estadisticas.png` });
    await page.getByRole('button', { name: 'Resumen' }).click();
  }
  await page.getByRole('button', { name: 'Saltar cuarto' }).click();
  await page.waitForTimeout(800);
  return true;
}

for (let quarter = 3; quarter <= 4; quarter += 1) {
  if (!(await playQuarter(quarter === 3))) break;
  const scoreboard = await page.locator('header').first().innerText();
  console.log(`tras el cuarto ${quarter}:`, scoreboard.split('\n').join(' '));
  await page.screenshot({ path: `${SHOTS}/14-cuarto-${quarter}.png` });
}

// Prórrogas, si las hubo.
for (let extra = 0; extra < 4; extra += 1) {
  if (!(await playQuarter(false))) break;
}
await page.screenshot({ path: `${SHOTS}/15-final.png` });
await page.getByRole('button', { name: 'Estadísticas' }).click();
await page.waitForTimeout(500);
console.log('actas en pantalla:', await page.locator('table').count());
await page.screenshot({ path: `${SHOTS}/15-acta.png` });
await page.getByRole('button', { name: 'Texto' }).click();
await page.waitForTimeout(500);
console.log('retransmisión completa:', await page.locator('ol li').count(), 'líneas');
await page.getByRole('button', { name: 'Canastas' }).click();
await page.waitForTimeout(400);
console.log('sólo canastas:', await page.locator('ol li').count(), 'líneas');
await page.screenshot({ path: `${SHOTS}/15b-canastas.png` });
await page.getByRole('button', { name: 'Todo' }).click();

// El partido ya jugado se puede volver a ver en la pista.
await page.getByRole('button', { name: 'Vista 2D' }).click();
await page.getByRole('button', { name: 'Ver repetición' }).click();
await page.waitForTimeout(3000);
const repeticion = await page.locator('header').first().innerText();
console.log('repetición:', repeticion.split('\n').join(' '));
await page.screenshot({ path: `${SHOTS}/15d-repeticion.png` });
await page.getByRole('button', { name: 'Terminar repetición' }).click();
await page.waitForTimeout(400);
await page.getByRole('button', { name: 'Resumen' }).click();

// «Continuar» juega el resto del día y enseña la jornada con su MVP.
await page.getByRole('button', { name: 'Continuar' }).click();
await page.waitForTimeout(4000);
console.log(
  'partidos de la jornada:',
  await page.locator('[aria-label="Resultados de la jornada"] li').count()
);
console.log(
  'MVP de la jornada:',
  (await page.locator('[aria-label="MVP de la jornada"]').innerText()).split('\n').join(' · ')
);
await page.screenshot({ path: `${SHOTS}/15e-jornada.png` });
await page.getByRole('button', { name: 'Continuar' }).click();
await page.waitForTimeout(2000);
console.log('tras la jornada:', page.url());

// La bandeja, tras el primer partido: lo que haya pasado desde el principio.
// El número exacto depende del partido; lo que se comprueba es que abre, que
// se lee y que el contador del menú baja al marcarlo todo.
await goTo(/^Correo/);
await page.waitForTimeout(1500);
console.log('avisos en la bandeja:', await page.locator('main li').count());
const cabeceraBandeja = await page.locator('main header').first().innerText();
console.log('bandeja:', cabeceraBandeja.replace(/\n/g, ' · '));
await page.screenshot({ path: `${SHOTS}/15c-bandeja.png` });
const marcarTodo = page.getByRole('button', { name: 'Marcar todo como leído' });
if ((await marcarTodo.count()) > 0) {
  await marcarTodo.click();
  await page.waitForTimeout(800);
}
console.log(
  'tras marcar todo:',
  (await page.locator('main header').first().innerText()).replace(/\n/g, ' · ')
);
await page.waitForTimeout(600);
console.log(
  'icono del correo tras marcar todo:',
  await page.getByRole('link', { name: /^Correo/ }).getAttribute('aria-label')
);

// El partido tiene que haberse notado en las piernas de la plantilla.
await goTo('Equipo', 'Plantilla');
await page.waitForTimeout(1200);
const primeraFila = await page.locator('tbody tr').first().innerText();
console.log('plantilla tras el partido:', primeraFila.split('\n').join(' · '));

await goTo('Competición', 'Competiciones');
await page.waitForTimeout(1500);
console.log('equipos en la clasificación:', await page.locator('tbody tr').count());
console.log(
  'divisiones:',
  (await selectorDeCompeticion().locator('option').allInnerTexts()).join(' · ')
);
await page.screenshot({ path: `${SHOTS}/16-clasificacion.png` });

// La división de al lado: la que decide quién sube el año que viene.
await selectorDeCompeticion().selectOption('liga-plata');
await page.waitForTimeout(1200);
console.log('equipos en la segunda:', await page.locator('tbody tr').count());
console.log('zonas:', (await page.locator('main ul li').allInnerTexts()).join(' · '));
await page.screenshot({ path: `${SHOTS}/16b-segunda-division.png` });
await selectorDeCompeticion().selectOption('liga-nacional');
await page.waitForTimeout(1000);

// El otro país elegido al crear la partida, con sus dos divisiones.
await selectorDeCompeticion().selectOption('grecia-1');
await page.waitForTimeout(1200);
console.log('cabecera en Grecia:', await page.locator('main h1').first().innerText());
console.log('equipos en la primera griega:', await page.locator('tbody tr').count());
await page.screenshot({ path: `${SHOTS}/16c-grecia.png` });

// Un club griego, desde su nombre en la clasificación, y uno de sus jugadores:
// sus estadísticas son las de la liga de su club, no las de la del usuario.
await page.locator('main tbody tr').first().getByRole('link').first().click();
await page.waitForURL(/#\/game\/club\//, { timeout: 10_000 });
await page.getByText('Información del equipo', { exact: true }).waitFor({ timeout: 10_000 });
await page.waitForTimeout(800);
console.log('ficha de un club griego:', (await page.locator('main h1').first().innerText()).trim());
await page.screenshot({ path: `${SHOTS}/16f-ficha-club-griego.png` });
await page.getByRole('button', { name: 'Estadísticas', exact: true }).click();
await page.waitForTimeout(800);
const filasGriegas = await page.locator('main tbody tr').count();
console.log('club griego · jugadores con estadística:', filasGriegas);
await page.getByRole('button', { name: 'Plantilla', exact: true }).click();
await page.waitForTimeout(800);
await page.locator('main tbody tr a').first().click();
await page.waitForURL(/#\/game\/player\//, { timeout: 10_000 });
await page.waitForTimeout(1200);
await page.getByRole('button', { name: 'Estadísticas', exact: true }).click();
await page.waitForTimeout(800);
console.log(
  'jugador griego:',
  (await page.locator('main h1').first().innerText()).replace(/\s+/g, ' ').trim(),
  '· con estadísticas:',
  (await page.getByText(/Todavía no ha jugado ningún partido/).count()) === 0,
  '· su club tiene:',
  filasGriegas > 0
);
await page.screenshot({ path: `${SHOTS}/16g-jugador-otra-liga-estadisticas.png` });

// Y un rival de la liga del usuario, con el primer partido ya jugado.
await goTo('Competición', 'Competiciones');
await page.waitForTimeout(1200);
await page.getByRole('button', { name: 'Clasificación', exact: true }).click();
await selectorDeCompeticion().selectOption('liga-nacional');
await page.waitForTimeout(1200);
await page.locator('main tbody tr:not(.is-mine)').first().getByRole('link').first().click();
await page.waitForURL(/#\/game\/club\//, { timeout: 10_000 });
await page.getByText('Información del equipo', { exact: true }).waitFor({ timeout: 10_000 });
await page.waitForTimeout(800);
console.log(
  'ficha de un rival de liga:',
  (await page.locator('main h1').first().innerText()).trim(),
  '· líderes:',
  await page.locator('main a[href*="/game/player/"]').count()
);
await page.screenshot({ path: `${SHOTS}/16h-ficha-rival-liga.png` });
await goTo('Competición', 'Competiciones');
await page.waitForTimeout(1000);
await selectorDeCompeticion().selectOption('liga-nacional');
await page.waitForTimeout(1000);

// Selecciones: la tuya, con lo que pide la federación, y la clasificación.
await goTo('Selecciones');
await page.waitForTimeout(1500);
const miSeleccion = await page.locator('main section').first().innerText();
console.log('mi selección:', miSeleccion.split('\n').join(' · '));
console.log('banderas en pantalla:', await page.locator('main img').count());
await page.screenshot({ path: `${SHOTS}/16d-mi-seleccion.png` });
await page.getByRole('button', { name: 'Clasificación', exact: true }).click();
await page.waitForTimeout(1000);
console.log('grupos de clasificación:', await page.locator('main table').count());
await page.screenshot({ path: `${SHOTS}/16e-clasificacion-mundial.png` });
await goTo('Competición', 'Competiciones');
await page.waitForTimeout(1200);

// «Resultados» y no «Calendario»: el calendario mensual es su propia sección.
await page.getByRole('button', { name: 'Resultados' }).click();
await page.waitForTimeout(1200);
console.log('partidos de la jornada:', await page.locator('ul li').count());
await page.screenshot({ path: `${SHOTS}/17-resultados.png` });

// El calendario mensual, con el primer partido ya jugado: su casilla lleva la
// «V» o la «D», y los demás días del mes, el rival que toca.
await goTo('Calendario');
await page.waitForTimeout(1500);
const casillasConPartido = page.getByRole('button', {
  name: /^Día \d+\. [^.]+: (contra|en casa de) /
});
console.log(
  'calendario mensual:',
  await page.getByRole('group', { name: /^Calendario de / }).getAttribute('aria-label'),
  '· días con partido:',
  await casillasConPartido.count(),
  '· jugados:',
  await page.getByRole('button', { name: /\. (victoria|derrota)(\.|$)/ }).count(),
  '· hoy marcado:',
  (await page.locator('[aria-current="date"]').count()) === 1,
  '· «Mes anterior»:',
  (await page.getByRole('button', { name: 'Mes anterior' }).count()) === 1
);
await page.screenshot({ path: `${SHOTS}/17d-calendario-mensual.png` });
// El mes siguiente, para ver que el paginador mueve la rejilla.
await page.getByRole('button', { name: 'Mes siguiente' }).click();
await page.waitForTimeout(1200);
console.log(
  'calendario tras «Mes siguiente»:',
  await page.getByRole('group', { name: /^Calendario de / }).getAttribute('aria-label'),
  '· días con partido:',
  await casillasConPartido.count()
);
await page.screenshot({ path: `${SHOTS}/17e-calendario-mes-siguiente.png` });
await goTo('Competición', 'Competiciones');
await page.waitForTimeout(1200);

// El cuadro de playoffs todavía no existe en la jornada 1, pero la pantalla
// tiene que explicarlo en vez de quedarse en blanco.
await page.getByRole('button', { name: 'Copa' }).click();
await page.waitForTimeout(1200);
console.log('copa:', await page.locator('main p').first().innerText());
await page.screenshot({ path: `${SHOTS}/17b-copa.png` });

// Europa: la fase de liga arranca en octubre, así que en la jornada 1 la
// pantalla tiene que explicarse en vez de quedarse en blanco.
await page.getByRole('button', { name: 'Continental' }).click();
await page.waitForTimeout(1500);
// Con una sola continental no hay selector: se lee lo que diga la pantalla.
const selectorContinental = page.getByRole('combobox', { name: 'Competición continental' });
console.log(
  'europa:',
  (await selectorContinental.count()) > 0
    ? (await selectorContinental.locator('option').allInnerTexts()).join(' | ')
    : (await page.locator('main section').first().innerText()).replace(/\n/g, ' | ')
);
await page.screenshot({ path: `${SHOTS}/17c-europa.png` });

await page.getByRole('button', { name: 'Playoffs' }).click();
await page.waitForTimeout(1200);
console.log('playoffs:', await page.locator('main p').first().innerText());
await page.screenshot({ path: `${SHOTS}/18-playoffs.png` });

// --- Fase 2: estadísticas de temporada -------------------------------------

await goTo('Competición', 'Estadísticas');
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
await cargarPartida('Temporada terminada');
await page.waitForTimeout(2500);
const finDeTemporada = await page.locator('section').first().innerText();
console.log('fin de temporada:', finDeTemporada.split('\n').join(' · '));
await page.screenshot({ path: `${SHOTS}/21-campeon.png` });
console.log(
  'continuar con la temporada terminada:',
  (await continuar().innerText()).replace(/\n/g, ' · ')
);

await goTo('Competición', 'Competiciones');
await page.waitForTimeout(1800);
console.log('series en el cuadro:', await page.locator('main li').count());
await page.screenshot({ path: `${SHOTS}/22-cuadro.png` });

// Europa, ya terminada: fase de liga, cuadro y campeón.
await page.getByRole('button', { name: 'Continental' }).click();
await page.waitForTimeout(2000);
console.log('campeón continental:', await page.locator('main p').first().innerText());
console.log('equipos en la fase de liga:', await page.locator('tbody tr').count());
await page.screenshot({ path: `${SHOTS}/22c-europa.png` });

// Y la segunda, ya terminada: de sus dos primeros salen los ascendidos.
await page.getByRole('button', { name: 'Clasificación' }).click();
await page.waitForTimeout(1200);
await selectorDeCompeticion().selectOption('liga-plata');
await page.waitForTimeout(1500);
const ascensos = await page.locator('tbody tr').first().innerText();
console.log('líder de la segunda:', ascensos.split('\n').join(' · '));
await page.screenshot({ path: `${SHOTS}/22b-ascensos.png` });

// El historial, que sólo tiene algo que contar con una temporada terminada.
await goTo('Club', 'Historial');
await page.waitForTimeout(1800);
const historial = await page.locator('tbody tr').first().innerText();
console.log('temporadas en el historial:', await page.locator('tbody tr').count());
console.log('última temporada:', historial.split('\n').join(' · '));
await page.screenshot({ path: `${SHOTS}/23b-historial.png` });

await page.getByRole('button', { name: 'Palmarés' }).click();
await page.waitForTimeout(1000);
const vitrina = await page.locator('main li, main p').first().innerText();
console.log('vitrina:', vitrina.split('\n').join(' · '));
await page.screenshot({ path: `${SHOTS}/23c-palmares.png` });

await page.getByRole('button', { name: 'Récords' }).click();
await page.waitForTimeout(1000);
console.log('récords:', await page.locator('main li').count());
const mejorMarca = await page.locator('main li').first().innerText();
console.log('mejor marca:', mejorMarca.split('\n').join(' · '));
await page.screenshot({ path: `${SHOTS}/23d-records.png` });

// La hoja de servicios (Mánager → Ficha) con las acciones de carrera no se
// comprueba aquí: esta partida es de modo mánager. Sale al final, con la de carrera.

// Con la temporada entera jugada hay desgaste y enfermería de verdad.
await goTo('Equipo', 'Entrenamiento');
await page.waitForTimeout(1500);
const disponibles = await page.locator('footer').first().innerText();
console.log('estado de la plantilla en junio:', disponibles.split('\n')[0]);
await page.screenshot({ path: `${SHOTS}/23-parte-medico.png` });

// Con todo terminado, CONTINUAR empieza la temporada siguiente.
await goTo('Inicio');
await page.waitForTimeout(1500);
const empezar = await continuar().innerText();
console.log('continuar para cerrar el año:', empezar.replace(/\n/g, ' · '));
console.log('continuar empieza temporada:', /Empezar temporada/.test(empezar));
// Empezar temporada es una sola llamada al proceso principal, y mientras dura
// Electron no confirma la pulsación: con el plazo de serie (30 s) el clic se da
// por fallido aunque la temporada se esté creando.
await continuar().click({ timeout: 180_000 });
await waitForAdvance();
const cabecera = await page.locator('header').first().innerText();
console.log('cabecera tras el salto:', cabecera.replace(/\n/g, ' · '));
await page.screenshot({ path: `${SHOTS}/24-temporada-siguiente.png` });

// --- Modo carrera: sin equipo y a buscar banquillo ------------------------

// La tercera partida, la que llega con el entrenador ya destituido. Es la única
// forma de ver la pantalla que convierte el despido en el principio de otra
// cosa sin encadenar media temporada de derrotas.
await page.getByRole('link', { name: 'Salir al menú' }).click();
await page.waitForTimeout(1000);
await page.getByRole('link', { name: 'Cargar partida' }).click();
await page.waitForTimeout(1200);
await cargarPartida('Carrera sin equipo');
await page.waitForTimeout(2500);

const paro = await page.locator('main section').first().innerText();
console.log('sin equipo:', paro.split('\n').slice(0, 3).join(' · '));
// Una oferta, un botón de firmar: contar `li` sueltos recogería los de otras
// secciones del club y diría más ofertas de las que hay.
console.log('ofertas sobre la mesa:', await page.getByRole('button', { name: 'Firmar' }).count());
const primera = await page.locator('main section li').first().innerText();
console.log('primera oferta:', primera.split('\n').join(' · '));
await page.screenshot({ path: `${SHOTS}/25-sin-equipo.png` });

// Antes de firmar, se espera un mes: el reloj corre sin banquillo y se abren
// otros banquillos. La fecha de la cabecera tiene que haber cambiado de mes.
// Sin selección es lo que hace CONTINUAR; con ella, el botón de al lado.
const fechaAntes = await fechaDelJuego();
console.log('continuar en el paro:', (await continuar().innerText()).replace(/\n/g, ' · '));
const esperarAparte = page.getByRole('button', { name: 'Esperar un mes', exact: true });
if ((await esperarAparte.count()) > 0) {
  await esperarAparte.click();
} else {
  await continuar().click();
}
// Un mes de partidos se simula entero: sale el aviso de avance de días.
try {
  await page.getByText('Pasa el mes…').waitFor({ timeout: 5000 });
  console.log('aviso mientras pasa el mes:', 'sí');
  await page.screenshot({ path: `${SHOTS}/25a-pasa-el-mes.png` });
} catch {
  console.log('aviso mientras pasa el mes:', 'no hizo falta (avance corto)');
}
await waitForAdvance();
const fechaDespues = await fechaDelJuego();
console.log('espera en el paro:', fechaAntes, '->', fechaDespues);
console.log('ofertas tras esperar:', await page.getByRole('button', { name: 'Firmar' }).count());
await page.screenshot({ path: `${SHOTS}/25b-tras-esperar.png` });

// Y se firma por uno: a partir de aquí la partida es la de otro club.
await page.getByRole('button', { name: 'Firmar' }).first().click();
await page.waitForTimeout(2500);
const nuevoClub = await page.locator('header').first().innerText();
console.log('tras firmar:', nuevoClub.replace(/\n/g, ' · '));
await page.screenshot({ path: `${SHOTS}/26-club-nuevo.png` });

// La hoja de servicios (Mánager → Ficha) tiene que contar ya las dos etapas.
await goTo('Mánager', 'Ficha');
await page.waitForTimeout(2000);
console.log('etapas en la hoja de servicios:', await page.locator('main li').count());
const etapas = await page.locator('main li').first().innerText();
console.log('etapa en curso:', etapas.split('\n').join(' · '));
await page.screenshot({ path: `${SHOTS}/27-hoja-de-servicios.png` });

// Y el reloj vuelve a correr: dirigir otra vez es poder jugar otra vez.
await goTo('Inicio');
await page.waitForTimeout(1500);
const fechaConBanquillo = await fechaDelJuego();
await page.getByRole('button', { name: 'Avanzar día', exact: true }).click();
await waitForAdvance();
const siguiendo = await page.locator('header').first().innerText();
console.log('la partida sigue:', siguiendo.replace(/\n/g, ' · '));
console.log('avanzar día:', fechaConBanquillo, '->', await fechaDelJuego());
await page.screenshot({ path: `${SHOTS}/28-carrera-en-marcha.png` });

// Y se dimite: dos pasos desde la hoja de servicios, y de vuelta al paro.
await goTo('Mánager', 'Ficha');
await page.waitForTimeout(2000);
await page.getByRole('button', { name: 'Dimitir' }).click();
await page.waitForTimeout(400);
await page.getByRole('button', { name: 'Confirmar dimisión' }).click();
await page.waitForTimeout(2500);
const trasDimitir = await page.locator('main section').first().innerText();
console.log('tras dimitir:', trasDimitir.split('\n').slice(0, 2).join(' · '));
// CONTINUAR se entera sin volver al club: en el paro vuelve a ser esperar.
console.log('continuar tras dimitir:', (await continuar().innerText()).replace(/\n/g, ' · '));
await page.screenshot({ path: `${SHOTS}/28b-dimision.png` });

// --- Prensa: una rueda de prensa esperando --------------------------------

await page.getByRole('link', { name: 'Salir al menú' }).click();
await page.waitForTimeout(1000);
await page.getByRole('link', { name: 'Cargar partida' }).click();
await page.waitForTimeout(1200);
await cargarPartida('Rueda de prensa pendiente');
await page.waitForTimeout(2500);

// El contador del icono del correo tiene que avisar antes de entrar.
const enlaceBandeja = page.getByRole('link', { name: /^Correo/ });
console.log(
  'menú con aviso:',
  await enlaceBandeja.getAttribute('aria-label'),
  '· en el icono:',
  (await enlaceBandeja.innerText()).trim()
);

await goTo(/^Correo/);
await page.waitForTimeout(1500);
await page.locator('main li button', { hasText: 'Rueda de prensa' }).first().click();
await page.waitForTimeout(1200);
const pregunta = await page.locator('main section p').first().innerText();
console.log('pregunta de la prensa:', pregunta);
console.log(
  'respuestas posibles:',
  await page.getByRole('button', { name: /^(Humilde|Seguro|Combativo)/ }).count()
);
await page.screenshot({ path: `${SHOTS}/29-rueda-de-prensa.png` });

// Se contesta, y la reacción llega en palabras.
await page.getByRole('button', { name: /^Combativo/ }).click();
await page.waitForTimeout(1500);
const reaccion = await page.locator('main section').first().innerText();
console.log('tras contestar:', reaccion.replace(/\n/g, ' · '));
await page.screenshot({ path: `${SHOTS}/30-prensa-contestada.png` });

// --- Liga americana: conferencias, draft, tope salarial y moral ------------

await page.getByRole('link', { name: 'Salir al menú' }).click();
await page.waitForTimeout(1000);
await page.getByRole('link', { name: 'Cargar partida' }).click();
await page.waitForTimeout(1200);
await cargarPartida('Liga americana con draft');
await page.waitForTimeout(2500);

await goTo('Competición', 'Competiciones');
await page.waitForTimeout(1800);
await page.getByRole('button', { name: 'Clasificación' }).click();
await page.waitForTimeout(1200);
console.log('tablas por conferencia:', await page.locator('main table').count());
console.log('zonas NBA:', (await page.locator('main ul li').allInnerTexts()).join(' · '));
await page.screenshot({ path: `${SHOTS}/31-conferencias.png` });

await page.getByRole('button', { name: 'Playoffs' }).click();
await page.waitForTimeout(1500);
console.log(
  'rondas del cuadro:',
  (await page.locator('main h2, main h3').allInnerTexts()).slice(0, 6).join(' · ')
);
await page.screenshot({ path: `${SHOTS}/32-cuadro-nba.png` });

await page.getByRole('button', { name: 'Draft' }).click();
await page.waitForTimeout(2000);
console.log(
  'draft:',
  (await page.locator('main section').first().innerText())
    .split(String.fromCharCode(10))
    .join(' · ')
);
// El «Avanzar» del draft, no el «Avanzar día» de la barra de arriba: va en la
// barra de acciones de abajo, con el resto de botones de la pantalla.
await page
  .getByRole('toolbar', { name: 'Acciones de la pantalla' })
  .getByRole('button', { name: /^Avanzar/ })
  .click();
await page.waitForTimeout(2500);
console.log(
  'en el reloj:',
  (await page.locator('main section').first().innerText())
    .split(String.fromCharCode(10))
    .join(' · ')
);
await page.screenshot({ path: `${SHOTS}/33-draft.png` });
const elegir = page.getByRole('button', { name: 'Elegir' });
if ((await elegir.count()) > 0) {
  await elegir.first().click();
  await page.waitForTimeout(2000);
}
console.log(
  'tras elegir:',
  (await page.locator('main section').first().innerText())
    .split(String.fromCharCode(10))
    .join(' · ')
);

await goTo('Equipo', 'Plantilla');
await page.waitForTimeout(1500);
console.log(
  'descontentos en la plantilla:',
  await page.locator('tbody tr', { hasText: 'Enfadado' }).count()
);
await page.screenshot({ path: `${SHOTS}/34-plantilla-animo.png` });

await goTo('Mercado');
await page.waitForTimeout(1500);
console.log(
  'mercado NBA:',
  (await page.locator('main header').first().innerText()).split(String.fromCharCode(10)).join(' · ')
);
await page.screenshot({ path: `${SHOTS}/35-tope-salarial.png` });

// --- El marco en la ventana mínima ------------------------------------------

// 1280×720 es la resolución más pequeña que se ofrece y bastante más estrecha
// que las capturas de IBM: la barra de arriba y la lateral tienen que caber.
await page.getByRole('link', { name: 'Ajustes', exact: true }).click();
await page.waitForTimeout(1200);
// Una ventana maximizada no cambia de tamaño al elegir resolución (así lo
// quiere Ajustes), y en una pasada larga Windows puede haberla maximizado: se
// restaura antes, o las capturas «a 1280» saldrían a pantalla completa.
await app.evaluate(({ BrowserWindow }) => {
  const window = BrowserWindow.getAllWindows()[0];
  if (window?.isMaximized()) window.unmaximize();
});
await page.waitForTimeout(600);
await page.locator('#resolution-1280x720').click();
await page.waitForTimeout(1500);
await page.getByRole('button', { name: 'Volver' }).click();
await page.waitForTimeout(1500);
console.log(
  'ventana mínima:',
  await page.evaluate(() => `${window.innerWidth}×${window.innerHeight}`),
  '· se desborda a lo ancho:',
  await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)
);
await page.screenshot({ path: `${SHOTS}/36-marco-1280.png` });
await goTo('Equipo', 'Plantilla');
await page.waitForTimeout(1500);
await page.screenshot({ path: `${SHOTS}/36b-plantilla-1280.png` });

/**
 * Las pantallas más densas, también en la ventana mínima. Además de la captura
 * se dice si la zona de la pantalla se desborda a lo ancho: el marco no se
 * desplaza, así que una tabla que no cabe no se nota en la ventana, sino en
 * `main`.
 */
async function enLaVentanaMinima(nombre, captura) {
  await page.waitForTimeout(1500);
  const desborda = await page.evaluate(() => {
    const main = document.querySelector('main');
    return main ? main.scrollWidth > main.clientWidth : false;
  });
  console.log(`${nombre} a 1280×720 · se desborda a lo ancho:`, desborda);
  await page.screenshot({ path: `${SHOTS}/${captura}.png` });
}

await page.locator('tbody tr a').first().click();
await enLaVentanaMinima('ficha', '36c-ficha-1280');
await goTo('Equipo', 'Alineación');
await enLaVentanaMinima('alineación', '36d-alineacion-1280');
await goTo('Equipo', 'Entrenamiento');
await enLaVentanaMinima('entrenamiento', '36e-entrenamiento-1280');
await goTo('Competición', 'Competiciones');
await page.waitForTimeout(1000);
await page.getByRole('button', { name: 'Clasificación' }).click();
await enLaVentanaMinima('conferencias', '36f-conferencias-1280');
await page.getByRole('button', { name: 'Draft' }).click();
await enLaVentanaMinima('draft', '36g-draft-1280');
await goTo('Mercado');
await enLaVentanaMinima('mercado', '36h-mercado-1280');
await page.getByRole('button', { name: 'Contratos' }).click();
await enLaVentanaMinima('contratos', '36i-contratos-1280');
await goTo('Inicio');
await enLaVentanaMinima('inicio', '36j-inicio-1280');

// --- Fase 5: las secciones y pestañas nuevas -------------------------------
//
// Ya en la ventana mínima: la barra lateral lleva dos iconos más y Equipo cinco
// pestañas, y las dos cosas tienen que caber a 1280×720. El calendario y las
// fichas de club ya son de verdad (paso 2), y Mánager con su ranking (paso 3).

/** El título de la barra de sección y las pestañas que enseña. */
async function barraDeSeccion() {
  const pestañas = await page
    .getByRole('navigation', { name: /^Pantallas de/ })
    .getByRole('link')
    .allInnerTexts();
  const titulo = await page.locator('main').evaluate((main) => {
    const barra = main.previousElementSibling;
    return barra?.querySelector('p')?.textContent?.trim() ?? '';
  });
  return `${titulo} | ${pestañas.join(' · ')}`;
}

/** Si la barra de sección se desborda: las pestañas se desplazarían sin verse. */
async function pestañasCaben() {
  return page
    .getByRole('navigation', { name: /^Pantallas de/ })
    .evaluate((nav) => nav.scrollWidth <= nav.clientWidth);
}

/**
 * Si algo de la pantalla se desplaza a lo alto. El marco no se desplaza: lo hace
 * `main` o un panel con scroll propio, así que se busca el primero que lo haga.
 */
async function cabeALoAlto() {
  return page.evaluate(() => {
    const zonas = [document.querySelector('main'), ...document.querySelectorAll('main *')];
    const zona = zonas.find(
      (el) =>
        el &&
        el.scrollHeight > el.clientHeight + 1 &&
        ['auto', 'scroll'].includes(window.getComputedStyle(el).overflowY)
    );
    return zona
      ? `no (${zona.tagName.toLowerCase()} ${zona.scrollHeight} > ${zona.clientHeight})`
      : 'sí';
  });
}

console.log(
  'secciones en la barra lateral:',
  (
    await page
      .getByRole('navigation', { name: 'Secciones del juego' })
      .getByRole('link')
      .evaluateAll((links) => links.map((link) => link.getAttribute('aria-label')))
  ).join(' · ')
);
console.log(
  'la barra lateral cabe a lo alto:',
  await page
    .getByRole('navigation', { name: 'Secciones del juego' })
    .evaluate((nav) => nav.scrollHeight <= nav.clientHeight)
);
await page.screenshot({
  path: `${SHOTS}/37-barra-lateral-1280.png`,
  clip: { x: 0, y: 0, width: 420, height: 720 }
});

await goTo('Calendario');
console.log('calendario:', await barraDeSeccion());
await page.waitForTimeout(1200);
console.log(
  'calendario a 1280:',
  await page.getByRole('group', { name: /^Calendario de / }).getAttribute('aria-label'),
  '· «Mes anterior»:',
  (await page.getByRole('button', { name: 'Mes anterior' }).count()) === 1,
  '· casillas:',
  await page.getByRole('button', { name: /^Día \d+/ }).count()
);
await enLaVentanaMinima('calendario', '37a-calendario-1280');

await goTo('Mánager', 'Ficha');
console.log('mánager:', await barraDeSeccion());
await page.getByText('Ranking del mundo', { exact: true }).waitFor({ timeout: 10_000 });
console.log(
  'tu ficha:',
  (await page.locator('main h1').first().innerText()).trim(),
  '· filas del historial y del top 5:',
  await page.locator('main tbody tr').count(),
  '· cabe a lo alto:',
  await cabeALoAlto()
);
await enLaVentanaMinima('ficha del mánager', '37b-manager-ficha');

await goTo('Mánager', 'Ranking');
await page.locator('main tbody tr').first().waitFor({ timeout: 10_000 });
console.log(
  'ranking:',
  await page.locator('main tbody tr').count(),
  'filas ·',
  (
    await page
      .getByText(/Página \d+ \/ \d+/)
      .first()
      .innerText()
      .catch(() => 'sin rótulo')
  ).trim()
);
const primerEntrenador = (await page.locator('main tbody tr').first().innerText()).replace(
  /\s+/g,
  ' '
);
console.log('primero del mundo:', primerEntrenador);
await enLaVentanaMinima('ranking de entrenadores', '37c-ranking');
await page.getByRole('button', { name: 'Mi puesto' }).click();
await page.waitForTimeout(1500);
console.log(
  'mi puesto:',
  (
    await page
      .locator('main tbody tr.is-mine')
      .first()
      .innerText()
      .catch(() => 'no está')
  ).replace(/\s+/g, ' ')
);
await page.screenshot({ path: `${SHOTS}/37c2-ranking-mi-puesto.png` });

// La ficha de otro entrenador, desde la primera fila del ranking del mundo.
await goTo('Mánager', 'Ranking');
await page.locator('main tbody tr').first().waitFor({ timeout: 10_000 });
await page.locator('main tbody tr').first().getByRole('link').first().click();
await page.getByText('Ranking del mundo', { exact: true }).waitFor({ timeout: 10_000 });
console.log('ficha ajena:', (await page.locator('main h1').first().innerText()).trim());
await enLaVentanaMinima('ficha de otro entrenador', '37c3-entrenador-ajeno');

// Tu club, pestaña «Club» de Equipo: la misma ficha que la de cualquiera, pero
// sin niebla y con la moral.
await goTo('Equipo', 'Club');
console.log('equipo:', await barraDeSeccion(), '· caben:', await pestañasCaben());
await page.getByText('Información del equipo', { exact: true }).waitFor({ timeout: 10_000 });
console.log(
  'tu club:',
  (await page.locator('main h1').first().innerText()).trim(),
  '· rótulo «INFORMACIÓN DEL EQUIPO»:',
  (await page.getByText('Información del equipo', { exact: true }).count()) === 1,
  '· cabe a lo alto:',
  await cabeALoAlto()
);
await enLaVentanaMinima('tu club', '37d-club-propio-1280');
await page.getByRole('button', { name: 'Plantilla', exact: true }).click();
await page.waitForTimeout(800);
console.log(
  'tu club · columna Moral en la plantilla:',
  (await page.locator('main thead th', { hasText: /^Moral$/ }).count()) === 1
);
await enLaVentanaMinima('tu club · plantilla', '37d2-club-propio-plantilla-1280');

await goTo('Competición', 'Clubes');
console.log('competición:', await barraDeSeccion(), '· caben:', await pestañasCaben());
await page.waitForTimeout(800);
console.log('clubes en la liga:', await page.locator('main tbody tr').count());
await enLaVentanaMinima('clubes', '37e-clubes-1280');
// Competiciones mete sus propias pestañas detrás: con Clubes, también tienen que caber.
await goTo('Competición', 'Competiciones');
await page.waitForTimeout(1200);
console.log('competiciones con sus pestañas · caben:', await pestañasCaben());
await page.screenshot({ path: `${SHOTS}/37f-competiciones-pestanas-1280.png` });

// La ficha de un rival, abierta desde su nombre en la clasificación. Cuenta como
// Competición, y lo que no se ve de un club ajeno se comprueba también en lo que
// llega por IPC, no sólo en la pantalla.
await page.getByRole('button', { name: 'Clasificación', exact: true }).click();
await page.waitForTimeout(1200);
// El escudo también enlaza, pero va oculto a la accesibilidad: el enlace es el nombre.
const enlaceRival = page.locator('main tbody tr:not(.is-mine)').first().getByRole('link').first();
const nombreRival = (await enlaceRival.innerText()).trim();
await enlaceRival.click();
await page.waitForURL(/#\/game\/club\//, { timeout: 10_000 });
await page.getByText('Información del equipo', { exact: true }).waitFor({ timeout: 10_000 });
await page.waitForTimeout(800);
const idRival = decodeURIComponent(page.url().split('/game/club/')[1] ?? '');
console.log('ficha del rival:', nombreRival, '·', await barraDeSeccion());
console.log(
  'ficha del rival · cabecera:',
  (await page.locator('main h1').first().innerText()).trim(),
  '· cabe a lo alto:',
  await cabeALoAlto(),
  '· habla de caja o presupuesto:',
  /\b(caja|presupuesto)\b/i.test(await page.locator('main').innerText())
);
await enLaVentanaMinima('ficha del rival · resumen', '37g-ficha-rival-resumen-1280');

const visibilidad = await page.evaluate(async (teamId) => {
  const api = window.api;
  const club = await api.teams.get(teamId);
  const plantilla = await api.players.listByTeam(teamId);
  const jugador = plantilla[0] ? await api.players.get(plantilla[0].id) : null;
  let finanzas = 'rechazadas';
  try {
    await api.club.getFinances(teamId);
    finanzas = 'SE VEN';
  } catch {
    // Lo esperado: las cuentas son sólo del club propio.
  }
  const estado = await api.gameState.get();
  const cuerpo = estado?.teamId ? await api.staff.get(estado.teamId) : null;
  const analista = cuerpo?.members.find((member) => member.role === 'analyst') ?? null;
  return {
    caja: club ? club.budgetCents : 'sin club',
    moralEnLista: plantilla.filter((player) => player.morale !== null).length,
    moralEnFicha: jugador ? jugador.morale : 'sin jugador',
    finanzas,
    analista: analista ? analista.level : 0
  };
}, idRival);
console.log(
  'visibilidad del rival · caja:',
  visibilidad.caja,
  '· jugadores con moral:',
  visibilidad.moralEnLista,
  '· moral en su ficha:',
  visibilidad.moralEnFicha,
  '· finanzas:',
  visibilidad.finanzas,
  '· oculto como toca:',
  visibilidad.caja === null &&
    visibilidad.moralEnLista === 0 &&
    visibilidad.moralEnFicha === null &&
    visibilidad.finanzas === 'rechazadas'
);

await page.getByRole('button', { name: 'Plantilla', exact: true }).click();
await page.waitForTimeout(600);
console.log(
  'ficha del rival · jugadores:',
  await page.locator('main tbody tr').count(),
  '· columna Moral:',
  (await page.locator('main thead th', { hasText: /^Moral$/ }).count()) > 0
);
await enLaVentanaMinima('ficha del rival · plantilla', '37h-ficha-rival-plantilla-1280');

await page.getByRole('button', { name: 'Estadísticas', exact: true }).click();
await page.waitForTimeout(600);
console.log(
  'ficha del rival · filas de estadísticas:',
  await page.locator('main tbody tr').count()
);
await enLaVentanaMinima('ficha del rival · estadísticas', '37i-ficha-rival-estadisticas-1280');

await page.getByRole('button', { name: 'Partidos', exact: true }).click();
await page.waitForTimeout(600);
console.log('ficha del rival · partidos:', await page.locator('main li').count());
await enLaVentanaMinima('ficha del rival · partidos', '37j-ficha-rival-partidos-1280');

// Tácticas: con un analista de nivel 2 o más, la pizarra; sin él, el aviso.
await page.getByRole('button', { name: 'Tácticas', exact: true }).click();
await page.waitForTimeout(800);
const sinInforme = (await page.getByText(/Sin informe del analista/).count()) > 0;
const conPizarra = (await page.getByText('Sistema ofensivo', { exact: true }).count()) > 0;
console.log(
  'ficha del rival · tácticas:',
  sinInforme ? 'aviso sin analista' : conPizarra ? 'pizarra' : 'NADA',
  '· nivel del analista:',
  visibilidad.analista,
  '· cuadra:',
  visibilidad.analista >= 2 ? conPizarra && !sinInforme : sinInforme && !conPizarra
);
await enLaVentanaMinima('ficha del rival · tácticas', '37k-ficha-rival-tacticas-1280');

await app.close();
console.log(`OK — capturas en ${SHOTS}`);
