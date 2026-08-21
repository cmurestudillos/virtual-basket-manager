# Virtual Basket Manager

Manager de baloncesto de escritorio, inspirado en **PC Basket 6.5** y en
**International Basketball Manager**.

Electron + Vue 3 + TypeScript + SQLite. Nombre de trabajo: el definitivo se
decidirá más adelante.

> Estado: **esqueleto**. Hay motor de partido funcionando, base de datos,
> partidas guardadas y unas cuantas pantallas. No hay temporada todavía — ver
> [docs/ROADMAP.md](docs/ROADMAP.md).

## Arranque

```bash
pnpm install
pnpm db:generate     # migraciones (ya están generadas; sólo si cambia el esquema)
pnpm build           # OJO: `pnpm dev` NO recompila
pnpm dev
```

Si `pnpm dev` falla porque no encuentra Electron, el binario no llegó a
descargarse en la instalación:

```bash
node node_modules/electron/install.js
```

## Comandos

| Comando                     | Qué hace                                           |
| --------------------------- | -------------------------------------------------- |
| `pnpm dev`                  | Arranca la aplicación desde `out/` (no compila)    |
| `pnpm build`                | Compila main, preload y renderer                   |
| `pnpm test`                 | Vitest: unitarios + integración real contra SQLite |
| `pnpm test:coverage`        | Cobertura, con umbral del 90 %                     |
| `pnpm typecheck`            | `tsc` y `vue-tsc`                                  |
| `pnpm lint` / `pnpm format` | ESLint / Prettier                                  |
| `pnpm db:generate`          | Regenera las migraciones de Drizzle                |
| `pnpm seed:generate`        | Regenera el dataset ficticio                       |
| `pnpm verify:app`           | Arranca Electron, recorre el flujo y deja capturas |
| `pnpm build:win`            | Instalador NSIS                                    |

## Documentación

- [docs/ARQUITECTURA.md](docs/ARQUITECTURA.md) — cómo está montado y qué reglas
  no se saltan.
- [docs/MODELO-DOMINIO.md](docs/MODELO-DOMINIO.md) — el baloncesto: posiciones,
  atributos, reglamentos, acta y motor.
- [docs/ROADMAP.md](docs/ROADMAP.md) — inventario de módulos pendiente de
  decidir.

## Dónde están los datos

En desarrollo, todo va a `.dev-data/` dentro del proyecto: `app.sqlite`
(ajustes y registro de partidas), `saves/` (un `.sqlite` por partida) y `shots/`
(capturas de la verificación). Se puede borrar entera para empezar de cero.

## Datos

El dataset que se distribuye es **inventado**: equipos, pabellones y jugadores
generados por `scripts/seed-data/generate-dataset.mts`. Es deliberado — un
dataset con nombres y escudos reales condiciona qué se puede publicar después.
