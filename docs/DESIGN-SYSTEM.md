# Sistema de diseño

Lo que se ve y con qué se monta. Vive en `src/renderer/src/shared/ui/` y se
mira entero abriendo el juego en **`#/estilo`**.

> **Piel de IBM 23 (desde el 2026-09-17).** El juego entero lleva la piel de
> International Basketball Manager 23: marco oscuro con paneles claros. Este
> documento describe esa piel, que es la que manda. La de antes («pista de
> noche», `court-*` y `ball-*`) ya no existe; lo que falta son las pantallas
> nuevas de la fase 5 (ver [Migración](#migración)).

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

| Grupo       | Tokens                                                                               | Para qué                                                                                         |
| ----------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| Marco       | `tv-chrome`, `tv-chrome-2`, `tv-bar`, `tv-rail`, `tv-footer`, `tv-slab`, `tv-canvas` | Barra superior (degradado), sección, lateral, acciones, inputs negros, fondo liso de la pantalla |
| Rótulos     | `tv-head-from` → `tv-head-to`; `tv-950` … `tv-600`                                   | Cabecera de panel y de tabla; morados de la previa y el partido                                  |
| Papel       | `tv-paper`, `tv-cell`, `tv-cell-strong`, `tv-box`, `tv-ink`, `tv-muted`              | Cuerpo del panel, celda, columna destacada, caja de cifra, texto                                 |
| Interacción | `tv-blue`, `tv-blue-dim` + `tv-blue-dim-ink`, `tv-select`, `tv-cyan`, `tv-step`      | Botón y enlace; botón apagado; **lo tuyo**; chip de posición; paso no actual del asistente       |
| Estados     | `tv-green`, `tv-red`, `tv-red-deep`, `tv-strong`, `tv-amber`                         | Sube / baja, gana / pierde, descenso, atributo fuerte, aviso                                     |
| Letra       | `tv-blue-ink`, `tv-green-ink`, `tv-amber-ink`                                        | Texto de color sobre papel (sin medir: los de arriba, oscurecidos)                               |
| Ánimo       | `tv-mood-great`, `-good`, `-normal`, `-low`, `-bad`                                  | Los cinco niveles de `MoodIcon`                                                                  |
| Escala      | `tv-rate-top`, `tv-rate-high`, `tv-rate-mid`, `tv-rate-low`                          | Cualquier valor de 0 a 100 (ver [Tonos](#tonos))                                                 |
| Estrellas   | `tv-amber`, `tv-star-off`, `tv-star-box`                                             | Llenas, vacías y su caja negra                                                                   |
| Competición | `tv-competition` → `tv-competition-deep`                                             | Tarjeta de partido y días de partido en el calendario                                            |
| Correo      | `tv-mail-from` → `tv-mail-to`                                                        | Rótulo azul del correo: la única cabecera que no es añil                                         |
| Fondo       | `tv-deco-plum`, `tv-deco-petrol`, `tv-magenta`, `tv-orange`                          | Fondo con franjas: sólo menú, asistente y pantallas vacías                                       |

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

Cada componente dice en su comentario sobre qué fondo va: casi todos, sobre
papel; `AppPageHeader` y las pestañas `underline`, sobre el marco oscuro.

| Componente        | Para qué                                                                           |
| ----------------- | ---------------------------------------------------------------------------------- |
| `AppPageHeader`   | Título de pantalla y, a su lado, el dato que dice dónde estás (sobre el marco)     |
| `AppPanel`        | El panel: rótulo añil y cuerpo claro; `hint`, `actions`, hueco `header`, `scroll`  |
| `AppSectionTitle` | El subrótulo añil de un apartado dentro de un panel                                |
| `AppStat`         | Una cifra grande en su caja gris, con la etiqueta arriba                           |
| `AppButton`       | `primary`, `secondary`, `ghost`, `danger` × `sm`, `md`, `lg`; galón con `arrow`    |
| `AppTabs`         | `underline` en la barra de sección, `pills` para elegir entre iguales              |
| `AppMeter`        | Barra de 0 a 100 con su número                                                     |
| `AppBadge`        | Etiqueta pequeña rellena, con tono                                                 |
| `AppField`        | Etiqueta, control y explicación                                                    |
| `AppEmpty`        | Lo que se enseña cuando todavía no hay nada                                        |
| `AppRing`         | El 0-100 en anillo con la escala de cuatro tramos; `unknown` para «sin ojear»      |
| `AppStars`        | Estrellas (y medias) en su caja negra: potencial, pabellón, reputación             |
| `AppSegmented`    | Dos o tres opciones excluyentes, todas a la vista                                  |
| `AppScale`        | Deslizador con los extremos con nombre                                             |
| `AppSelect`       | El selector negro de los filtros                                                   |
| `AppInput`        | La caja de texto negra: filtros, nombres, cifras; `dense` para ir en un rótulo     |
| `AppCheckbox`     | La casilla de borde azul que se rellena al marcarla; hereda el color de la letra   |
| `AppStepper`      | «−», la cifra en su caja negra y «+»: minutos de la rotación, precio de la entrada |
| `AppPager`        | Flechas azules «< >» con el texto en medio: jornada, semana, página                |
| `AppModal`        | Diálogo con rótulo añil y botones abajo; foco, Escape y `role="dialog"`            |
| `TeamBadge`       | Escudo dibujado con la equipación y las iniciales; bandera si es selección         |
| `FixtureCard`     | La tarjeta naranja de un partido; `featured` es el PRÓXIMO PARTIDO del inicio      |
| `LeaderCard`      | El líder de una estadística: cara, nombre, partidos y la cifra en su caja gris     |
| `AppAvatar`       | La cara de un jugador o un técnico, generada a partir de una semilla               |
| `AppFlag`         | La bandera de un país por su código de tres letras                                 |
| `AppDrawer`       | Cajón lateral encima de la pantalla: los mandos del banquillo                      |
| `AppBackdrop`     | El fondo morado con franjas, todo CSS: menú, asistente, vacíos y el partido        |
| `PositionChip`    | El puesto en su chip cian: B, E, A, AP, P                                          |
| `PlayerName`      | «Nombre APELLIDO», «N. APELLIDO» o en dos líneas                                   |
| `MoodIcon`        | El ánimo en cinco niveles, con flecha y color                                      |
| `AttributeGrid`   | Atributos en números grandes, en columnas, con los fuertes en verde claro          |
| `KeyValueList`    | La tabla clave-valor de una ficha                                                  |

Las **estrellas** de un valor de 0 a 100 —potencial, reputación de un club, de
una selección o del entrenador— se cuentan siempre con `toStars()`
(`src/shared/domain/stars.ts`): una cada veinte puntos, a la media más cercana.
Antes cada pantalla dividía por veinte por su cuenta.

`AttributeGrid` da por fuerte lo que está en el tramo alto de la escala (80 o
más), la misma frontera que pinta de verde el anillo. IBM no resalta por un
número fijo —en una misma ficha marca un 77 y no un 83—, sino por lo que pesa en
el puesto; como el juego no tiene ese dato, cada atributo puede decir `strong` a
mano.

Fuera del kit quedan dos cosas a propósito:

- **`.data-table`**, en `main.css`. Es CSS y no componente porque una tabla de
  datos cambia demasiado de una pantalla a otra —columnas, celdas con enlace,
  filas con color— y envolverla en un componente obligaría a un `slot` por
  columna. La clase da lo que sí es común: cabecera añil pegada, celdas grises
  separadas por huecos de 3 px, cifras alineadas a la derecha con `numeric` y
  unas pocas clases con significado:

  | Clase                    | Dónde | Qué hace                                     |
  | ------------------------ | ----- | -------------------------------------------- |
  | `is-mine`, `is-selected` | `tr`  | Lo tuyo o lo elegido: la fila en `tv-select` |
  | `is-key`                 | `td`  | La columna que manda o por la que se ordena  |
  | `zone-up`, `zone-down`   | `td`  | Marca de zona: playoff o ascenso, descenso   |

  Los rótulos de columna se alinean como sus celdas (a la izquierda, o a la
  derecha con `numeric`) y no centrados como en IBM: con cifras de distinta
  longitud, centradas no cuadran.

  Va en la capa `components` de Tailwind, así que **una utilidad puesta en la
  celda manda** sobre el aspecto de serie: `py-0.5` para una fila con anillo,
  `whitespace-normal` para un texto largo. Hasta el 2026-09-17 estaba fuera de
  las capas y esas utilidades no hacían nada.

  **`numeric` va en la cabecera y en las celdas de la columna, las dos.** Hasta
  el 2026-09-16 no bastaba: la regla de `thead th` pesaba más que `.numeric` y
  dejaba toda cabecera numérica a la izquierda, así que en todas las tablas los
  títulos quedaban descuadrados respecto a sus cifras. Ahora
  `.data-table th.numeric` tiene la especificidad que hace falta, y el arnés de
  auditoría que lo destapó comparó columna a columna 23 tablas del juego.

- **Las piezas de competición**, en `features/competition/`. Se comparten
  entre la liga, la Copa, Europa, los playoffs y las selecciones, pero saben de
  clasificaciones y eliminatorias: eso es dominio del juego, no del kit.

  | Pieza               | Qué hace                                                                                       |
  | ------------------- | ---------------------------------------------------------------------------------------------- |
  | `StandingsTable`    | La clasificación: puesto con barra de zona, escudo y cifras; `full`, `division`, `nationOf`    |
  | `standing-zones.ts` | Qué barra lleva cada zona: play-in en ámbar y, con playoffs en la misma tabla, ascenso en cian |
  | `GameRow`           | Un partido en una línea: jornada de liga, Copa y grupos de selecciones                         |
  | `MatchupCard`       | Un cruce de cuadro: dos equipos con su cifra en caja; el que pasa, en verde                    |
  | `SeriesCard`        | Una eliminatoria de playoffs o de Europa: `MatchupCard` con los partidos debajo                |
  | `BracketColumns`    | El cuadro en columnas, una por ronda; el cruce lo pinta quien lo usa                           |
  | `ChampionBanner`    | La franja del campeón encima del cuadro                                                        |
  | `BestTeamsPanel`    | Mejor ataque, mejor defensa y rachas, al lado de la clasificación                              |
  | `RoundMvpPanel`     | El MVP de la jornada, al lado de los resultados                                                |

- **Otras piezas de feature** que se parecen al kit y no lo son: `MailPanel` y
  `MailRow` (el correo, con su rótulo azul), `WizardSteps` (los puntos del
  asistente de nueva partida), `MinutesBar` (la barra segmentada de minutos de
  la rotación), `PanelMore` (el «+» de los paneles del inicio) y
  `ConfidenceRings` (las tres confianzas de IBM en anillos —directiva, afición
  y jugadores—, en el inicio y en Finanzas; la de los jugadores es la moral
  media de la plantilla, `squadMorale()`, y la que no tiene dato no se pinta).

Las piezas del partido con prefijo `Broadcast` (`BroadcastPanel`,
`BroadcastButton`, `BroadcastBackdrop`, `BroadcastDrawer`) nacieron en
`features/match` cuando esa piel era sólo del partido. Con la piel en todo el
juego **ya no existen** (fase 1): el panel y el botón se fundieron con
`AppPanel` y `AppButton`, y el fondo y el cajón pasaron al kit como
`AppBackdrop` y `AppDrawer`. `TeamBadge` pasó al kit en la fase 2, cuando lo
empezó a usar el marco (el escudo del club y el del rival en CONTINUAR).

**Lo que cuesta dinero y no tiene vuelta atrás se confirma con `AppModal`**:
rescindir un contrato pregunta lo mismo desde la ficha del jugador y desde el
mercado.

`AppModal` admite `dismissible` a falso para los avisos que se van solos (el
avance de días): sin «✕», y ni Escape ni pulsar fuera lo cierran.

## El marco del juego

Todo lo que va dentro de una partida se pinta en `layouts/DefaultLayout.vue`,
con las piezas en `features/app-shell/components/`. No van en el kit porque
saben del juego —la partida cargada, el calendario, las rutas— y sólo existe un
marco.

```
┌───────────────────────────────────────────────────────────┐  72 px  GameTopBar
│ escudo · equipo y caja · entrenador · fecha · CONTINUAR   │
├────┬──────────────────────────────────────────────────────┤  50 px  SectionBar
│    │ SECCIÓN | pestañas                         controles │
│ 48 ├──────────────────────────────────────────────────────┤
│ px │ la pantalla, con su scroll, sobre `tv-canvas`        │
│    ├──────────────────────────────────────────────────────┤  55 px  ActionBar
│    │                                           acciones   │  (sólo si hay)
└────┴──────────────────────────────────────────────────────┘
GameRail
```

| Pieza              | Qué hace                                                                                                                                                                                                                  |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GameTopBar`       | Degradado `tv-chrome` → negro → `tv-chrome-2`. Escudo en bloque blanco sesgado, equipo y caja, entrenador (cara, bandera y, en carrera, reputación en estrellas), fecha y día con la temporada, «Avanzar día» y CONTINUAR |
| `GameRail`         | `tv-rail`, 48 px. Un icono por sección con `aria-label` y etiqueta al pasar por encima; la activa con barra azul. Correo lleva los no leídos. Abajo, Ajustes y Salir al menú                                              |
| `SectionBar`       | `tv-bar`, 50 px. TÍTULO de la sección, raya y pestañas (enlaces del router con el aspecto de `AppTabs` `underline`); con una sola pantalla no hay pestañas                                                                |
| `ActionBar`        | `tv-footer`, 55 px, botones a la derecha. Oculta si la pantalla no le mete nada. No es un `<footer>`: las pantallas tienen el suyo                                                                                        |
| `AdvanceDaysModal` | «Avance de días»: el mes con hoy recuadrado, el próximo partido con su rival y qué se simula. Sale si el avance tarda más de 350 ms                                                                                       |
| `GameIcon`         | Los iconos del marco, a trazo, dibujados aquí. Nunca los de IBM                                                                                                                                                           |

Dentro del marco la pantalla va sobre **`tv-canvas`**, liso: el fondo con franjas
es sólo del menú, el asistente y los vacíos (decisión 11). El marco no se
desplaza; sólo la zona de la pantalla. Probado en 1280×720.

### Secciones

Están en `features/app-shell/sections.ts`, que es el único sitio donde se
decide la navegación: cada sección tiene icono, título y pestañas (rutas), y
puede reclamar rutas sin pestaña (`also`). Añadir Calendario o Ranking de
entrenadores (fase 5) es una entrada más y un icono en `GameIcon`.

| Icono       | Pestañas                                                               |
| ----------- | ---------------------------------------------------------------------- |
| Inicio      | —                                                                      |
| Correo      | —                                                                      |
| Equipo      | Plantilla, Alineación, Entrenamiento, Cantera (y la ficha del jugador) |
| Competición | Competiciones, Estadísticas                                            |
| Mercado     | —                                                                      |
| Club        | Finanzas, Historial                                                    |
| Selecciones | —                                                                      |

Ajustes y Salir al menú van abajo y salen del marco. El partido, el menú,
nueva partida, partidas, ajustes, el editor y `#/estilo` siguen fuera de él.

### Lo que una pantalla pone en las barras

Con **`<Teleport defer>`** a huecos con id que pintan las barras, envuelto en
dos componentes:

```vue
<PageToolbar>                 <!-- a la derecha de la barra de sección -->
  <AppSelect v-model="liga" :options="ligas" />
</PageToolbar>
<PageToolbar place="tabs">    <!-- detrás de las pestañas de la sección -->
  <AppTabs v-model="vista" :options="vistas" />
</PageToolbar>
<PageActions>                 <!-- la barra de abajo, que aparece -->
  <AppButton variant="primary" @click="guardar">Guardar</AppButton>
</PageActions>
```

Se eligió `Teleport` y no `meta` de ruta con slots porque lo que va en la barra
es de la pantalla —usa su estado y sus funciones— y así se escribe junto al
resto de su plantilla. `PageActions` se apunta en un contador que provee el
layout (`page-chrome.ts`): con cero, la barra de acciones no se ve (`v-show`, no
`v-if`, para que el destino exista). Fuera del marco los dos pintan su contenido
donde están.

### CONTINUAR

Un único botón hace avanzar la partida (decisión 4). **Qué** hace se decide en
`features/season/continue-action.ts` —funciones puras, con test— y lo ejecuta
`features/season/continue.store.ts`; `useContinue` añade la entrada al partido.
El store también guarda la carrera y el consejo, que el panel del club lee de
ahí.

| Momento                                        | CONTINUAR hace                                                  |
| ---------------------------------------------- | --------------------------------------------------------------- |
| Partido propio pendiente                       | Avanza hasta él y entra en la previa. Lleva el escudo del rival |
| Semana de descanso (liga impar)                | Juega la jornada sin el club                                    |
| Sin partido propio (eliminado, sin playoffs)   | Sigue la temporada hasta que cambie la situación                |
| Temporada terminada con otras ligas por acabar | Las termina                                                     |
| Todo terminado                                 | Empieza la temporada siguiente                                  |
| En el paro (carrera), sin selección            | Espera un mes                                                   |
| Destituido sin selección, o sin partida        | Nada: deshabilitado                                             |

Los cuatro primeros casos son una cadena de `advanceToNextGame`: se repite
mientras CONTINUAR siga significando lo mismo, y se para en el partido del
usuario, con un despido, si el reloj no se mueve o si se pulsa «Detener avance».
Con la jornada anterior a medias, el propio avance la juega antes de llegar al
partido. Esperar un mes, empezar temporada y avanzar un día son una sola llamada
al proceso principal y no se pueden detener a medias.

Al lado, pequeño, **«Avanzar día»** (mientras haya calendario con banquillo) y,
sin club pero con selección, **«Esperar un mes»**. Todo se deshabilita mientras
hay un avance en curso.

### Tonos y escala en código

Todo en `shared/ui/tones.ts`:

- **Tonos:** `TONE_TEXT`, `TONE_FILL`, `TONE_BORDER` y `TONE_CHIP`, pensados
  para papel. La letra de color usa las variantes `tv-blue-ink`,
  `tv-green-ink` y `tv-amber-ink`, que se leen en letra pequeña.
- **Escala:** `bandForValue(valor)` da el tramo (`top`, `high`, `mid`, `low`),
  cortando sobre el número ya redondeado. Se pinta con `RATING_FILL` (barras,
  cajas), `RATING_STROKE` (trazos de SVG; no para letra sobre papel) y
  `RATING_CHIP` (una cifra en su cajita de color). `toneForLevel()` sale de
  aquí: bien desde 70, ojo de 60 a 69, mal por debajo.

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
| 1    | Kit en la piel nueva: panel, botón, pestañas, anillo y estrellas, caja de cifra, `.data-table`, tonos de cuatro tramos; piezas nuevas (chip de puesto, moral, nombre de jugador, selector, paginador, lista clave-valor, modal); `Broadcast*` al kit; `#/estilo` | Hecha     |
| 2    | Marco: cabecera con CONTINUAR, barra de iconos, barra de sección con pestañas, barra de acciones, aviso de avance de días                                                                                                                                        | Hecha     |
| 3    | Pantallas de más uso: inicio, plantilla, ficha del jugador, alineación, competición                                                                                                                                                                              | Hecha     |
| 4    | Resto del juego: entrenamiento y cuerpo técnico, cantera, estadísticas, mercado, finanzas, correo y ruedas de prensa, historial, selecciones, cuadros                                                                                                            | Hecha     |
| 5    | Pantallas nuevas: calendario mensual, ficha del rival, ranking de entrenadores                                                                                                                                                                                   | Pendiente |
| 6    | Fuera de la partida y limpieza: menú, asistente de nueva partida, partidas, ajustes, editor; retirar `court-*` y `ball-*`                                                                                                                                        | Hecha     |

**De golpe, no por variantes** (decisión del usuario). Las piezas del kit
cambian de aspecto directamente, sin convivir con la piel vieja, y las fases 1 a
4 —kit, marco y todas las pantallas del juego— se entregan juntas: a mitad de
camino la aplicación no se ve bien, así que no se da por buena ninguna fase
suelta. Así no queda código de transición que luego haya que borrar.

Las fases 3, 4 y 6 se hicieron a la vez el 2026-09-17, por pantallas en
paralelo, y se integraron al final: el arnés se adaptó al asistente, al selector
de competición y a la barra de acciones; `FormInput` y `EditorInput` se
cambiaron por `AppInput`; las estrellas pasaron a `toStars()`; `.data-table`,
a la capa `components`; y se quitaron los tokens `court-*`, `ball-*`,
`line-500` y `good`/`warn`/`bad`, que ya no usaba nadie. Queda la fase 5.

## Cómo no se pudre

`#/estilo` es una ruta de verdad y el arnés (`pnpm verify:app`) le hace una
captura en cada pasada. Si alguien rompe un botón, se ve ahí antes que en la
pantalla donde esté escondido.

No está enlazada desde el juego a propósito: al jugador no le sirve de nada.
