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
decidido: **España primero (ACB y Primera FEB)**, después **Italia (Serie A)** y
así país a país.

```
pnpm real:acb     # Liga Endesa        → .real-data-cache/sources/acb-2025.json
pnpm real:feb     # Primera FEB        → .real-data-cache/sources/feb-2025.json
pnpm real:feb2    # Segunda FEB (Este) → .real-data-cache/sources/feb2-este-2025.json
pnpm real:lba     # Serie A italiana   → .real-data-cache/sources/lba-2025.json
pnpm real:lnp     # Serie A2 italiana  → .real-data-cache/sources/lnp-a2-2025.json
pnpm real:build   # todas las ligas extraídas → resources/real-data/dataset.json
```

Todo es de la **temporada 2025-26**. Los países sin liga real siguen con el mundo
inventado.

### Fuentes

| Liga (id en el juego)         | Web                       | Cómo se lee                                                                                                                                      |
| ----------------------------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Liga Endesa (`liga-nacional`) | `acb.com`                 | Los datos que Next.js incrusta en el HTML (`self.__next_f`), con `editionId=90`. Clasificación, plantilla, estadísticas de liga regular y ficha. |
| Primera FEB (`liga-plata`)    | `baloncestoenvivo.feb.es` | ASP.NET: calendario, clasificación de liga regular y estadísticas acumuladas por _postback_. Dos segundos entre peticiones.                      |
| Segunda FEB, grupo Este       | `baloncestoenvivo.feb.es` | Igual que la Primera (`feb-extract.ts`), con la fase «Liga Regular "ESTE"». Sólo entra un equipo, en `liga-plata` (ver «Equipos invitados»).     |
| Serie A (`italia-1`)          | `legabasket.it`           | La API JSON de su web (`/api`). Equipos del año, plantilla, club, estadísticas de liga regular, calendario y actas. Un segundo entre peticiones. |
| Serie A2 italiana             | `legapallacanestro.com`   | JSON de `lnpstat.domino.it` (clasificación, calendario) y Drupal (estadísticas por Ajax, ficha). Sólo entra un equipo, en `italia-1`.            |

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

### Conversión (`real:build`)

- **Sustituye liga a liga** conservando el id de la ficticia, así que
  calendario, ascensos, copa y plazas europeas siguen igual. La copa del país
  toma su nombre real (Copa del Rey, Coppa Italia).
- **Plantillas**: cada jugador en un solo equipo (donde más minutos jugó) y como
  mucho `MAX_ROSTER`, quitando a los que menos jugaron.
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
- **Nacionalidades** que el juego no conoce se cambian por la del club y se
  avisan en el informe; lo normal es añadir el país a `NATION_NAMES` y su
  bandera a `flags.ts`. Eso no crea selecciones: hacen falta
  `MIN_NATIONAL_POOL` jugadores.
- La Primera FEB 2025-26 tiene **17 equipos**: el calendario mete una jornada
  de descanso por equipo en cada vuelta, como la liga de verdad.

### Entrenadores

Los clubes de las ligas reales llevan a su **primer entrenador de la 2025-26**:
en la Liga Endesa y la Serie A, **el que empezó la temporada**, que es el que
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
