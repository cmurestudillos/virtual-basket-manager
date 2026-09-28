# Dataset real y edición privada

El juego que se distribuye usa un **mundo inventado** (`resources/seed-data`):
clubes, jugadores y ligas generados, sin marcas ni personas reales. Existe
además una **edición privada** con las ligas y los jugadores de verdad, sólo
para el PC del autor. Esto explica cómo están separadas y cómo se trabaja con
ellas.

## Las dos ediciones

|                  | Pública                        | Privada                                  |
| ---------------- | ------------------------------ | ---------------------------------------- |
| Dataset          | `resources/seed-data` (en git) | `resources/real-data` (**fuera de git**) |
| Construir        | `pnpm build:win`               | `pnpm build:win:private`                 |
| Desarrollo       | `pnpm dev`                     | `pnpm dev:real`                          |
| Configuración    | `electron-builder.yml`         | `electron-builder.private.yml`           |
| Instalador       | `release/`                     | `release-private/` (ignorada en git)     |
| `appId`          | `com.triplemanager.desktop`    | `com.triplemanager.desktop.private`      |
| Carpeta de datos | `%APPDATA%\triple-manager`     | `%APPDATA%\Triple Manager (privado)`     |
| Actualizaciones  | GitHub Releases                | ninguna: se reconstruye a mano           |

El código es **el mismo** en las dos. Lo único que cambia es qué dataset se mete
en el paquete y una marca (`tripleManagerEdition: private`) que el build privado
añade a su `package.json`. Todo lo que depende de la edición pregunta a
`src/main/config/edition.ts`; en desarrollo la marca es la variable
`TM_DATASET=real`, que pone `pnpm dev:real`.

### Por qué el real no está en git

El repositorio tiene que ser **público** para que funcionen las actualizaciones
automáticas (ver `DISTRIBUCION.md`), y un dataset con personas reales no puede
publicarse. Por eso `resources/real-data` está en `.gitignore` y se guarda con
copias de seguridad propias.

### Lo que se aprendió del proyecto de fútbol

DerbiManager tiene el mismo esquema y dos fallos que aquí se evitan a propósito:

1. **Las dos ediciones compartían carpeta de datos**, así que una partida creada
   con datos reales aparecía en la pública. Aquí el build privado cambia el
   `name` empaquetado, que es lo que decide la carpeta de `%APPDATA%`.
2. **Nada impedía que el dataset real acabara en la pública.** Aquí lo vigilan
   los tests de `src/main/config/tests/edition.test.ts`:
   - la configuración pública sólo empaqueta `seed-data` y nunca `real-data`;
   - la privada empaqueta `real-data`, cambia el `name`, no publica y sale a
     `release-private`;
   - `resources/real-data` y `release-private` están en `.gitignore`;
   - y, si el dataset real está presente, que **ningún club ni jugador real**
     (nombre y fecha de nacimiento) aparezca en el ficticio.

## Copias de seguridad

```
pnpm dataset:backup     # resources/real-data → carpeta de copias
pnpm dataset:verify     # la copia está entera y coincide con lo actual
pnpm dataset:restore    # carpeta de copias → resources/real-data
```

La carpeta de copias es `--dir <ruta>`, la variable `TM_REAL_DATA_BACKUP` o, si
no hay ninguna, `../triple-manager-real-data-backup`, al lado del repositorio.
Cada copia lleva un `manifest.json` con el SHA-256 de cada fichero:

- `backup` comprueba la copia nada más hacerla.
- `verify` sale con código 1 si la copia está dañada y con 2 si está íntegra
  pero se ha quedado atrás.
- `restore` se niega a restaurar una copia dañada y a pisar datos distintos sin
  `--force`.

En un clon nuevo no hay dataset real: `pnpm build:win:private` y `pnpm dev:real`
lo detectan antes de empezar y dicen cómo recuperarlo.

## De dónde salen los datos

Se extraen de webs públicas con scripts propios y se convierten al mismo formato
de `dataset.json` que el ficticio (estadísticas → los 21 atributos). Orden
decidido: **España primero (ACB y Primera FEB)**, después **Italia (Serie A)**,
**Francia (Betclic ÉLITE y ÉLITE 2)**, **Grecia (GBL y Elite League)**,
**Turquía (Basketbol Süper Ligi)**, **Alemania (BBL y ProA)**, **Israel (Ligat
Winner)**, **Lituania (LKL y NKL)**, la **Liga Adriática (ABA y ABA2)**, la
**BNXT (Bélgica y Países Bajos)** y así país a país.

```
pnpm real:acb     # Liga Endesa        → .real-data-cache/sources/acb-2025.json
pnpm real:feb     # Primera FEB        → .real-data-cache/sources/feb-2025.json
pnpm real:feb2    # Segunda FEB (Este) → .real-data-cache/sources/feb2-este-2025.json
pnpm real:lba     # Serie A italiana   → .real-data-cache/sources/lba-2025.json
pnpm real:lnp     # Serie A2 italiana  → .real-data-cache/sources/lnp-a2-2025.json
pnpm real:lnb     # ÉLITE y ÉLITE 2    → .real-data-cache/sources/lnb-elite-2025.json
                  #                      y lnb-elite2-2025.json
pnpm real:esake   # Stoiximan GBL      → .real-data-cache/sources/esake-gbl-2025.json
pnpm real:hbf     # Elite League       → .real-data-cache/sources/hbf-elite-2025.json
pnpm real:tblstat # Süper Ligi turca   → .real-data-cache/sources/tblstat-bsl-2025.json
pnpm real:bbl     # BBL y ProA         → .real-data-cache/sources/bbl-2025.json
                  #                      y proa-2025.json
pnpm real:winner  # Ligat Winner       → .real-data-cache/sources/winner-2025.json
pnpm real:lkl     # LKL y NKL          → .real-data-cache/sources/lkl-2025.json
                  #                      y nkl-2025.json
pnpm real:aba     # ABA y ABA2         → .real-data-cache/sources/aba-2025.json
                  #                      y aba2-2025.json
pnpm real:bnxt    # BNXT League        → .real-data-cache/sources/bnxt-2025.json
pnpm real:build   # todas las ligas extraídas → resources/real-data/dataset.json
```

Todo es de la **temporada 2025-26**. Los países sin liga real siguen con el mundo
inventado.

### Fuentes

| Liga (id en el juego)         | Web                        | Cómo se lee                                                                                                                                          |
| ----------------------------- | -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Liga Endesa (`liga-nacional`) | `acb.com`                  | Los datos que Next.js incrusta en el HTML (`self.__next_f`), con `editionId=90`. Clasificación, plantilla, estadísticas de liga regular y ficha.     |
| Primera FEB (`liga-plata`)    | `baloncestoenvivo.feb.es`  | ASP.NET: calendario, clasificación de liga regular y estadísticas acumuladas por _postback_. Dos segundos entre peticiones.                          |
| Segunda FEB, grupo Este       | `baloncestoenvivo.feb.es`  | Igual que la Primera (`feb-extract.ts`), con la fase «Liga Regular "ESTE"». Sólo entra un equipo, en `liga-plata` (ver «Equipos invitados»).         |
| Serie A (`italia-1`)          | `legabasket.it`            | La API JSON de su web (`/api`). Equipos del año, plantilla, club, estadísticas de liga regular, calendario y actas. Un segundo entre peticiones.     |
| Serie A2 italiana             | `legapallacanestro.com`    | JSON de `lnpstat.domino.it` (clasificación, calendario) y Drupal (estadísticas por Ajax, ficha). Sólo entra un equipo, en `italia-1`.                |
| Betclic ÉLITE (`francia-1`)   | `lnb.fr` + Sportradar      | API JSON de la LNB (`api-prod.lnb.fr`, con token) y actas del widget de Sportradar del «match center». Ver «Francia».                                |
| ÉLITE 2 (`francia-2`)         | `lnb.fr` + Sportradar      | Igual. Sus dos ascendidos juegan en `francia-1` (ver «Equipos invitados»).                                                                           |
| Stoiximan GBL (`grecia-1`)    | `esake.gr` + b-reference   | HTML de esake: clasificación, plantillas y las actas de las 26 jornadas. Los nombres en latino, de basketball-reference (una página). Ver «Grecia».  |
| Elite League (`grecia-2`)     | `stats.basket.gr`          | HTML de la federación (sportstats): plantillas y actas de liga regular sin el Trikala. Su campeón juega en `grecia-1` (ver «Equipos invitados»).     |
| Süper Ligi (`turquia-1`)      | `tblstat.net` + b-ref      | HTML de una web de aficionado: plantillas y las actas de las 30 jornadas; rebotes, tapones, faltas y puestos de basketball-reference. Ver «Turquía». |
| easyCredit BBL (`alemania-1`) | `easycredit-bbl.de`        | El JSON que Next.js incrusta en el HTML (`__NEXT_DATA__`): plantilla del equipo en la temporada y las 306 actas de liga regular. Ver «Alemania».     |
| ProA (`alemania-2`)           | `2basketballbundesliga.de` | WordPress con formulario de temporada: plantilla, cuerpo técnico y estadísticas de liga regular de cada equipo. Entran 16 de 18. Ver «Alemania».     |
| Ligat Winner (`israel-1`)     | `basket.co.il`             | ASP clásico en inglés: clasificación, plantillas, las 182 actas de liga regular (sin el playout) y la ficha de cada jugador. Entran 12 de 14.        |
| LKL (`lituania-1`)            | `lkl.lt`                   | Laravel: clasificación, las 144 actas de liga regular en JSON, plantillas por Livewire, ficha e historial de cada jugador. 9 + 3 de la NKL.          |
| NKL (`lituania-2`)            | `nkl.lt` + basketnews.lt   | Calendario de nkl.lt y actas y fichas de basketnews.lt (mismos ids). Sólo la primera fase. Suben 3 a la LKL y 2 no entran: 12 de 17.                 |
| ABA League (`adriatica-1`)    | `aba-liga.com`             | HTML: clasificación por fases, las 144 actas de la fase de grupos y la plantilla de cada club. Entran 16 de 18 (fuera Cluj y Vienna).                |
| ABA League 2 (`adriatica-2`)  | `druga.aba-liga.com`       | La misma aplicación: las 64 actas de liga (8 por club) y las plantillas. Entran 14 de 16 (fuera los dos macedonios).                                 |
| BNXT League (`bnxt-1`)        | `bnxtleague.com`           | La API JSON de su web (sportpress): clasificación, calendarios, las 306 actas de liga regular y las plantillas. Entran los 18.                       |

- Cada extractor sólo lee su web y deja los datos **tal cual** en un formato
  común (`scripts/real-data/lib/source-types.ts`). Lo único que retoca es el
  nombre de la FEB, que da el legal completo: se queda el nombre de pila de uso
  («Philip Alexander» → «Philip», pero «José María» entero). De los entrenadores
  de acb.com se queda el nombre de uso que da la propia web.
- Todo lo descargado se guarda en `.real-data-cache/http` (fuera de git) y no se
  vuelve a pedir; `--force` lo descarga de nuevo.

#### Serie A (legabasket.it)

- **Equipos**: `/teams/get-teams?year=2025` da los **15** de la 2025-26: uno fue
  excluido a mitad de temporada y sus partidos se anularon (28 jornadas de liga
  regular). La plaza 16.ª del juego es para el campeón de la A2 (ver «Equipos
  invitados»).
- **Plantilla** (`/teams/get-team-roster`): es la del final de la temporada, con
  el puesto final de la liga regular (`rnk_sum.r_s.pos`). Quien se fue a mitad
  sólo sale en las estadísticas y su ficha (`/players/get-player-by-id`) es la de
  hoy: de ella se toman nacimiento, país, altura y puesto, pero el dorsal y el
  cupo sólo si la ficha es de la 2025-26. Quien se fue sin jugar no entra.
- **Estadísticas**: `/teams/get-team-players-stats` con `s=2025&cs_id=1&ct_id=4`
  (Serie A, liga regular); sin esos parámetros la API da la temporada en curso.
  Los minutos vienen enteros; los puntos de cada equipo cuadran con los de su
  calendario. Trae titularidades, mates, tapones recibidos y la valoración de la
  Lega.
- **País**: los jugadores traen el código ISO (`DNK`, `HRV`, `NGA`), que se
  traduce al del COI **probando antes el ISO** (`nationFromIso3`).
- **Puestos**: Playmaker y Play/Guardia → base; Guardia y Guardia/Ala → escolta;
  Ala/Centro → ala-pívot; Centro → pívot. «Ala» es alero o ala-pívot, que la LBA
  no distingue: desde 205 cm, ala-pívot (`POWER_FORWARD_CM`). Los canteranos
  vienen con «-» y sin altura: sin puesto.
- **Ciudad**: la de la sede del club (`company_town_name`) y, si no hay, la del
  pabellón. El pabellón de algunos clubes está en otro municipio (Mestre,
  Villorba, Desio…) y así el club conserva su ciudad. Un club tiene la sede
  fuera de su ciudad y va a mano en `CLUB_CITIES`.
- La copa del país toma su nombre real: **Coppa Italia**.

#### Francia (lnb.fr y Sportradar)

`pnpm real:lnb` extrae las dos ligas y deja `lnb-elite-2025.json`
(`francia-1`) y `lnb-elite2-2025.json` (`francia-2`).

- **API de la LNB** (`api-prod.lnb.fr`, la de su web): pide un token que da
  `lnb.fr/api/token` y caduca a los quince minutos. `LnbApi` lo renueva solo
  (y otra vez si la API contesta 401); las cabeceras no forman parte de la
  clave de caché de `lib/http.ts`, que ahora admite cuerpos JSON. Ojo:
  `www.lnb.fr` redirige a la portada, hay que usar `lnb.fr`.
  - `competition/getDivisionCompetitionByYear?year=2025`: la liga regular es la
    de abreviatura PROA o PROB con filtro GENERAL (302 y 303); de ahí sale el
    `season_id` para Sportradar.
  - `altrstats/getStandingByCompetition` (POST): la **clasificación oficial**,
    con las sanciones ya descontadas (Monaco y Le Portel, −1 victoria; Aix-
    Maurienne, un partido dado por perdido). Se usa tal cual.
  - `teams/getRoster`: todos los que pasaron por el club, también los que se
    fueron; `person/getPersonDetail` (POST, una por jugador): peso, altura y
    fechas de alta y baja en el club.
  - `altrstats/getCoachingStaff` (POST): los primeros entrenadores con fechas.
  - `match/getMatchDetails/<uuid>`: el pabellón como «Pabellón (Ciudad)».
- **Actas de Sportradar** (`embed-api.eui.connect.sportradar.com/v1/embed/12`,
  el widget del «match center» de la LNB), sin token: `fixtures?state=…` da
  los partidos de la liga regular y `fixture_detail?fixtureId=…` el acta de
  cada uno; las estadísticas son **la suma de las actas** (titularidades,
  minutos, tiros, rebotes, tapones recibidos, faltas y la «évaluation»). La API
  de la LNB sólo da totales de los jugadores con partidos suficientes. De la
  tabla `statistics_persons` se toman los mates y las faltas recibidas. El
  `state` es el JSON de la temporada comprimido con zlib en base64 de URL
  (`widgetState`). Es **lento**: dos o tres segundos por acta, 620 actas, una
  media hora la primera vez.
- Los UUID de persona y equipo de Sportradar son los `person_id`/`team_id` de
  la LNB, pero la plantilla sólo trae el id numérico: jugador y acta se cruzan
  **por nombre dentro del equipo** (casan todos menos tres canteranos de tres
  partidos, que entran sin ficha y se avisa).
- Un par de actas no cuadran con el tanteo (uno a seis puntos) y alguna sale
  con seis titulares: se avisa y se usan. El Quimper–Aix-Maurienne del
  11-11-2025 está 0-0 en el calendario (dado por ganado) pero se jugó: **sus
  estadísticas cuentan**.
- **Puestos**: «1 - Meneur» … «5 - Pivot»; con dos («2/3 - Arrière/Ailier»)
  cuenta **el primero**, el principal, salvo «3/4» (alero o ala-pívot), que se
  separa por altura como el «Ala» de la LBA: desde 205 cm (`POWER_FORWARD_CM`),
  ala-pívot. Sin puesto, el montaje lo deduce por la altura. El cupo (JFL…) no
  lo publica la LNB: `null`.
- **Nombres**: la LNB sólo da el corto («Paris», «Chalon/Saône»); el nombre
  completo del club va en `CLUB_NAMES` (`lnb.ts`), como los de España e
  Italia («Paris Basketball», «Élan Chalon»). El corto sigue sirviendo para
  cruzar datos (pabellones).
- **Bajas**: quien se fue a mitad sin jugar no entra (baja anterior al último
  partido de la liga); una baja anterior al alta (la LNB pone `2025-06-30` a
  fichajes de invierno) no dice nada. Quien cambió de club dentro de la liga
  sale en los dos y el montaje le deja donde más minutos jugó.
- **Pabellón y aforo**: el pabellón donde más partidos jugó en casa; la LNB no
  da aforos, así que van a mano en `resources/real-data/manual/lnb-pabellones.json`
  (por nombre de equipo de la LNB, con aforo, nombre del pabellón, ciudad del
  club y fuente de cada uno). Sin aforo, el montaje lo estima y se avisa.
- La copa del país toma su nombre real: **Coupe de France**.

#### Grecia (esake.gr, basketball-reference y la federación)

`pnpm real:esake` extrae la Stoiximan GBL (`grecia-1`) y `pnpm real:hbf` la
Elite League (`grecia-2`); dejan `esake-gbl-2025.json` y `hbf-elite-2025.json`.

- **esake.gr** (la web de la GBL) es HTML de servidor sin API, con ids de
  ocho cifras hexadecimales. La temporada es `idchampionship=44B80BEB` y la liga
  regular, `idseason=00000001`. Un segundo entre peticiones; la primera vez, unas
  doscientas peticiones y seis o siete minutos.
  - **Equipos**: la clasificación tras la última jornada
    (`EsakeRanking?…&day=26-1`): **13** equipos, 24 partidos cada uno.
  - **Plantilla**: `EsakePlayers?idchampionship=…&idteam=…`, con fecha, altura,
    puesto (PG…C) y país **en griego** («ΗΠΑ»), que se traduce con la tabla de
    `lib/greek.ts`. El «equipo» de cada ficha es el de hoy, no se usa. Quien
    jugó y ya no está en esa lista (se fue a mitad) sale de su página de jugador.
  - **Estadísticas**: la suma de las **actas** de las 26 jornadas
    (`EsakeResults?…&series=<jornada>` y `EsakegameView?idgame=…&mode=3`), con
    los minutos al segundo, tapones recibidos y faltas recibidas. esake no marca
    titulares ni mates. En el acta, «FOULS F» son las faltas **recibidas** y
    «FOULS M» las cometidas; el equipo es el de la cabecera de cada tabla (el de
    los enlaces de los jugadores está mal).
  - **Nombres**: esake escribe muchos en griego, también los de los extranjeros
    («ΣΜΙΘΕΡΣΟΝ»), y esa transcripción no se puede deshacer. Además mete letras
    latinas en palabras griegas («ΜAΡΛΟΟΥ», con la A latina), que se pasan a
    griegas antes de transliterar. Los **extranjeros** toman el nombre de la tabla
    de totales de basketball-reference
    (`/international/greek-basket-league/2026_totals.html`, una sola petición;
    esa web corta a quien pasa de unas veinte por minuto), emparejados dentro de
    cada equipo por estadísticas (partidos, puntos, rebotes, asistencias…). Los
    **griegos** se transliteran con **ELOT 743** (la del pasaporte: «mp», «nt»,
    «gk»). Los nacionalizados con nombre de fuera y los extranjeros que no casan
    van a mano en `resources/real-data/manual/esake-nombres.json`.
  - **Club**: nombre sin patrocinador, ciudad y pabellón con aforo de la
    Wikipedia inglesa de la temporada, en `TEAMS` (`esake.ts`).
- **stats.basket.gr** (la federación; proveedor sportstats.gr) es ASP.NET con
  ids GUID. La Elite League 2025-26 tuvo 16 inscritos, pero el **Trikala** se
  retiró y sus partidos se anularon: **15** equipos a doble vuelta, 28 partidos.
  - **Estadísticas**: la suma de las actas de liga regular: los partidos de
    todos los equipos (`teamdetails`) menos los de la fase final
    (`games-playoffs-playouts`) y los del Trikala. Los totales de la ficha del
    equipo no valen: cuentan los partidos anulados. El acta va dentro de un
    `loadDoc("<table…>", "statistics1")` de JavaScript y trae titulares, minutos
    al segundo, faltas recibidas y el entrenador de cada equipo; no trae tapones
    recibidos ni mates.
  - **Plantilla** (en la ficha del equipo): nombre legal con el apellido
    delante, patronímico, puesto en griego («Σεντερ», «Φοργουορντ»), altura
    (muchas vacías) y fecha. **No hay nacionalidad**: los que vienen en latino son
    los extranjeros y la suya va a mano en `hbf-jugadores.json` (`jugadores`, por
    id de la federación, con el nombre de uso bien partido); los que vienen en
    griego son griegos, y su nombre legal se cambia por el de uso («Ioannis» →
    «Giannis») con la lista `habituales` del mismo fichero.
  - **Pabellón**: el de más partidos en casa según las actas, transliterado, o el
    de `hbf-entrenadores.json` (`pabellones`) si está; sin aforo publicado, lo
    estima el montaje.
- **Puestos**: esake da PG/SG/SF/PF/C. La federación, el nombre inglés con
  letras griegas: «Πλειμακερ» y «Ποιντ Γκαρντ» son base, «Γκαρντ» escolta y
  «Φοργουορντ» (forward) se separa por altura como el «Ala» de la LBA: desde
  `POWER_FORWARD_CM`, ala-pívot.
- Una fecha de nacimiento imposible (la del alta de algunos canteranos) se
  descarta y se avisa (`plausibleBirthDate`).
- La copa del país toma su nombre real: **Kýpello Elládos**.

#### Turquía (tblstat.net y basketball-reference)

`pnpm real:tblstat` extrae la Basketbol Süper Ligi (`turquia-1`) y deja
`tblstat-bsl-2025.json`. La 2025-26 tuvo **16** equipos, los mismos que la liga
del juego: no hace falta ningún ascendido.

- La web oficial (`tbf.org.tr`) está tras la comprobación anti-robots de
  Cloudflare y no se puede leer ni con un navegador automatizado.
- **tblstat.net**, una web de estadísticas de aficionado, es HTML de servidor
  sin API; la temporada es `2526`. Un segundo y medio entre peticiones; la
  primera vez, unas 260 peticiones.
  - **Equipos**: `standings/2526`, la clasificación de la liga regular.
  - **Plantilla**: `team/<id>/2526`, con fecha de nacimiento, altura en metros
    (falta en uno de cada cuatro) y nacionalidad por la bandera (código ISO de
    dos letras). Tres listas: plantilla, canteranos («Youth Team Players», que
    sólo entran si jugaron) y bajas; y las filas «Head Coach» de todos los
    entrenadores de la temporada. Los partidos y medias de esa página incluyen
    los playoffs: no se usan. Quien jugó y no sale en ninguna lista, de su
    ficha (`player/<id>/2526`).
  - **Estadísticas**: la suma de las **actas** de liga regular, que son los
    partidos `game/60001` a `game/60240` (los siguientes, de playoffs; se
    comprueba la fase de cada una y que cada club tenga 30). Minutos al
    segundo, puntos, tiros, rebote total, asistencias, robos, pérdidas y
    valoración. No traen rebotes de ataque y defensa, tapones, faltas ni
    titulares; titulares, tapones recibidos, faltas recibidas y mates quedan
    `null`.
  - **Nombres**: con su grafía (los turcos con ç, ğ, ı, ş; los extranjeros con
    la suya). Se parten por la última palabra (con sufijo y partículas: «Jr.»,
    «van der»), porque muchos turcos llevan dos nombres de pila. Los
    nacionalizados que tblstat escribe a la turca («-oviç») y los nombres que
    no se parten así van a mano en `resources/real-data/manual/tblstat-jugadores.json`.
- **basketball-reference**: la tabla de totales de liga regular
  (`/international/turkey-super-league/2026_totals.html`, una página, una fila
  por jugador y equipo) da **rebotes de ataque y defensa, tapones y faltas**;
  cada fila se empareja con los totales de tblstat del mismo equipo por
  estadísticas (`matchBbref`, como en Grecia), porque sus nombres son los
  legales y a veces sin tildes. Si los rebotes no suman lo mismo, el total de
  tblstat se reparte en la proporción de basketball-reference. De la ficha de
  cada jugador emparejado (`/international/players/<slug>.html`, una petición
  por jugador; 3,5 s entre peticiones porque esa web corta a quien pasa de unas
  veinte por minuto) salen el **puesto**, el peso y la altura que tblstat no
  tenga.
- **Puestos**: basketball-reference da casi siempre sólo «Guard», «Forward» o
  «Center». «Guard» se separa por altura: base hasta `POINT_GUARD_MAX_CM`
  (190), escolta por encima; «Forward», como el «Ala» de la LBA (ala-pívot
  desde `POWER_FORWARD_CM`). Sin ficha, el montaje lo deduce por la altura.
- **Club**: nombre sin patrocinador (tblstat da el comercial), ciudad y
  pabellón con aforo de la Wikipedia inglesa de la temporada, en `TEAMS`
  (`tblstat.ts`).
- La copa del país toma su nombre real: **Türkiye Kupası**.

#### Alemania (easycredit-bbl.de y 2basketballbundesliga.de)

`pnpm real:bbl` extrae las dos ligas y deja `bbl-2025.json` (`alemania-1`) y
`proa-2025.json` (`alemania-2`). Tres segundos entre peticiones en las dos webs;
la primera vez, unas 350 peticiones y veinte minutos (las páginas de la BBL
pesan casi un mega).

- **easyCredit BBL**: **18** equipos, como la liga del juego. La web es Next.js
  pintado en el servidor: cada página lleva sus datos en
  `<script id="__NEXT_DATA__">` (JSON), así que se lee sin su API (que pide
  clave y un secreto diario; no se usa). La temporada 2025-26 es `2025`.
  - **Equipo**: `/teams/<id>/2025` (sin el año da la temporada en curso), con la
    plantilla (fecha, altura en metros, peso, puesto `POINT_GUARD`…`CENTER`,
    nacionalidades en ISO de dos letras: la primera reconocida es la que
    cuenta), el pabellón principal con su **aforo oficial de esa temporada**
    (`seasonVenues`, `isMain`), la clasificación (`mainRoundStanding`) y el
    cuerpo técnico con fechas de nacimiento. Los totales de jugador de esa
    página **incluyen los playoffs**: no se usan.
  - **Estadísticas**: la suma de las **actas** de liga regular, los partidos
    `/spiele/2003986` a `/spiele/2004291` (306 seguidos; se comprueba que cada
    uno sea `MAIN_ROUND` de 2025, que cada club tenga 34 y que las victorias
    cuadren con la clasificación). Minutos al segundo, tiros, rebotes de ataque
    y defensa, asistencias, robos, pérdidas, tapones, faltas cometidas y
    recibidas, valoración y **titulares**. No hay tapones recibidos ni mates.
  - **Nombres**: los de uso («Nombre Apellido» ya partidos). La web quita las
    tildes a balcánicos, polacos y checos: van a mano, comprobadas en Wikidata,
    en `resources/real-data/manual/bbl-nombres.json` (por id de jugador de la
    BBL; también sirve para una nacionalidad, fecha o altura).
  - **Club**: nombre sin patrocinador puro, ciudad y nombre del pabellón en
    `BBL_TEAMS` (`bbl.ts`); se quedan las marcas que son del club («Telekom
    Baskets Bonn», «ratiopharm Ulm», «Science City Jena»), como «Anadolu Efes».
- **ProA**: la 2025-26 tuvo **18** equipos y la del juego tiene **16**. Se
  extrae entera (los atributos salen del percentil en su liga) y los dos que
  bajaron a la ProB, **Leverkusen y Münster**, no entran
  (`SourceLeague.excluded`): se valoran con los demás y el montaje los deja
  fuera, con la reputación repartida entre los 16.
  - **Plantilla** (`/teams/kader/<id>`, por POST con `season=2025/2026`; sin él
    da la temporada en curso): cuerpo técnico (`#trainer`: nombre, fecha,
    función y bandera), jugadores (`#kader`: dorsal, nombre, fecha, altura,
    peso, puesto PG…C y bandera ISO; el «*» de los formados en Alemania se
    quita, y el personal médico se descarta por el puesto), las
    **estadísticas de liga regular** (`#stats`, «Hauptrunde»: minutos al
    segundo, tiros, rebotes de ataque y defensa, asistencias, robos, pérdidas,
    tapones, faltas y valoración; **sin titulares ni faltas recibidas**) y el
    calendario, con el que se comprueban las victorias de cada club. Quien jugó
    y ya no está en la plantilla sale de su ficha
    (`/teams/kader/spieler/<id>`, con el país en alemán).
  - **Nombres**: la ProA da el nombre de pila **legal** entero («Nombre Segundo
    Apellido»): se queda el primero y las excepciones van en
    `resources/real-data/manual/proa-nombres.json` (por id de persona).
  - **Clasificación**: la web sólo publica la de la temporada en curso; el
    orden, con sus desempates, es el de la Wikipedia alemana («ProA 2025/26»)
    y va fijo en `PROA_TEAMS` (`bbl.ts`) con las victorias de cada uno, que se
    comparan con el calendario. Ahí van también el nombre sin patrocinador,
    la ciudad y el pabellón con su aforo (de esa misma Wikipedia; la web de la
    ProA no los da).
  - La tabla «topperformer» de la ProA pone a cada jugador en su equipo
    **actual**, no en el de la temporada: no se usa.
- La copa del país toma su nombre real: **BBL-Pokal**.

#### Israel (basket.co.il)

`pnpm real:winner` deja `winner-2025.json` (`israel-1`). Tres segundos entre
peticiones; la primera vez, unas 520 peticiones y media hora. La web oficial
de la liga tiene la versión inglesa entera (`&lang=en`); es HTML de servidor
sin API, detrás de Cloudflare pero sin desafío. La temporada 2025-26 es
`cYear=2026`.

- **Formato real**: **14** equipos, 26 jornadas (182 partidos). La liga se
  paró en marzo por la guerra y volvió en abril, con partidos en sedes neutrales
  y jornadas desordenadas. Después, playoffs a 8 (sin el play-in, suprimido) y
  un **playout** de los cuatro últimos (seis partidos más cada uno) que la web
  suma a su «liga regular». La del juego tiene **12**: los dos que bajaron a la
  Liga Leumit, **Elitzur Netanya y Maccabi Ra'anana** (también los dos últimos
  de la liga regular), se valoran con los demás y no entran
  (`SourceLeague.excluded`, como la ProA).
- **Clasificación**: `table.asp?cYear=2026&lang=en`, con el `TeamId` de cada club
  **en esa temporada** (cambian cada año). Del 11.º al 14.º el balance ya lleva
  el playout; el orden es el mismo que al acabar la jornada 26.
- **Estadísticas**: la suma de las **actas** de liga regular,
  `game-zone.asp?GameId=26389` a `26570` (182 seguidas, siete por jornada; el
  playout va de 26610 a 26621 y no cuenta, para que todos tengan las mismas 26
  jornadas). Se comprueba que cada una sea de las jornadas 1-26, que cada club
  tenga 26 y que los puntos cuadren con el tanteo (que la web escribe
  «visitante:local») y, para los que no jugaron playout, las victorias con la
  clasificación. Minutos (redondeados al minuto), tiros, rebotes de ataque y
  defensa, asistencias, robos, pérdidas, tapones puestos y **recibidos**, faltas
  cometidas y recibidas, valoración y **titulares**. Sin mates. Los totales de
  la página del equipo y de la ficha incluyen el playout: no se usan.
- **Plantilla**: `team.asp?TeamId=<id>&lang=en`: dorsal, nombre y apellido,
  puesto, altura y fecha de nacimiento, en tres bloques (plantilla, inactivos y
  bajas; de los dos últimos entran sólo los que jugaron). También el pabellón y,
  a veces, su aforo («Places»). El «Head Coach» de esa página es el del final
  de temporada: no sirve.
- **Ficha** (`player.asp?PlayerId=<id>&lang=en`, una por jugador): la
  nacionalidad, o las dos, con su código **ISO** de tres letras (`DNK`, `USA`):
  cuenta la primera, pasada al código COI. Quien jugó y no está en ninguna
  lista del equipo sale de su ficha.
- **El `PlayerId` es del jugador en un equipo**, no de la persona: quien cambió
  de club tiene uno en cada uno. El extractor les da a todos el menor
  (`unifyTransferred`, por nombre y fecha) y el montaje le deja donde más
  minutos jugó.
- **Puestos**: la web sólo distingue `PG`, `G`, `G-F`, `F`, `F-C` y `C`: `G` es
  escolta, `G-F` alero, `F-C` ala-pívot y `F`, como en la LBA, alero o ala-pívot
  por altura (`POWER_FORWARD_CM`).
- **Nombres**: la transliteración oficial de la liga al inglés, que usa los
  nombres de uso. El apodo entre comillas se quita del nombre y una inicial en
  minúscula se corrige sola. Lo demás que la web da mal (erratas, canteranos sin
  nombre en inglés) va a mano en `resources/real-data/manual/winner-jugadores.json`
  (`jugadores`, por `PlayerId`; también sirve para fecha, nacionalidad, altura o
  puesto).
- **Club**: nombre sin patrocinador, abreviatura, ciudad y el **pabellón de
  casa** (no las sedes neutrales de la guerra) en `TEAMS` (`winner.ts`), según
  la Wikipedia inglesa de la temporada. El aforo es el oficial de la web cuando
  lo da y, si no, el de la Wikipedia.
- La copa del país se queda con su nombre, **Gvia HaMedina**.

#### Lituania (lkl.lt, nkl.lt y basketnews.lt)

`pnpm real:lkl` extrae las dos ligas a la vez, cada web con su pausa, y deja
`lkl-2025.json` (`lituania-1`) y `nkl-2025.json` (`lituania-2`). La primera
vez, unas 1.000 peticiones y media hora larga.

- **Formato real**: la LKL 2025-26 tuvo **9** equipos (se fueron Wolves y M
  Basket, entró Gargždai y no bajó nadie), cuatro vueltas, 32 jornadas y 144
  partidos; después, playoffs a 8. La del juego tiene **12**: suben los tres
  primeros de la NKL que no son filiales (**Sūduva, Vytis y Perlas**; también
  los tres mejores no filiales de sus playoffs) como ascendidos
  (`SourceLeague.promoted`, fijos en `lkl.ts`, `NKL_PROMOTED`), valorados con
  la NKL entera y su escala. La NKL tuvo **17**: de los 14 que quedan, los dos
  últimos (**Alytus**, que además desaparece, y **Stekas**) se quedan fuera
  (`SourceLeague.excluded`, `NKL_EXCLUDED`).
- **LKL (lkl.lt)**: Laravel con trozos de HTML y componentes Livewire, detrás
  de Cloudflare sin desafío. La 2025-26 es `season_id` 41936 (34 en la
  clasificación). Dos segundos entre peticiones.
  - **Clasificación**: `/loadStandings/34`, la primera tabla del trozo, con
    el `slug` de cada club. El id del club (que no cambia entre temporadas)
    va en `LKL_TEAMS`.
  - **Estadísticas**: la suma de las **actas en JSON**
    (`/api/livestream/boxscore/<id>`, de 11370 a 11513, seguidas). El lado de
    casa se reconoce por los puntos. Minutos con segundos, tiros, rebotes de
    ataque y defensa, asistencias, robos, pérdidas, tapones puestos y
    **recibidos**, faltas cometidas y **recibidas** y valoración. Sin mates.
    Las actas de las primeras semanas no marcan titulares: los partidos de
    titular salen del **historial** de cada jugador
    (`/zaidejai/get-player-history?player_id=<n>&cup_type=lkl-regular`, sólo
    liga regular), que además se compara con los partidos de las actas.
  - **Plantilla**: el componente Livewire `team-squad` de la página del club.
    Se carga perezoso: la página (para la sesión y el token CSRF), una
    llamada a `/livewire/update` que lo carga y otra que le cambia la
    temporada a la 2025-26; sólo se guarda la última. Dorsal, nombre, puesto,
    altura, peso, fecha y nacionalidad (código COI). No trae a los que se
    fueron a mitad: salen de su **ficha** (`/zaidejai/<slug>`), que también
    da el id numérico del historial y la nacionalidad como bandera (ISO de dos
    letras). El `slug` es el id del jugador.
  - **Puestos**: la web sólo da exterior (`Gynėjas`), alero o ala-pívot
    (`Puolėjas`) y pívot (`Centras`). El alero se separa por altura como el
    «Ala» de la LBA (`POWER_FORWARD_CM`) y el exterior también: por debajo de
    191 cm (`POINT_GUARD_BELOW_CM`, el mismo corte que usa el montaje para
    quien no trae puesto) es base; si no, la LKL entera se quedaría sin bases.
  - La **clasificación general** de la temporada y la tabla de estadísticas de
    la web suman los playoffs: no se usan. El entrenador que dan las actas es
    el **actual** del club, no el de ese partido: tampoco.
- **NKL**: nkl.lt (WordPress; su `robots.txt` pide **diez segundos** entre
  peticiones) da el **calendario** (`/matches/?type=results&season=2025`, un
  JSON por partido con su fase, `stage_id`) y la **clasificación** de la
  primera fase (`/turnyro-lentele/?fseason=2025&fstage=2639`). Sus actas no
  traen intentos de tiro ni faltas, así que las actas y las fichas son de
  **basketnews.lt** (tres segundos), con los mismos ids de partido, club y
  jugador.
  - **Liga regular**: sólo la **primera fase** (`stage_id` 2639: 17 equipos,
    todos contra todos dos veces, 272 partidos), la misma para todos. La
    segunda fase (por grupos desiguales), el minitorneo de los cuatro primeros
    y los playoffs no cuentan.
  - **Acta** (`/rungtynes/ziureti/<id>-x.html`): las columnas se leen por la
    cabecera, también el rebote, que va en una sola columna «REB D-O»
    (defensa-ataque) y cuyo orden se toma de ella. Titulares (el dorsal
    marcado), tapones y faltas recibidos y el **primer entrenador** de cada
    equipo en ese partido. Se comprueban equipos y puntos con el calendario.
  - **Ficha** (`/zaidejai/<id>-x.html`): puesto («SG, SF»: cuenta el
    primero), altura, peso, fecha y la nacionalidad por la **bandera** (ISO de
    dos letras) o, si no hay, por el nombre en lituano («Lietuvos», «JAV»;
    `nationFromLithuanian`). El nombre de pila y el apellido van separados
    por un espacio doble. Los extranjeros vienen con el **nombre legal
    completo**: se queda el primer nombre de pila (`usualFirstName`, como la
    ProA) y las excepciones van a mano.
  - Sólo entran los que jugaron en la primera fase (la NKL no tiene plantillas
    legibles de la temporada pasada).
- **Filiales y doble ficha**: Žalgiris-2, Rytas-2 y Neptūnas-2 juegan con
  canteranos que están también en la plantilla de su primer equipo. El
  montaje deja a cada uno **donde más minutos jugó** y le quita de la otra
  liga (ver «Conversión»).
- **Nombres**: los lituanos, tal cual, con sus diacríticos. Lo que falte
  (diacríticos de algún extranjero, nombres de uso) va a mano en
  `lkl-jugadores.json` y `nkl-jugadores.json` (`jugadores`, por `slug` en la
  LKL y por id en la NKL; también fecha, nacionalidad, altura o puesto).
- **Club**: nombre sin patrocinador (Jonava, Nevėžis, Sūduva, Vytis, Perlas…;
  Lietkabelis se queda: es la empresa dueña; los filiales con «-2»),
  abreviatura, ciudad, pabellón y aforo de la Wikipedia inglesa en
  `LKL_TEAMS` y `NKL_TEAMS`. El Rytas juega también en el Active Vilnius
  Arena, pero su pabellón es el Arena Vilnius (10.000).
- La copa del país toma su nombre real: **Karaliaus Mindaugo taurė** (KMT).

#### Liga Adriática (aba-liga.com)

`pnpm real:aba` extrae las dos ligas, una detrás de otra, y deja
`aba-2025.json` (`adriatica-1`) y `aba2-2025.json` (`adriatica-2`). Las dos webs
(`www.aba-liga.com` y `druga.aba-liga.com`) son la misma aplicación PHP, con
HTML de servidor, sin anti-robots; la temporada 2025-26 es `25` y la
competición, `1` (ABA) o `2` (ABA2). Un segundo y medio entre peticiones; la
primera vez, unas 250 peticiones y siete minutos.

- **Una liga, varios países**: en el juego la Adriática es un «país» propio
  (`ABA`) con clubes de Serbia, Croacia, Eslovenia, Montenegro y Bosnia, que no
  tienen liga nacional. La liga real es `country: 'ABA'` y cada club lleva el
  suyo en `SourceTeam.country` (SRB, CRO…), que es también la nacionalidad de
  reserva de sus jugadores y su entrenador (ver «Conversión»).
- **ABA, formato real**: **18** equipos en dos grupos de 9 a doble vuelta (16
  partidos, actas 1 a 144), después un **Top 8** y un **Play-out** que cruzan
  los grupos arrastrando el balance (24 y 26 partidos), play-in y playoffs.
  Campeón, Dubai Basketball; baja el Split. La del juego tiene **16**: las dos
  invitaciones de fuera de la región, **U-BT Cluj-Napoca** (Rumanía) y **BC
  Vienna** (Austria), se valoran con los demás y no entran
  (`SourceLeague.excluded`). **Dubai** (Emiratos, `UAE`) sí.
  - **Liga regular**: sólo la **fase de grupos** (actas 1-144), la misma para
    todos; el Top 8 y el Play-out no cuentan. El **puesto final** es el oficial
    tras la segunda fase: Top 8 del 1 al 8 y Play-out del 9 al 18.
- **ABA2**: **16** equipos, sin croatas; cada uno juega **sólo 8 partidos**
  (actas 1 a 64), contra rivales sorteados por bombos, y después playoffs, que
  no cuentan. La del juego tiene **14**: los dos de Macedonia del Norte (**MZT**
  y **TFT Skopje**), que no es de la liga del juego, no entran. Con 8 partidos
  las medias son ruidosas.
- **Clasificación** (`/standings/25/<comp>/`): una tabla por fase, con su
  título («Top 8…», «Play-out…», «Group A», «Regular Season…») y el id de cada
  club (el de la web, que no cambia entre temporadas ni entre las dos ligas).
  Las victorias de las actas se comparan con las de los grupos (ABA) o la
  tabla única (ABA2).
- **Estadísticas**: la suma de las **actas** (`/match/<id>/25/<comp>/Boxscore/`):
  minutos al segundo, tiros, rebotes de ataque y defensa, asistencias, robos,
  pérdidas, tapones puestos y **recibidos**, faltas cometidas y **recibidas**,
  valoración y **titulares** (un `*` detrás del nombre). Sin mates. Se
  comprueba que los puntos cuadren con el tanteo y que haya cinco titulares.
- **Plantilla** (`/team/<id>/25/<comp>/0/<slug>/`): la de **toda la
  temporada**, también los que se fueron: nombre completo, puesto, altura, fecha
  y nacionalidad en **ISO de tres letras** (`nationFromIso3`). Sin peso; el
  dorsal, del acta. El id de jugador es el de la persona en las dos ligas.
- **Puestos**: `Guard` base, `Shooting Guard` escolta, `Forward` alero,
  `Power Forward` ala-pívot y `Center` pívot.
- **Nombres**: los balcánicos, con sus diacríticos. Los estadounidenses vienen
  con el **nombre legal completo** («Khalil Umar Mubaarak Brantley»): el acta
  da el apellido con la inicial («Mubaarak Brantley K.»), que dice dónde
  empieza, y del nombre de pila se queda el primero (`usualFirstName`); sin
  acta, el apellido es la última palabra. Los sufijos se escriben igual («JR»
  → «Jr.»). Las excepciones (nombre de uso, dos apellidos, diacríticos que la
  web se come, una nacionalidad vacía) van a mano en `aba-jugadores.json`
  (`jugadores`, por id de la web, para las dos ligas).
- **Club**: nombre sin patrocinador, conservando las marcas que son del club
  (Cedevita Olimpija, U-BT Cluj-Napoca, Dubai Basketball), abreviatura del
  calendario, país, ciudad y pabellón con su aforo de la Wikipedia inglesa en
  `ABA_TEAMS` (`aba.ts`); en la ABA2, el pabellón de sus actas y sin aforo (lo
  estima el montaje), en `ABA2_TEAMS`.
- **Doble ficha**: Student Igokea es el filial del Igokea y hay fichajes entre
  las dos ligas; el montaje deja a cada persona donde más minutos jugó (ver
  «Conversión»).
- La copa toma su nombre real: **ABA Super Cup** («Supercup»).

#### BeNe (BNXT)

`pnpm real:bnxt` deja `bnxt-2025.json` (`bnxt-1`). Un segundo y medio entre
peticiones; la primera vez, unas 345 peticiones y nueve minutos.

- **Una liga, dos países**: la BNXT League es la liga conjunta de Bélgica y
  los Países Bajos. En el juego es un «país» propio (`BNL`) con las dos
  banderas, sin segunda división. La liga real es `country: 'BNL'` y cada
  club lleva el suyo (`BEL` o `NED`) en `SourceTeam.country`, que la API da
  (`club.name`, «Belgium» o «Netherlands»).
- **Formato real**: **18** equipos (10 belgas y 8 neerlandeses), los mismos
  que la liga del juego: entran todos. Liga regular conjunta a doble vuelta
  (34 partidos por club, 306 en total), cuyo primero es el campeón de la BNXT
  (Antwerp); después, unos playoffs de cada país por separado, que no cuentan.
  El **puesto final** es el de la liga regular.
- **La API**: bnxtleague.com es una aplicación de Vue que lee la API JSON de
  sportpress (`bnxt.sportpress.info/api/v1/`). Pide la cabecera
  `X-Authorization` con una clave pública que va escrita en el JavaScript de
  la web (si deja de valer, se copia de allí). La temporada es el año en que
  acaba (`2026` es la 2025-26), la competición `24` y la liga regular, la
  fase `169`. Sin anti-robots.
  - **Clasificación** (`standings/competition/24/phase/169`) y **equipos**
    (`competition-team/all?competition_id=24`): el id del equipo cambia cada
    temporada; el del club (`uu_team_id`) no, y es el que se usa como
    `sourceId` y en los ficheros a mano.
  - **Calendario** de cada equipo (`schedule/club/2026?…&competition_team_id=<id>&month=-1`):
    de la unión de los 18 salen los 306 partidos de la fase 169. Las victorias
    del calendario se comparan con la clasificación.
  - **Estadísticas**: la suma de las **actas** (`boxscore/game/24/<id>`):
    minutos (**enteros**), tiros, rebotes de ataque y defensa, asistencias,
    robos, pérdidas, tapones puestos y **recibidos**, faltas cometidas y
    **recibidas** (`defensive_foul`), valoración y **titulares**. Los mates
    vienen siempre a cero: no se usan. Se comprueba que los puntos cuadren con
    el tanteo y que haya cinco titulares. El Rotterdam–Den Helder del
    01-04-2026 (0-40) se dio por perdido y **no tiene acta**: cuenta en la
    clasificación, no en las estadísticas (esos dos clubes tienen 33 actas).
    Dos actas de Rotterdam no suman el tanteo (les falta un jugador): se avisa
    y se usan.
  - **Plantilla** (`roster/team-players/<id>`): la del **final**, sin los que
    se fueron: puesto, altura, peso, fecha y nacionalidad. Quien jugó y ya no
    está sale de su acta (nombre, fecha, nacionalidad y puesto) y, si está en
    la plantilla de otro equipo, de ella la altura.
- **El id de jugador es el de la persona**. Quien jugó en dos equipos de la
  liga (en la 2025-26, tres) se queda sólo en el que más minutos jugó; lo
  hace el extractor, porque a dos de ellos les falta la fecha y el montaje no
  los reconocería.
- **Puestos**: la API sólo tiene `point_guard` (base), `shooting_guard`
  (escolta), `small_forward` y `center`, y a veces dos unidos por un guion
  (cuenta el primero). No hay ala-pívots: lo son los aleros desde 205 cm
  (`BNXT_POWER_FORWARD_CM`) y los pívots de menos de 203 cm
  (`BNXT_CENTER_MIN_CM`; con 206 la liga se quedaba con un 11 % de pívots).
- **Nacionalidad**: código **COI** (`SLO`, `SUI`, `GER`), no ISO
  (`toNationCode`), a veces en minúsculas. Una vacía va a mano.
- **Nombres**: los de uso; del nombre de pila legal («Troy Drake») se queda
  el primero (`usualFirstName`), los sufijos se escriben igual («Junior»,
  «Jr» → «Jr.»), lo que viene en mayúsculas se pasa a mayúscula inicial y las
  partículas de los **neerlandeses** van en minúscula («Van Der Vuurst» →
  «van der Vuurst»), como se escriben en los Países Bajos; las de los belgas,
  como vienen («Van Den Eynde»).
- **Lo que falta**: la API no da la fecha de nacimiento de muchos
  estadounidenses. Las de Wikidata y, para los que pasan de unos 300 minutos,
  las de RealGM, Eurobasket, Proballers o su universidad (sólo si coinciden o
  hay una), van a mano en `resources/real-data/manual/bnxt-jugadores.json`
  (`jugadores`, por id de jugador; también nombre de uso, nacionalidad,
  altura o puesto). El resto se queda sin fecha y se avisa.
- **Club**: nombre sin patrocinador (se quedan Landstede Hammers y Heroes Den
  Bosch, que son nombres del club), abreviatura de la API, ciudad (en
  español cuando lo tiene: Amberes, Ostende, Bruselas, Lovaina, Malinas,
  Róterdam, Groninga) y pabellón con aforo de la Wikipedia inglesa, en
  `BNXT_TEAMS` (`bnxt.ts`).
- La copa: la BNXT no tiene copa conjunta (cada país juega la suya y hay una
  supercopa entre los dos campeones); la del juego enfrenta a clubes de los
  dos países y se llama **BNXT Cup** («Cup»).

#### Equipos invitados (la plaza que falta)

La Serie A real 2025-26 tiene 15 equipos y la del juego 16; la Primera FEB real,
17, y la del juego 18. La plaza que falta se completa con un equipo de la
categoría de abajo, extraído aparte como **liga invitada**
(`SourceLeague.guest`):

- **Italia**: el **ganador de la final de los playoffs de la A2** (la A2
  2025-26 tuvo dos ascensos, el primero de la liga regular y el de los playoffs;
  se eligió el de la final). Va fijo en `lnp.ts` (`PROMOTED_TEAM_ID`): la web no
  publica los playoffs en un formato legible.
- **España**: el club de **Huesca**, que jugó la 2025-26 en el grupo Este de la
  Segunda FEB (`feb2.ts`, `HUESCA_TEAM_ID`).
- **Francia**: la Betclic ÉLITE 2025-26 tuvo **16** equipos y la Pro A del juego
  tiene 18; la ÉLITE 2 tuvo **20** y la Pro B tiene 18. Los dos que suben
  (**Roanne**, primero de la liga regular, y **Pau-Lacq-Orthez**, campeón de
  los playoffs de ascenso) pasan a `francia-1` y así las dos cuadran. Aquí la
  liga de abajo es también real, así que no es una liga invitada sino una
  liga con **ascendidos** (`SourceLeague.promoted`, fijos en `lnb.ts`,
  `ELITE2_PROMOTED`): la ÉLITE 2 se valora **entera** con la escala de la Pro B
  (los ascendidos llevan los mismos atributos que si se quedaran) y después
  sus dos equipos se ponen en la Pro A, detrás de los 16, en ese orden (17.º
  Roanne, 18.º Pau), como Verona en Italia. En la Pro B la reputación se
  reparte entre los 18 que se quedan por su orden en la clasificación.
- **Grecia**: la GBL 2025-26 tuvo **13** equipos y la A1 del juego tiene 14; la
  Elite League jugó con **15** y la A2 tiene 14. Sube a `grecia-1` el campeón,
  **Doxa Lefkadas** (primero de la liga regular, ascenso directo), como
  ascendido (`SourceLeague.promoted`, fijo en `hbf.ts`, `PROMOTED_TEAM_IDS`), y
  las dos cuadran. El segundo ascenso real (Vikos Falcons, por la fase final) se
  queda en la A2.

Cómo entran:

- Se extrae **la liga de abajo entera** (o el grupo), porque los atributos salen
  del percentil de cada jugador **en su liga**; sólo los equipos de
  `guest.teamIds` pasan al dataset.
- La escala es la de **su categoría**, no la de destino: el percentil se traduce
  con la liga ficticia de `guest.scale.league`. La A2 italiana usa la Liga Plata
  ficticia (la segunda categoría con la que se calibró el juego). La Segunda FEB
  es una tercera categoría sin liga ficticia equivalente: usa la Liga Plata
  bajada **medio escalón** (`stepsDown: 0.5`), extrapolando percentil a
  percentil la distancia entre la Liga Nacional y la Liga Plata ficticias
  (`scaleReference`). Así el invitado llega como un recién ascendido: con la
  plantilla de su nivel, por debajo de la liga.
- Entra **el último** de la liga de destino (puesto 16.º o 18.º) para la
  reputación, que se reparte entre todos los equipos, invitados incluidos. Por
  eso, al pasar la Primera FEB de 17 a 18, la reputación de la mitad baja sube
  un punto (y con ella el presupuesto y el aforo estimado); los jugadores no
  cambian.
- Sus jugadores llevan ids propios (`<liga>-<liga invitada>-p<id>`) y no se
  mete a nadie que ya juegue en la liga de destino (mismo nombre y fecha).
- Con 16 y 18 equipos las dos ligas vuelven a ser pares: sin descansos.
- **Alemania**: al revés. La BBL cuadra (18) y la ProA real tiene **dos de
  más** (18 para 16): no sube ni se invita a nadie; los dos que bajaron a la
  ProB se quedan fuera (`SourceLeague.excluded`, ver «Alemania»).
- **Israel**: igual que la ProA. La Ligat Winner real tuvo **14** para 12
  plazas: los dos que bajaron a la Liga Leumit se quedan fuera
  (`SourceLeague.excluded`, ver «Israel»).
- **Lituania**: las dos cosas. La LKL real tuvo **9** para 12 plazas y la NKL
  **17**: suben de la NKL los tres primeros que no son filiales
  (`SourceLeague.promoted`) y de los 14 que quedan, los dos últimos se quedan
  fuera (`SourceLeague.excluded`, ver «Lituania»).
- **BNXT**: la real tuvo **18**, como la del juego: entran todos.
- **Liga Adriática**: las dos tienen **dos de más** (18 para 16 y 16 para 14):
  no entran las invitaciones de Rumanía y Austria en la ABA ni los dos
  macedonios en la ABA2 (`SourceLeague.excluded`, ver «Liga Adriática»).

### Conversión (`real:build`)

- **Sustituye liga a liga** conservando el id de la ficticia, así que
  calendario, ascensos, copa y plazas europeas siguen igual. La copa del país
  toma su nombre real (Copa del Rey, Coppa Italia).
- **Plantillas**: cada jugador en un solo equipo (donde más minutos jugó) y como
  mucho `MAX_ROSTER`, quitando a los que menos jugaron.
- **Una persona, un equipo**: quien sale en dos equipos reales (mismo nombre
  y fecha), sea por doble ficha en un filial, por un fichaje de mitad de
  temporada entre países o porque la fuente le da otro id en cada club de la
  misma liga, juega sólo donde más minutos jugó (`sharedPlayerDrops`); a
  igualdad, en la liga que va antes. Se valora igual con su liga entera, como
  los que suben o se quedan fuera. Los que suben de categoría y los equipos
  invitados ceden siempre: si la persona ya juega en otro equipo del juego,
  se queda allí.
- **Atributos**: cada jugador se coloca en un percentil de su liga y recibe el
  valor de ese percentil en la liga ficticia equivalente, así el motor sigue
  calibrado. Cada atributo mezcla el **nivel** con la estadística de su **estilo**
  (triples, rebotes, tapones…). El nivel sale de los minutos por partido, la
  valoración por minuto y, con peso `TEAM_WEIGHT`, el **puesto final de su
  equipo**: sin eso la liga saldría plana, porque las estrellas de los clubes de
  Euroliga juegan menos minutos. Con pocos minutos las estadísticas se acercan a
  la media del puesto; sin estadísticas, el nivel se estima por cupo, edad y
  altura.
- **Lo que la fuente no da** (peso, envergadura, potencial, sueldo, contrato,
  valor) se calcula sin azar: regenerar el dataset no cambia ninguna ficha.
- **País del club**: el de la liga (`SourceLeague.country`) o, en una liga de
  varios países como la Adriática, el suyo (`SourceTeam.country`). Con él se
  generan en la partida la cantera y el cuerpo técnico (`randomNameFor`); por
  eso el Dubai tiene lista de nombres emiratíes (`NAMES_BY_FLAG.UAE`).
- **Nacionalidades** que el juego no conoce se cambian por la del club y se
  avisan en el informe; lo normal es añadir el país a `NATION_NAMES` y su
  bandera a `flags.ts`. Eso no crea selecciones: hacen falta
  `MIN_NATIONAL_POOL` jugadores.
- La Primera FEB 2025-26 tiene **17 equipos**: el calendario mete una jornada
  de descanso por equipo en cada vuelta, como la liga de verdad.

### Entrenadores

Los clubes de las ligas reales llevan a su **primer entrenador de la 2025-26**:
en la Liga Endesa, la Serie A, las ligas francesas, las griegas, la turca, las alemanas, la israelí, las lituanas, las adriáticas y la BNXT, **el que empezó la temporada**, que es el que
está en el banquillo el día que arranca la partida; en la Primera FEB, el que
publica la ficha del equipo (la web no da otro). El resto del mundo y la bolsa de libres
siguen inventados.

- **Liga Endesa**: el array `staff` de la plantilla. Quién es primer
  entrenador lo marca `coach.gameRole` («Entrenador» frente a «Entrenador
  Ayudante»), **no la licencia**: CRE y CTE son cupos, y hay ayudantes CRE y
  primeros entrenadores CTE. Si un club cambió de entrenador salen todos, el de
  ahora el primero, pero el orden no dice quién empezó (con tres, el del medio
  no se sabe). Eso lo dice el **acta del primer partido de liga** del club: el
  partido más temprano ya jugado de su fila de la clasificación (por fecha, no
  por jornada: un aplazado cuenta cuando se jugó), cuya pestaña de estadísticas
  en live.acb.com (`/partidos/partido-<id>/estadisticas`, cacheada como todo)
  trae el `headCoach` de cada equipo. Se busca ese nombre entre los primeros de
  la plantilla (nombre de uso o legal, sin tildes); si no está, se toma el más
  antiguo de la lista y se avisa. Se queda el nombre de uso de
  la web (`nicknameFirstName`/`nicknameLastName`: el apodo en vez del nombre de
  pila legal), la nacionalidad de la plantilla y la fecha de nacimiento de su
  ficha (`/es/liga/entrenadores/<slug>`, una petición por club).
- **Primera FEB**: el recuadro `box-entrenador` de la ficha del equipo, que ya
  se descargaba. Nombre legal en mayúsculas, partido y con el nombre de pila de
  uso como el de los jugadores, y la fecha con el lugar de nacimiento a veces.
  La FEB no da la nacionalidad: se deduce del lugar (provincia española →
  `ESP`, país → el suyo) y, sin lugar, se pone la del club y se avisa.
- **Serie A**: el del **acta del primer partido de liga regular jugado** por el
  club, por fecha (`/championships/get-championships-matches-by-id`,
  `home_coach_*` y `visitor_coach_*`). Manda el acta y no `coaches_extra`, que
  es el entrenador con contrato ese día: cuando un ayudante se sienta un
  partido, el acta lo dice y el contrato no. Se descargan las actas de todos los
  partidos de liga regular (una por partido, la comparten los dos equipos) y
  `real:lba` avisa de cada club con más de un entrenador en el banquillo, en
  orden de llegada y con sus partidos, interinos de un partido incluidos.
  Nombre, fecha y lugar salen de su ficha (`/coaches/get-coaches-by-id`). La LBA
  escribe el lugar como ciudad («Bergamo»), ciudad y país («Ciudad (CRO)», con
  abreviaturas propias como `BOS`) o sólo el país en italiano («Croazia»); una
  ciudad sin país es italiana, porque la LBA sólo lo añade a las de fuera
  (`nationFromLbaPlace`).
- Lo que la ficha de la LBA no da (en la 2025-26, la fecha de casi todos los
  entrenadores del inicio) va a mano en
  `resources/real-data/manual/lba-entrenadores.json`, por id de entrenador de la
  LBA, con la fecha y el lugar escritos como en la FEB (`birth`: «dd/mm/aaaa
  Ciudad (País)») y la fuente de cada dato. Lo que da la LBA manda.
- **Betclic ÉLITE** y **ÉLITE 2**: el cuerpo técnico de la LNB
  (`getCoachingStaff`), el primer `HEAD_COACH` por fecha de alta (a igual
  fecha, el de cargo más antiguo). Las actas de Sportradar no traen
  entrenadores, y el cuerpo técnico no siempre cuadra: en Paris, Monaco y
  Limoges no está el sustituto, en Roanne los dos tienen las mismas fechas y
  en Challans falta el que empezó. Todo eso se contrastó con prensa y va en
  `resources/real-data/manual/lnb-entrenadores.json`: `fallbacks` por id de
  persona de la LNB (fecha y lugar de nacimiento, que la LNB no da nunca, y
  `despues` con el sustituto para el aviso) e `inicio` por id de equipo
  cuando el primero de la LNB no es el que empezó (en la 2025-26, Challans).
  Sin fecha exacta va la edad (`age`) y se aplica la regla del 1 de julio.
  La nacionalidad sale del lugar: «Ciudad (País)» o una ciudad francesa.
  `real:lnb` avisa de cada cambio de entrenador.
- **Stoiximan GBL**: todos a mano, en
  `resources/real-data/manual/esake-entrenadores.json` (`inicio`, por id de
  equipo de esake, con nombre de uso, nacimiento como la FEB, nacionalidad,
  fuente y `despues` con quién le sustituyó): esake sólo da el cuerpo técnico
  de hoy y sus actas no traen entrenador. Se sacaron de la prensa griega y la
  Wikipedia, contrastados con las copias antiguas de esake en archive.org.
  `real:esake` avisa de cada cambio de entrenador.
- **Süper Ligi turca**: el del **acta del primer partido de liga regular**
  del club en tblstat, por fecha, con la nacionalidad de la bandera de su
  ficha de equipo (manda sobre la del fichero a mano). tblstat no da fechas de
  nacimiento de entrenadores: van a mano en `tblstat-entrenadores.json`
  (`inicio`, por id de equipo de tblstat, con nombre de uso, nacimiento como la
  FEB, fuente y `despues`), sacadas de la Wikipedia inglesa y turca, FIBA y
  prensa. `real:tblstat` avisa de cada cambio de entrenador que ve en las
  actas y de cuando el nombre a mano no es el del acta.
- **easyCredit BBL**: el del **acta del primer partido de liga regular** del
  club (`headCoachName`), por fecha; `real:bbl` avisa de cada cambio que ve en
  las actas. La fecha sale del cuerpo técnico de la web si el primero sigue en
  él; si no (los que se fueron a mitad de temporada), a mano. La BBL no da la
  nacionalidad: va a mano en `bbl-entrenadores.json` (`inicio`, por id de
  equipo de la BBL, con nombre de uso con sus tildes, `nationality`, `birth`
  cuando la web no la da, fuente y `despues`), sacada de Wikidata, las
  Wikipedias y los clubes. El cuerpo técnico de la web no sirve para saber
  quién empezó: es el de ahora y a veces marca como principal a otro.
- **ProA**: no hay actas legibles (van por socket.io) y la plantilla lista a
  todos los que pasaron por el banquillo, a veces con el de la temporada
  siguiente, sin decir quién empezó. El del inicio va a mano en
  `proa-entrenadores.json` (`inicio`, por id de equipo de la ProA, con nombre
  de uso, fuente y `despues`), comprobado con la plantilla de la 2024-25 para
  los que siguieron y con prensa para los nuevos y los que cambiaron; la fecha
  y la nacionalidad (bandera) salen de la web si el nombre casa. Sin fichero,
  se toma el único «Trainer» de la web y se avisa.
- **Ligat Winner**: el del **acta del primer partido de liga regular** del
  club, por fecha (hubo jornadas aplazadas); `real:winner` avisa de cada cambio
  que ve en las actas. La web no da ni la fecha ni la nacionalidad de los
  entrenadores: van a mano en `winner-entrenadores.json` (`inicio`, por
  `TeamId`, con nombre de uso, nacimiento como la FEB, nacionalidad, fuente,
  `despues` y `coachId`, el id de entrenador de la web, con el que se comprueba
  que es el del acta aunque la web lo translitere de otra forma), sacados de
  las Wikipedias inglesa y hebrea. Del de **Kiryat Ata** no se ha encontrado la
  fecha en ninguna fuente fiable (la prensa sólo da su edad un año antes): el
  club se queda sin entrenador real y el juego le inventa uno. Es la única
  excepción, contada, que admite `edition.test.ts` en `israel-1` (en
  `lituania-1` admite tres, ver «NKL»).
- **Elite League**: el del **acta del primer partido de liga regular** del
  club (la federación sí lo pone en el acta), por fecha; `real:hbf` avisa de
  cada cambio que ve en las actas. El nombre legal se cambia por el de uso y
  la fecha y el país van a mano en `hbf-entrenadores.json` (`inicio`, por id
  de equipo; sin fecha exacta, `age`). Sin fecha ni edad, el club se queda
  sin entrenador real y el juego le inventa uno (por eso `edition.test.ts` no
  exige entrenador en `grecia-2`).
- **LKL**: todos a mano, en `lkl-entrenadores.json` (`inicio`, por id de club
  de lkl.lt, con nombre, nacimiento como la FEB, nacionalidad, fuente y
  `despues`), según la Wikipedia inglesa de la temporada (tabla de cambios) y
  la ficha de cada uno en la inglesa o la lituana: las actas de lkl.lt dan el
  entrenador **actual** del club, no el de ese partido.
- **NKL** (y los tres que suben a la LKL): el del **acta del primer partido de
  liga regular** del club en basketnews, por fecha; `real:lkl` avisa de cada
  cambio que ve en las actas. La fecha y la nacionalidad van a mano en
  `nkl-entrenadores.json` (`inicio`, por id de club), sólo para los que la
  tienen en la Wikipedia lituana; los demás clubes se quedan sin entrenador
  real y el juego les inventa uno (por eso `edition.test.ts` no exige
  entrenador en `lituania-2` y cuenta las excepciones de `lituania-1`). En la
  2025-26 tienen fecha 5 de los 12 de la NKL y ninguno de los tres que suben:
  en `lituania-1` son tres excepciones.
- **ABA** y **ABA2**: la web no publica entrenadores; sólo lo que dijeron
  después de cada partido («Nombre, trener Club:», pestaña de comentarios),
  que no dice de qué club es: un nombre es de un club si ese club jugó todos
  los partidos en los que habló, o del rival del otro que habló ese día
  (`speakersByTeam`). Con eso `real:aba` avisa de cada cambio y de cuando el
  primero que habla no es el de la mano. El del inicio va a mano en
  `aba-entrenadores.json` y `aba2-entrenadores.json` (`inicio`, por id de
  club, con nombre de uso, nacimiento como la FEB, nacionalidad, fuente,
  `despues` y `enActa`, la grafía de las declaraciones: «Janis Sferopulos»),
  de la Wikipedia inglesa y Wikidata. En la ABA, los 16. El del Split es Dino
  Repeša (el partido de la primera jornada lo dirigió un ayudante porque él no
  tenía el pasaporte en regla). En la ABA2 sólo 9 de 14 tienen fecha: los
  demás se inventan (por eso `edition.test.ts` no exige entrenador en
  `adriatica-2`).
- **BNXT**: todos a mano, en `bnxt-entrenadores.json` (`inicio`, por id de
  club de la API, con nombre de uso, nacimiento como la FEB, nacionalidad,
  fuente, `despues` y `enApi`, cómo escribe la API al del final si no es
  igual). La API sólo tiene el cuerpo técnico del **final** y las actas no
  traen entrenador: el del inicio sale de la Wikipedia neerlandesa de la
  temporada (tabla de clubes y de cambios de entrenador) y las fechas, de
  Wikidata o de esa Wikipedia. `real:bnxt` avisa cuando el del final no es el
  de la mano ni uno de los de `despues`. En la 2025-26 cambiaron Oostende
  (empezó Georgios Dedas), Rotterdam (Tim Arns) y BAL (Radenko Varagić). De
  van Sliedregt (LWD) y Arns (Rotterdam) no se ha encontrado la fecha: el
  juego se los inventa, las dos excepciones que admite `edition.test.ts` en
  `bnxt-1`.
- **Serie A2** y **Segunda FEB**: sólo el del equipo invitado. La LNP no publica
  los técnicos de temporadas pasadas: el de la A2 es el del inicio de temporada
  y va a mano en `resources/real-data/manual/lnp-entrenadores.json` (por id de
  equipo, con nombre, apellido y `birth`). El de la Segunda FEB es el de la
  ficha, como en la Primera; con el recuadro vacío va en
  `feb-entrenadores.json` con el mismo criterio que la FEB: el del final de la
  temporada.
- En el formato común es `SourceTeam.coach` y en el dataset, `DatasetTeam.coach`
  (nombre, apellidos, nacionalidad y fecha). El ficticio no lo lleva nunca.
- Sin fecha de nacimiento, la edad de la fuente se convierte en el 1 de julio
  del año que le cuadra el día de la extracción: siempre la misma fecha.
- Lo que la fuente no da y se pone a mano, con aviso, va en
  `resources/real-data/manual/feb-entrenadores.json` (fuera de git, porque son
  datos de personas reales; entra en las copias de seguridad): el entrenador de
  los equipos con el recuadro vacío en la FEB (`fallbacks`, por id de equipo; en
  la 2025-26, el del Basket Cartagena) y dónde se parten los nombres legales que
  no se pueden partir a ojo (`names`). Sin el fichero, esos equipos se quedan
  sin entrenador real y `real:feb` lo avisa.
- `real:acb` avisa de los clubes que cambiaron de entrenador durante la
  temporada, con quién le sustituyó después (en el orden de la plantilla, del
  más antiguo al más reciente), y `real:build` cuenta cuántos clubes tienen
  entrenador real.
- Al sembrar la partida, el entrenador `coach-<club>` es el real, pero su
  **reputación sale igual que la de uno inventado** (club, categoría y edad,
  con la misma semilla): ni su fama ni su palmarés de fuera cuentan. Una
  partida privada creada antes de los entrenadores los inventa todos al
  abrirse: `CoachService` no lee el dataset.
