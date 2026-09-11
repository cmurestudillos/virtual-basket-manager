# Sistema de diseño

Lo que se ve y con qué se monta. Vive en `src/renderer/src/shared/ui/` y se
mira entero abriendo el juego en **`#/estilo`**.

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

## Los colores

La paleta está en `src/renderer/src/assets/main.css`, declarada con `@theme` de
Tailwind 4 para que sean utilidades (`bg-court-900`) y no cadenas sueltas.

- **`court-*`**: los grises azulados del fondo, de `950` (el fondo de la
  ventana) a `100` (el texto). Es una pista de noche.
- **`ball-*`**: el naranja de balón. Es el acento, y sólo el acento: marca lo
  tuyo —tu equipo en una tabla, la pestaña activa, el botón principal—. Si se
  usa para todo deja de significar nada.
- **`good` / `warn` / `bad`**: los tres tonos con los que el juego dice si algo
  va bien o va mal.

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

`toneForLevel()` traduce un 0-100 en el que más es mejor —forma, moral,
confianza— y `toneForDelta()` una diferencia. Se usan en vez de repetir el corte
a mano para que el jugador aprenda a leer el color **una vez** y le valga para
todas las pantallas: si en una 70 es verde y en otra es amarillo, el color deja
de ser información.

## Las piezas

| Componente        | Para qué                                                              |
| ----------------- | --------------------------------------------------------------------- |
| `AppPageHeader`   | Título de pantalla y, a su lado, el dato que dice dónde estás         |
| `AppPanel`        | La caja con borde; `scroll` para tablas largas, `flush` sin relleno   |
| `AppSectionTitle` | El apartado dentro de una pantalla                                    |
| `AppStat`         | Una cifra con su etiqueta arriba y su letra pequeña debajo            |
| `AppButton`       | `primary`, `secondary`, `ghost`, `danger` × `sm`, `md`, `lg`          |
| `AppTabs`         | `underline` dentro de una pantalla, `pills` para elegir entre iguales |
| `AppMeter`        | Barra de 0 a 100 con su número                                        |
| `AppBadge`        | Etiqueta pequeña con tono                                             |
| `AppField`        | Etiqueta, control y explicación                                       |
| `AppEmpty`        | Lo que se enseña cuando todavía no hay nada                           |
| `AppRing`         | El mismo 0-100 en anillo, para cuando van dos o tres juntos           |
| `AppStars`        | Categoría en estrellas: pabellón, reputación, cantera                 |
| `AppSegmented`    | Dos o tres opciones excluyentes, todas a la vista                     |
| `AppScale`        | Deslizador con los extremos con nombre                                |

Fuera del kit quedan dos cosas a propósito:

- **`.data-table`**, en `main.css`. Es CSS y no componente porque una tabla de
  datos cambia demasiado de una pantalla a otra —columnas, celdas con enlace,
  filas con color— y envolverla en un componente obligaría a un `slot` por
  columna. La clase da lo que sí es común: cabecera pegada, altura de fila y
  cifras alineadas a la derecha con `numeric`.
- **`SeriesCard`**, en la feature de competición. Se comparte entre el cuadro
  nacional y el europeo, pero sabe de eliminatorias: eso es dominio del juego,
  no del kit.

### Lo que se trajo de International Basketball Manager

Cuatro de las piezas de arriba salen de mirar las capturas de IBM 23, y las
cuatro resuelven algo que el kit no resolvía:

- **`AppRing`** — IBM enseña las tres confianzas (directiva, afición,
  jugadores) en anillos, no en barras. Tres barras seguidas parecen un
  ecualizador; tres anillos se leen de un vistazo y de lejos.
- **`AppStars`** — la categoría del pabellón y la reputación del club van en
  estrellas. Un número dice _cuánto_; cinco estrellas dicen _de qué clase_, que
  es lo que se pregunta uno al mirar si le llega el pabellón para la Euroliga.
- **`AppSegmented`** — «1 vs 1 / Zonas» es un interruptor, no un desplegable:
  las opciones se ven todas y se prueban de una pulsada.
- **`AppScale`** — su deslizador de agresividad va rotulado «Bajo · Medio ·
  Alto». Un 1-10 pelado no dice nada; lo que decide un entrenador no es
  «siete», es «más agresivo que lo normal».

Lo que **no** se copió es el aspecto: IBM va de cromo morado con paneles
blancos y marcas reales. Nuestra piel es la que ya tenía el proyecto.

## Reglas

1. **Una pantalla nueva no escribe clases de borde, relleno ni color de estado.**
   Si hace falta algo que el kit no da, se añade al kit.
2. **El naranja marca lo tuyo.** Nunca decora.
3. **Las cifras llevan ancho fijo** (`numeric` en tabla, `figure` suelto): un
   marcador que pasa de 99 a 100 no debe dar un salto en pantalla.
4. **Nunca una pantalla en blanco.** Si no hay datos, `AppEmpty` cuenta por qué
   y cuándo los habrá.
5. **La guía manda.** Si algo se ve raro en `#/estilo`, está roto en todas
   partes.

## Cómo no se pudre

`#/estilo` es una ruta de verdad y el arnés (`pnpm verify:app`) le hace una
captura en cada pasada. Si alguien rompe un botón, se ve ahí antes que en la
pantalla donde esté escondido.

No está enlazada desde el juego a propósito: al jugador no le sirve de nada.
