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
 * Deja en `.dev-data` una partida con la temporada ya terminada.
 *
 * Existe para poder verificar en la aplicación real las pantallas de final de
 * temporada —cuadro de playoffs, campeón, arranque de la temporada siguiente—
 * sin jugar 306 partidos a botonazos: son diez minutos de clics que ningún
 * arnés puede permitirse en cada pasada.
 *
 * Corre fuera de Electron a propósito: el servicio de temporada y el motor no
 * dependen de él, así que la liga entera se puede jugar desde un script.
 *
 *   pnpm seed:finished
 */

const DEV_DATA = resolve('.dev-data');
const SAVES = join(DEV_DATA, 'saves');
const MANAGED_TEAM = 'liga-nacional-1';
const NAME = 'Temporada terminada';

mkdirSync(SAVES, { recursive: true });

const id = randomUUID();
const fileName = `temporada-terminada-${id}.sqlite`;
const db: SaveDatabase = openSaveDatabase(join(SAVES, fileName), resolve('drizzle/save'));

seedSave(db, loadDataset(resolve('resources/seed-data')), {
  managedTeamId: MANAGED_TEAM,
  managerName: 'Carlos'
});

const resolveDb = (): SaveDatabase => db;
const season = new SeasonService(resolveDb);
const match = new MatchService(resolveDb);

console.log('jugando la temporada entera…');
for (let guard = 0; guard < 900; guard += 1) {
  const result = season.advanceToNextGame();
  if (result.status === 'seasonOver') {
    break;
  }
  if (result.status === 'dismissed') {
    // Esto es un generador de partidas de prueba, no un test del consejo: si
    // la semilla de este año da una mala racha, se le devuelve la confianza y
    // se sigue. Sin esto, el arnés depende de que el equipo vaya bien.
    db.update(boardTable).set({ confidence: 100, dismissed: false }).run();
    continue;
  }
  if (result.status === 'userGame') {
    // El partido del usuario lo juega aquí el propio motor, cuarto a cuarto,
    // exactamente como lo haría él pulsando el botón.
    match.start(result.gameId);
    let state = match.advancePeriod(result.gameId);
    while (!state.finished) {
      state = match.advancePeriod(result.gameId);
    }
  }
}

const current = season.getCurrent();
if (current.stage !== 'finished') {
  throw new Error(`la temporada quedó en fase ${current.stage}`);
}

// Registro de partidas: sin la fila, la partida existe como fichero pero no
// aparece en «Cargar partida».
const appDb = drizzle(new Database(join(DEV_DATA, 'app.sqlite')));
migrate(appDb, { migrationsFolder: resolve('drizzle/app') });
const now = new Date();
appDb
  .insert(savesTable)
  .values({ id, name: NAME, fileName, createdAt: now, lastPlayedAt: now })
  .run();

console.log(`campeón: ${current.championTeamName}`);
console.log(`partida lista: ${fileName}`);
