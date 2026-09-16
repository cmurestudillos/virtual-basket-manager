import { randomUUID } from 'node:crypto';
import Database from 'better-sqlite3';
import { and, eq, isNull } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { savesTable } from '../src/main/database/schema/app';
import { openSaveDatabase, type SaveDatabase } from '../src/main/database/save-database';
import { gamesTable, playersTable, seasonsTable } from '../src/main/database/schema/save';
import { loadDataset } from '../src/main/features/saves/dataset';
import { seedSave } from '../src/main/features/saves/save-seeder';
import { SeasonService } from '../src/main/features/season/season.service';

/**
 * Deja en `.dev-data` una partida de la **liga americana con la temporada
 * terminada y el draft abierto**, y con un jugador descontento en la plantilla.
 *
 * Jugar una temporada NBA entera para llegar al draft serían cientos de
 * partidos: aquí se escriben los resultados —gana el de mejor número de
 * equipo— y el resto lo hace el juego solo, como en cualquier partida: play-in,
 * cuadro, campeón y lotería.
 *
 *   pnpm seed:nba
 */

const DEV_DATA = resolve('.dev-data');
const SAVES = join(DEV_DATA, 'saves');
const MANAGED_TEAM = 'usa-1-5';
const NAME = 'Liga americana con draft';

mkdirSync(SAVES, { recursive: true });

const id = randomUUID();
const fileName = `liga-americana-${id}.sqlite`;
const db: SaveDatabase = openSaveDatabase(join(SAVES, fileName), resolve('drizzle/save'));

seedSave(db, loadDataset(resolve('resources/seed-data')), {
  managedTeamId: MANAGED_TEAM,
  managerName: 'Carlos'
});

const season = new SeasonService(() => db);
season.getCurrent();

const league = db
  .select()
  .from(seasonsTable)
  .where(and(eq(seasonsTable.competitionId, 'usa-1'), eq(seasonsTable.seasonNumber, 1)))
  .get();
if (!league) {
  throw new Error('la liga americana no tiene temporada');
}

const strength = (teamId: string) => Number(teamId.split('-').pop());
for (let guard = 0; guard < 60; guard += 1) {
  const current = db.select().from(seasonsTable).where(eq(seasonsTable.id, league.id)).get();
  if (current?.stage === 'finished') {
    break;
  }
  const pending = db
    .select()
    .from(gamesTable)
    .where(and(eq(gamesTable.seasonId, league.id), isNull(gamesTable.homeScore)))
    .all();
  for (const game of pending) {
    // Una serie decidida borra sus partidos sobrantes: no se escribe encima.
    const stillThere = db.select().from(gamesTable).where(eq(gamesTable.id, game.id)).get();
    if (!stillThere) {
      continue;
    }
    const homeWins = strength(game.homeTeamId) < strength(game.awayTeamId);
    db.update(gamesTable)
      .set({ homeScore: homeWins ? 104 : 96, awayScore: homeWins ? 96 : 104 })
      .where(eq(gamesTable.id, game.id))
      .run();
    if (game.seriesId) {
      season.getStandings('usa-1');
    }
  }
  season.getStandings('usa-1');
}
if (
  db.select().from(seasonsTable).where(eq(seasonsTable.id, league.id)).get()?.stage !== 'finished'
) {
  throw new Error('la temporada americana no ha llegado a terminar');
}

// El mejor de la plantilla, hundido: se ve en la plantilla y en su ficha.
const roster = db.select().from(playersTable).where(eq(playersTable.teamId, MANAGED_TEAM)).all();
const unhappy = [...roster].sort((a, b) => b.threePoint - a.threePoint)[0];
if (unhappy) {
  db.update(playersTable).set({ morale: 22 }).where(eq(playersTable.id, unhappy.id)).run();
}

const appDb = drizzle(new Database(join(DEV_DATA, 'app.sqlite')));
migrate(appDb, { migrationsFolder: resolve('drizzle/app') });
const now = new Date(Date.now() - 60_000);
appDb
  .insert(savesTable)
  .values({ id, name: NAME, fileName, createdAt: now, lastPlayedAt: now })
  .run();

console.log(`partida lista: ${fileName}`);
