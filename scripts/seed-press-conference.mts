import { randomUUID } from 'node:crypto';
import Database from 'better-sqlite3';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { savesTable } from '../src/main/database/schema/app';
import { openSaveDatabase, type SaveDatabase } from '../src/main/database/save-database';
import { gamesTable } from '../src/main/database/schema/save';
import { loadDataset } from '../src/main/features/saves/dataset';
import { seedSave } from '../src/main/features/saves/save-seeder';
import { InboxService } from '../src/main/features/inbox/inbox.service';
import { MatchService } from '../src/main/features/match/match.service';
import { SeasonService } from '../src/main/features/season/season.service';

/**
 * Deja en `.dev-data` una partida **con una rueda de prensa esperando**.
 *
 * No toda derrota trae prensa —sólo las palizas, las rachas, los playoffs—, así
 * que el partido que juega el arnés puede no dar ninguna, y la pantalla quedaría
 * sin verificar. Aquí se juega el primer partido de verdad y después se deja el
 * marcador en una paliza, que es lo único puesto a mano: la bandeja la detecta
 * sola al compararse, como en la partida de cualquiera.
 *
 *   pnpm seed:press
 */

const DEV_DATA = resolve('.dev-data');
const SAVES = join(DEV_DATA, 'saves');
const MANAGED_TEAM = 'liga-nacional-1';
const NAME = 'Rueda de prensa pendiente';

mkdirSync(SAVES, { recursive: true });

const id = randomUUID();
const fileName = `rueda-de-prensa-${id}.sqlite`;
const db: SaveDatabase = openSaveDatabase(join(SAVES, fileName), resolve('drizzle/save'));

seedSave(db, loadDataset(resolve('resources/seed-data')), {
  managedTeamId: MANAGED_TEAM,
  managerName: 'Carlos'
});

const resolveDb = (): SaveDatabase => db;
const season = new SeasonService(resolveDb);
const match = new MatchService(resolveDb);
const inbox = new InboxService(resolveDb);

season.getCurrent();
// La primera foto: lo que pase desde aquí es noticia.
inbox.sync();

let gameId: string | null = null;
for (let guard = 0; guard < 60 && !gameId; guard += 1) {
  const result = season.advanceToNextGame();
  if (result.status === 'userGame') {
    match.start(result.gameId);
    let state = match.advancePeriod(result.gameId);
    while (!state.finished) {
      state = match.advancePeriod(result.gameId);
    }
    gameId = result.gameId;
  }
}
if (!gameId) {
  throw new Error('no llegó ningún partido del usuario');
}

// Una paliza de treinta: eso sí es rueda de prensa.
const game = db.select().from(gamesTable).where(eq(gamesTable.id, gameId)).get();
if (!game) {
  throw new Error('el partido jugado no está en la base');
}
const isHome = game.homeTeamId === MANAGED_TEAM;
db.update(gamesTable)
  .set(isHome ? { homeScore: 58, awayScore: 88 } : { homeScore: 88, awayScore: 58 })
  .where(eq(gamesTable.id, gameId))
  .run();

inbox.sync();

const appDb = drizzle(new Database(join(DEV_DATA, 'app.sqlite')));
migrate(appDb, { migrationsFolder: resolve('drizzle/app') });
const now = new Date();
appDb
  .insert(savesTable)
  .values({ id, name: NAME, fileName, createdAt: now, lastPlayedAt: now })
  .run();

console.log(`partida lista: ${fileName}`);
