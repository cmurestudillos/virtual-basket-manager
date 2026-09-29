import { randomUUID } from 'node:crypto';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { eq, isNull } from 'drizzle-orm';
import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { savesTable } from '../src/main/database/schema/app';
import { openSaveDatabase, type SaveDatabase } from '../src/main/database/save-database';
import { boardTable, celebrationsTable, gamesTable } from '../src/main/database/schema/save';
import { loadDataset } from '../src/main/features/saves/dataset';
import { seedSave } from '../src/main/features/saves/save-seeder';
import { NationalService } from '../src/main/features/national/national.service';
import { SeasonService } from '../src/main/features/season/season.service';
import { TrophyService } from '../src/main/features/trophies/trophies.service';

/**
 * Deja en `.dev-data` una partida en la que la selección del usuario acaba de
 * ganar el Mundial (trofeos, 2026-09-29): al cargarla sale la pantalla de
 * campeón con la esfera de oro.
 *
 * Los resultados se escriben a mano, como en los tests de trofeos: España gana
 * todos sus partidos y en los demás gana el local. Así la partida sale siempre
 * igual y en segundos —no hay motor ni azar de por medio—, que es lo que un
 * Mundial ganado necesita para poder capturarse en cada pasada del arnés. Lo
 * que no es del Mundial (la gala del club, sin actas) se da por visto: esta
 * partida existe para enseñar la esfera.
 *
 *   pnpm seed:world
 */

const DEV_DATA = resolve('.dev-data');
const SAVES = join(DEV_DATA, 'saves');
const MANAGED_TEAM = 'liga-nacional-1';
const NATIONAL_TEAM = 'seleccion-esp';
const NAME = 'Campeón del mundo';

mkdirSync(SAVES, { recursive: true });

const id = randomUUID();
const fileName = `campeon-del-mundo-${id}.sqlite`;
const db: SaveDatabase = openSaveDatabase(join(SAVES, fileName), resolve('drizzle/save'));

seedSave(db, loadDataset(resolve('resources/seed-data')), {
  managedTeamId: MANAGED_TEAM,
  managerName: 'Carlos'
});

const resolveDb = (): SaveDatabase => db;
const season = new SeasonService(resolveDb);
season.getCurrent();
// Sin consejo que despida a nadie: aquí sólo importa el Mundial.
db.delete(boardTable).run();
new NationalService(resolveDb).takeTeam(NATIONAL_TEAM);

console.log('dando por jugada la temporada, con España ganándolo todo…');
for (let pass = 0; pass < 60; pass += 1) {
  const pending = db.select().from(gamesTable).where(isNull(gamesTable.homeScore)).all();
  if (pending.length === 0) {
    break;
  }
  db.transaction((tx) => {
    for (const game of pending) {
      const homeWins = game.awayTeamId !== NATIONAL_TEAM;
      tx.update(gamesTable)
        .set({ homeScore: homeWins ? 88 : 70, awayScore: homeWins ? 76 : 88 })
        .where(eq(gamesTable.id, game.id))
        .run();
    }
  });
  season.getCurrent();
}

const worldCup = new TrophyService(resolveDb)
  .listPending()
  .find((celebration) => celebration.trophyKind === 'world_cup');
if (!worldCup) {
  throw new Error('España no ha ganado el Mundial');
}
// Sólo queda por enseñar el Mundial.
for (const celebration of new TrophyService(resolveDb).listPending()) {
  if (celebration.id !== worldCup.id) {
    db.update(celebrationsTable)
      .set({ seenOn: new Date() })
      .where(eq(celebrationsTable.id, celebration.id))
      .run();
  }
}

const appDb = drizzle(new Database(join(DEV_DATA, 'app.sqlite')));
migrate(appDb, { migrationsFolder: resolve('drizzle/app') });
const now = new Date(Date.now() - 30_000);
appDb
  .insert(savesTable)
  .values({ id, name: NAME, fileName, createdAt: now, lastPlayedAt: now })
  .run();

console.log(`campeón del mundo: ${worldCup.teamName}`);
console.log(`partida lista: ${fileName}`);
