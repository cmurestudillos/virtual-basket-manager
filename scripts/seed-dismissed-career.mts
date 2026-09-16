import { randomUUID } from 'node:crypto';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { savesTable } from '../src/main/database/schema/app';
import { openSaveDatabase, type SaveDatabase } from '../src/main/database/save-database';
import { boardTable } from '../src/main/database/schema/save';
import { loadDataset } from '../src/main/features/saves/dataset';
import { seedSave } from '../src/main/features/saves/save-seeder';
import { MatchService } from '../src/main/features/match/match.service';
import { SeasonService } from '../src/main/features/season/season.service';

/**
 * Deja en `.dev-data` una partida **en modo carrera con el entrenador
 * destituido**, para poder ver en la aplicación real la pantalla de ofertas.
 *
 * Existe porque esa pantalla no se alcanza jugando: hace falta que el consejo
 * pierda la paciencia del todo, y eso son media temporada de derrotas que
 * ningún arnés puede permitirse en cada pasada. Aquí se juegan unas jornadas
 * para que la liga tenga clasificación —las ofertas dicen cómo va cada club— y
 * después se fuerza el despido, que es lo único que se pone a mano.
 *
 *   pnpm seed:career
 */

const DEV_DATA = resolve('.dev-data');
const SAVES = join(DEV_DATA, 'saves');
const MANAGED_TEAM = 'liga-nacional-1';
const NAME = 'Carrera sin equipo';
/** Jornadas jugadas antes del despido: las justas para que haya tabla. */
const ROUNDS = 6;

mkdirSync(SAVES, { recursive: true });

const id = randomUUID();
const fileName = `carrera-sin-equipo-${id}.sqlite`;
const db: SaveDatabase = openSaveDatabase(join(SAVES, fileName), resolve('drizzle/save'));

seedSave(db, loadDataset(resolve('resources/seed-data')), {
  managedTeamId: MANAGED_TEAM,
  managerName: 'Carlos',
  careerMode: true
});

const resolveDb = (): SaveDatabase => db;
const season = new SeasonService(resolveDb);
const match = new MatchService(resolveDb);

console.log(`jugando ${ROUNDS} jornadas…`);
let played = 0;
for (let guard = 0; guard < 200 && played < ROUNDS; guard += 1) {
  const result = season.advanceToNextGame();
  if (result.status === 'seasonOver' || result.status === 'dismissed') {
    break;
  }
  if (result.status === 'userGame') {
    match.start(result.gameId);
    let state = match.advancePeriod(result.gameId);
    while (!state.finished) {
      state = match.advancePeriod(result.gameId);
    }
    played += 1;
  }
}

// Y el despido, a mano: lo que interesa verificar es lo que pasa después.
db.update(boardTable).set({ confidence: 0, dismissed: true }).run();

// Registro de partidas: sin la fila, existe como fichero pero no en «Cargar».
const appDb = drizzle(new Database(join(DEV_DATA, 'app.sqlite')));
migrate(appDb, { migrationsFolder: resolve('drizzle/app') });
const now = new Date();
appDb
  .insert(savesTable)
  .values({ id, name: NAME, fileName, createdAt: now, lastPlayedAt: now })
  .run();

console.log(`partida lista: ${fileName}`);
