# Arquitectura

## Stack

Electron 43 · Vue 3 (Composition API, `<script setup>`) · TypeScript estricto ·
SQLite vía better-sqlite3 + Drizzle ORM · Pinia · Vue Router · Tailwind 4 ·
Vitest · Zod.

Es el mismo stack que DerbiManager, a propósito: está probado en un juego de
este tamaño y evita reaprender tooling para resolver un problema que ya estaba
resuelto.

## Los tres procesos

```
src/
├── main/        proceso principal — Node completo, dueño de la base de datos
├── preload/     puente — expone `window.api`, cero lógica
├── renderer/    interfaz Vue — sin acceso a Node ni a SQLite
└── shared/      dominio, contratos y motor — importable desde los tres
```

El renderer **nunca** toca la base de datos. Todo pasa por IPC:

```
Vue → window.api.x.y() → preload → ipcRenderer.invoke → ipcMain.handle
    → Service (valida con Zod) → Repository (único que ve Drizzle) → SQLite
```

`contextIsolation: true`, `nodeIntegration: false` y una CSP estricta en
`index.html`. El preload sólo reenvía por el canal correspondiente: si tuviera
lógica, esa lógica correría en el lado accesible desde la página.

## Reglas que no se negocian

1. **Sólo los repositorios importan Drizzle o `better-sqlite3`.** Los servicios
   dependen del repositorio, nunca del cliente de base de datos.
2. **Todo payload IPC se revalida con Zod en el servicio.** Los tipos de
   TypeScript no sobreviven a la serialización de `invoke`.
3. **Lo derivado no se persiste.** Media del jugador, edad, porcentajes de tiro
   y valoración se calculan al leer. Una media guardada se desincroniza en
   cuanto el jugador entrena.
4. **El dinero viaja en céntimos**, siempre enteros. Nada de decimales flotando.
5. **El motor no llama a `Math.random()`.** Recibe una semilla; el mismo partido
   se simula igual las veces que haga falta.
6. **La fecha del juego no es la fecha real.** Las edades y los vencimientos se
   calculan contra `game_state.current_date`.

## Dos bases de datos

|          | Base de aplicación                        | Fichero de partida                                      |
| -------- | ----------------------------------------- | ------------------------------------------------------- |
| Ruta     | `.dev-data/app.sqlite` (dev) / `userData` | `.dev-data/saves/*.sqlite`                              |
| Contiene | ajustes globales, registro de partidas    | todo el mundo de la partida                             |
| WAL      | sí                                        | **no** — debe seguir siendo un fichero único y portable |
| Esquema  | `src/main/database/schema/app`            | `src/main/database/schema/save`                         |

Cada partida es un fichero autocontenido: copiarlo copia la partida entera.
Por eso no lleva WAL (los ficheros `-wal`/`-shm` se desincronizan con
sincronización tipo Steam Cloud).

Las migraciones se generan con `pnpm db:generate` y se aplican solas al abrir
cada base. En la build empaquetada viajan en `resources/drizzle`.

## Anatomía de una feature

```
src/main/features/<feature>/
├── <feature>.ipc-handler.ts    registra los canales; monta servicio y repositorio
├── <feature>.service.ts        lógica de negocio; valida con Zod
├── <feature>.repository.ts     único que habla con SQLite
└── tests/
```

Para añadir una feature: canal nuevo en `src/shared/ipc-channels.ts`, contrato
en `src/shared/contracts/`, el trío de arriba, una línea en
`src/main/ipc/registerIpcHandlers.ts` y el método en `src/preload/index.ts`.

## El motor

`src/shared/engine/basketball/` está en `shared` y no en `main` porque no
depende de Electron ni de la base de datos: entra un `SimulateGameInput` y sale
un `GameResult`. Se puede testear, y en el futuro reproducir en la interfaz
jugada a jugada, sin arrancar la aplicación.

## Verificación

- `pnpm test` — unitarios más un test de integración real contra SQLite que
  siembra una partida entera en una carpeta temporal.
- `pnpm typecheck` — `tsc` y `vue-tsc` contra los dos tsconfig.
- `pnpm build && pnpm verify:app` — arranca Electron de verdad, recorre el flujo
  completo y deja capturas en `.dev-data/shots`.

Lo último es lo que de verdad dice si algo funciona: un test unitario no ve una
pantalla en blanco ni un `window.api` que no llegó a exponerse.

**`pnpm dev` no recompila.** Carga lo que hay en `out/`.
