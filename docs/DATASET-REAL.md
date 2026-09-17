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
decidido: **España primero (ACB y Primera FEB)** y después país a país.

```
pnpm real:acb     # Liga Endesa      → .real-data-cache/sources/acb-2025.json
pnpm real:feb     # Primera FEB      → .real-data-cache/sources/feb-2025.json
pnpm real:build   # todas las ligas extraídas → resources/real-data/dataset.json
```

Todo es de la **temporada 2025-26**. Los países sin liga real siguen con el mundo
inventado.

### Fuentes

| Liga (id en el juego)         | Web                       | Cómo se lee                                                                                                                                      |
| ----------------------------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Liga Endesa (`liga-nacional`) | `acb.com`                 | Los datos que Next.js incrusta en el HTML (`self.__next_f`), con `editionId=90`. Clasificación, plantilla, estadísticas de liga regular y ficha. |
| Primera FEB (`liga-plata`)    | `baloncestoenvivo.feb.es` | ASP.NET: calendario, clasificación de liga regular y estadísticas acumuladas por _postback_. Dos segundos entre peticiones.                      |

- Cada extractor sólo lee su web y deja los datos **tal cual** en un formato
  común (`scripts/real-data/lib/source-types.ts`). Lo único que retoca es el
  nombre de la FEB, que da el legal completo: se queda el nombre de pila de uso
  («Philip Alexander» → «Philip», pero «José María» entero).
- Todo lo descargado se guarda en `.real-data-cache/http` (fuera de git) y no se
  vuelve a pedir; `--force` lo descarga de nuevo.

### Conversión (`real:build`)

- **Sustituye liga a liga** conservando el id de la ficticia, así que
  calendario, ascensos, copa y plazas europeas siguen igual. La copa del país
  toma su nombre real (Copa del Rey).
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
