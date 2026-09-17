# Sistema de diseño

Lo que se ve y con qué se monta. Vive en `src/renderer/src/shared/ui/` y se
mira entero abriendo el juego en **`#/estilo`**.

> **En transición (desde el 2026-09-17).** El juego pasa entero a la piel de
> International Basketball Manager 23: marco oscuro con paneles claros. Este
> documento describe **la piel nueva**, que es la que manda. Hasta que acabe la
> migración queda código de la piel vieja («pista de noche», `court-*` y
> `ball-*`); ver [Migración](#migración) para saber qué falta.

No se inventó de cero: salió de contar lo que ya estaba escrito a mano en las
pantallas. Esas cuentas son la justificación de cada pieza, así que se dejan
aquí.

| Escrito a mano       | Veces | Ahora                |
| -------------------- | ----: | -------------------- |
| Título de pantalla   |    17 | `AppPageHeader`      |
| Título de sección    |    31 | `AppSectionTitle`    |
| Caja con borde       |    28 | `AppPanel`           |
| Botón principal      |    10 | `AppButton`          |
| Barra de pestañas    |     5 | `AppTabs`            |
| Cifra con etiqueta   |     9 | `AppStat`            |
| Verde y rojo sueltos |    36 | tonos `good` y `bad` |

Diez formas distintas de escribir «botón principal», con **tres** tratamientos
distintos de deshabilitado, es lo que convenció de que hacía falta esto.

## Cuándo se hizo, y por qué entonces

Ni al empezar ni al acabar. Se hizo al cerrar el Bloque 4, cuando ya había
catorce pantallas —bastantes para saber qué se repite de verdad— y justo antes
del Bloque 5, que es el más visual de todos. Hacerlo antes habría sido inventar
componentes para pantallas que no existían; hacerlo después, reescribir catorce.

La señal concreta fue escribir el bloque de una eliminatoria **dos veces**: una
en el cuadro nacional y otra en el europeo. Dos copias del mismo bloque es una
que se va a quedar atrás en cuanto alguien toque la otra.

## La piel: IBM 23

### De dónde sale

El 2026-09-16 la pantalla del partido se hizo a imagen de IBM 23, colores
incluidos. Al día siguiente se analizaron 73 capturas del juego entero y el
usuario decidió llevar ese aspecto **a toda la aplicación** y retirar la pista
de noche. Las decisiones, una a una, están en [Decisiones](#decisiones-del-2026-09-17).

Se copia **la distribución y el lenguaje visual**, nunca logos, iconos, fotos
ni marcas de IBM: los iconos son propios, las caras son `AppAvatar` y los
escudos, `TeamBadge`.

### La idea en una frase

- **Marco oscuro** arriba, a la izquierda y abajo: barra superior morada,
  barra lateral de iconos, barra de sección con pestañas y barra de acciones,
  casi negras.
- **Paneles claros** con rótulo **añil** en degradado y título centrado en
  MAYÚSCULAS.
- **Tablas de celdas grises separadas por huecos** de 3 px, sin líneas.
- **Azul** para lo que se pulsa; **azul pálido** para lo tuyo o lo elegido.
- **Esquinas rectas y sin sombras.** Excepciones contadas: el chip de posición
  (3 px) y los buscadores redondos.
- **Densidad alta**, pero probada en **1280×720**, que es la ventana mínima
  del juego y bastante más estrecha que las capturas de IBM (~1740).

### Los colores

La paleta está en `src/renderer/src/assets/main.css`, declarada con `@theme` de
Tailwind 4 para que sean utilidades (`bg-tv-paper`) y no cadenas sueltas. Se
llama **`tv-*`** porque nació en la retransmisión del partido; no se renombró
al extenderla porque ya se usaba unas 150 veces y el nombre no molesta.

| Grupo       | Tokens                                                                  | Para qué                                                              |
| ----------- | ----------------------------------------------------------------------- | --------------------------------------------------------------------- |
| Marco       | `tv-chrome`, `tv-chrome-2`, `tv-bar`, `tv-rail`, `tv-footer`, `tv-slab` | Barra superior (degradado), sección, lateral, acciones, inputs negros |
| Rótulos     | `tv-head-from` → `tv-head-to`; `tv-950` … `tv-600`                      | Cabecera de panel y de tabla; morados de la previa y el partido       |
| Papel       | `tv-paper`, `tv-cell`, `tv-cell-strong`, `tv-box`, `tv-ink`, `tv-muted` | Cuerpo del panel, celda, columna destacada, caja de cifra, texto      |
| Interacción | `tv-blue`, `tv-blue-dim` + `tv-blue-dim-ink`, `tv-select`, `tv-cyan`    | Botón y enlace; botón apagado; **lo tuyo**; chip de posición          |
| Estados     | `tv-green`, `tv-red`, `tv-red-deep`, `tv-strong`, `tv-amber`            | Sube / baja, gana / pierde, descenso, atributo fuerte, aviso          |
| Escala      | `tv-rate-top`, `tv-rate-high`, `tv-rate-mid`, `tv-rate-low`             | Cualquier valor de 0 a 100 (ver [Tonos](#tonos))                      |
| Estrellas   | `tv-amber`, `tv-star-off`, `tv-star-box`                                | Llenas, vacías y su caja negra                                        |
| Competición | `tv-competition` → `tv-competition-deep`                                | Tarjeta de partido y días de partido en el calendario                 |
| Fondo       | `tv-deco-plum`, `tv-deco-petrol`, `tv-magenta`, `tv-orange`             | Fondo con franjas: sólo menú, asistente y pantallas vacías            |

- **El texto sobre papel** es `tv-ink`; sobre el marco, blanco. Las cifras de
  las tablas van en negro: sólo llevan color los deltas, lo que está en
  peligro (contrato que acaba, forma baja) y la escala.
- **El naranja ya no marca lo tuyo.** Lo tuyo es `tv-select` (tu fila en una
  tabla, la tarjeta elegida) y lo que se pulsa es `tv-blue`. El naranja se
  queda para la tarjeta de partido y los detalles del fondo.

### La letra

**Signika**, empaquetada con `@fontsource/signika` (sólo latín y latín
extendido, pesos 400, 600 y 700) e importada en `src/renderer/src/main.ts`: la
aplicación carga sin conexión y no puede tirar de Google Fonts. Licencia SIL OFL
1.1, citada en Ajustes → Créditos.

Se probó con una maqueta de la piel entre Catamaran, Signika y Hind. Catamaran
era la más parecida a IBM y fue la primera elegida, pero **sus cifras no tienen
el mismo ancho** (el «1» mide la mitad que el «0») ni traen la variante
tabular, y lo mismo le pasa a Hind: el reloj y el marcador del partido
bailarían al cambiar y las columnas de cifras no cuadrarían. Signika tiene las
diez cifras del mismo ancho, así que la regla de las cifras de ancho fijo se
cumple sin trucos.

| Elemento                        | Aspecto                                           |
| ------------------------------- | ------------------------------------------------- |
| Título de sección (barra negra) | MAYÚSCULAS, 700                                   |
| Pestañas                        | Tipo oración, 700; activa con subrayado `tv-blue` |
| Rótulo de panel y de columna    | MAYÚSCULAS, 700, con algo de espaciado, centrado  |
| Celdas                          | 400. Nombres como **Nombre APELLIDO**             |
| Cifra en caja                   | 700, grande, con cifras de ancho fijo             |
| Botones                         | MAYÚSCULAS, 700                                   |
| Letra pequeña                   | 400, `tv-muted`                                   |

### Tonos

Un **tono** dice lo que _significa_ un dato, no de qué color se pinta. Los
componentes traducen tono a color en `shared/ui/tones.ts`, que es el único sitio
donde vive esa traducción.

| Tono      | Qué dice                               |
| --------- | -------------------------------------- |
| `neutral` | un dato más                            |
| `accent`  | esto es tuyo, o esto está seleccionado |
| `good`    | va bien                                |
| `warn`    | ojo                                    |
| `bad`     | va mal                                 |

**La escala de 0 a 100 tiene cuatro tramos, los de IBM, y es la misma para
todo**: media, atributos, forma física, moral, confianza del consejo.

| Tramo       | Color          |
| ----------- | -------------- |
| 80 o más    | `tv-rate-top`  |
| 70 a 79     | `tv-rate-high` |
| 60 a 69     | `tv-rate-mid`  |
| menos de 60 | `tv-rate-low`  |

Sustituye al corte 70/40 de la piel vieja. Es una sola escala para que el
jugador aprenda a leer el color **una vez**: si en una pantalla 70 es lima y en
otra amarillo, el color deja de ser información. `toneForDelta()` sigue
traduciendo una diferencia por su signo.

## Las piezas

| Componente        | Para qué                                                              |
| ----------------- | --------------------------------------------------------------------- |
| `AppPageHeader`   | Título de pantalla y, a su lado, el dato que dice dónde estás         |
| `AppPanel`        | El panel: rótulo añil y cuerpo claro; `scroll` para tablas largas     |
| `AppSectionTitle` | El apartado dentro de una pantalla                                    |
| `AppStat`         | Una cifra en su caja, con la etiqueta arriba                          |
| `AppButton`       | `primary`, `secondary`, `ghost`, `danger` × `sm`, `md`, `lg`          |
| `AppTabs`         | `underline` dentro de una pantalla, `pills` para elegir entre iguales |
| `AppMeter`        | Barra de 0 a 100 con su número                                        |
| `AppBadge`        | Etiqueta pequeña con tono                                             |
| `AppField`        | Etiqueta, control y explicación                                       |
| `AppEmpty`        | Lo que se enseña cuando todavía no hay nada                           |
| `AppRing`         | El 0-100 en anillo con la escala de cuatro tramos                     |
| `AppStars`        | Estrellas en su caja negra: potencial, pabellón, reputación           |
| `AppSegmented`    | Dos o tres opciones excluyentes, todas a la vista                     |
| `AppScale`        | Deslizador con los extremos con nombre                                |

Fuera del kit quedan dos cosas a propósito:

- **`.data-table`**, en `main.css`. Es CSS y no componente porque una tabla de
  datos cambia demasiado de una pantalla a otra —columnas, celdas con enlace,
  filas con color— y envolverla en un componente obligaría a un `slot` por
  columna. La clase da lo que sí es común: cabecera pegada, altura de fila y
  cifras alineadas a la derecha con `numeric`.

  **`numeric` va en la cabecera y en las celdas de la columna, las dos.** Hasta
  el 2026-09-16 no bastaba: la regla de `thead th` pesaba más que `.numeric` y
  dejaba toda cabecera numérica a la izquierda, así que en todas las tablas los
  títulos quedaban descuadrados respecto a sus cifras. Ahora
  `.data-table th.numeric` tiene la especificidad que hace falta, y el arnés de
  auditoría que lo destapó comparó columna a columna 23 tablas del juego.

- **`SeriesCard`**, en la feature de competición. Se comparte entre el cuadro
  nacional y el europeo, pero sabe de eliminatorias: eso es dominio del juego,
  no del kit.

Las piezas del partido con prefijo `Broadcast` (`BroadcastPanel`,
`BroadcastButton`, `BroadcastBackdrop`, `BroadcastDrawer`) nacieron en
`features/match` cuando esa piel era sólo del partido. Con la piel en todo el
juego, **pasan al kit** o se funden con sus equivalentes (`AppPanel`,
`AppButton`).

### Lo que se trajo de IBM antes de la piel

Cuatro piezas salieron de mirar capturas de IBM 23 antes de copiar su aspecto,
y las cuatro resuelven algo que el kit no resolvía:

- **`AppRing`** — las tres confianzas (directiva, afición, jugadores) en
  anillos, no en barras. Tres barras seguidas parecen un ecualizador; tres
  anillos se leen de un vistazo y de lejos.
- **`AppStars`** — un número dice _cuánto_; cinco estrellas dicen _de qué
  clase_, que es lo que se pregunta uno al mirar si le llega el pabellón para la
  Euroliga.
- **`AppSegmented`** — «1 vs 1 / Zonas» es un interruptor, no un desplegable:
  las opciones se ven todas y se prueban de una pulsada.
- **`AppScale`** — un 1-10 pelado no dice nada; lo que decide un entrenador no
  es «siete», es «más agresivo que lo normal».

## Reglas

1. **Una pantalla nueva no escribe clases de borde, relleno ni color de estado.**
   Si hace falta algo que el kit no da, se añade al kit.
2. **Lo tuyo es azul pálido; lo que se pulsa, azul.** Ninguno de los dos decora.
3. **Una sola escala de 0 a 100**, la de cuatro tramos, en todo el juego.
4. **Las cifras llevan ancho fijo** (`numeric` en tabla, `figure` suelto): un
   marcador que pasa de 99 a 100 no debe dar un salto en pantalla.
5. **Los jugadores se escriben «Nombre APELLIDO»** y su puesto con las siglas
   B/E/A/AP/P, en todas las tablas.
6. **Nunca una pantalla en blanco.** Si no hay datos, `AppEmpty` cuenta por qué
   y cuándo los habrá.
7. **Una pantalla se migra entera o no se migra.** Nada de paneles claros con
   texto de la piel vieja dentro: `court-100` sobre papel no se lee.
8. **La guía manda.** Si algo se ve raro en `#/estilo`, está roto en todas
   partes.

## Decisiones del 2026-09-17

1. Toda la aplicación con la piel IBM; la pista de noche se retira.
2. Lo tuyo en azul pálido y las acciones en azul; el naranja deja de marcar lo
   tuyo.
3. Navegación con **barra lateral de iconos** y, arriba, **pestañas de la
   sección** (Equipo, Competición, Club…).
4. Un único **CONTINUAR** en la cabecera, que avanza hasta lo siguiente que
   necesita al usuario; «Avanzar día» queda como opción secundaria.
5. Letra **Signika**, empaquetada (se eligió Catamaran y se cambió por sus cifras de ancho variable).
6. Escala de **cuatro tramos para todo** valor de 0 a 100.
7. Ficha del jugador como IBM: **potencial en estrellas** y **atributos en
   números grandes**, con los fuertes en verde claro (`tv-strong`).
8. La tabla de plantilla **sin columnas de atributos**: número, jugador,
   puesto, moral, forma, media y minutos.
9. **Nueva partida como asistente por pasos**, sólo con los pasos que el juego
   ya tiene.
10. **«Nombre APELLIDO» y siglas de puesto** en todas las tablas.
11. **Fondo morado con franjas** sólo en el menú, el asistente y las pantallas
    vacías; detrás de las tablas, liso.
12. **Pantallas nuevas dentro de la migración**: calendario mensual, ficha del
    rival y ranking de entrenadores.

## Migración

Por fases, y cada pantalla de una vez (regla 7). El mapa pantalla a pantalla,
con la captura de IBM que corresponde a cada una, está en el informe de
análisis de las capturas.

| Fase | Qué                                                                                                                                                                                                                                                              | Estado    |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 0    | Decisiones, letra, colores medidos y este documento                                                                                                                                                                                                              | Hecha     |
| 1    | Kit en la piel nueva: panel, botón, pestañas, anillo y estrellas, caja de cifra, `.data-table`, tonos de cuatro tramos; piezas nuevas (chip de puesto, moral, nombre de jugador, selector, paginador, lista clave-valor, modal); `Broadcast*` al kit; `#/estilo` | Pendiente |
| 2    | Marco: cabecera con CONTINUAR, barra de iconos, barra de sección con pestañas, barra de acciones, aviso de avance de días                                                                                                                                        | Pendiente |
| 3    | Pantallas de más uso: inicio, plantilla, ficha del jugador, alineación, competición                                                                                                                                                                              | Pendiente |
| 4    | Resto del juego: entrenamiento y cuerpo técnico, cantera, estadísticas, mercado, finanzas, correo y ruedas de prensa, historial, selecciones, cuadros                                                                                                            | Pendiente |
| 5    | Pantallas nuevas: calendario mensual, ficha del rival, ranking de entrenadores                                                                                                                                                                                   | Pendiente |
| 6    | Fuera de la partida y limpieza: menú, asistente de nueva partida, partidas, ajustes, editor; retirar `court-*` y `ball-*`                                                                                                                                        | Pendiente |

**De golpe, no por variantes** (decisión del usuario). Las piezas del kit
cambian de aspecto directamente, sin convivir con la piel vieja, y las fases 1 a
4 —kit, marco y todas las pantallas del juego— se entregan juntas: a mitad de
camino la aplicación no se ve bien, así que no se da por buena ninguna fase
suelta. Así no queda código de transición que luego haya que borrar.

## Cómo no se pudre

`#/estilo` es una ruta de verdad y el arnés (`pnpm verify:app`) le hace una
captura en cada pasada. Si alguien rompe un botón, se ve ahí antes que en la
pantalla donde esté escondido.

No está enlazada desde el juego a propósito: al jugador no le sirve de nada.
