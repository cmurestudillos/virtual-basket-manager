import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
import { gamesTable } from './games.schema';
import { playersTable } from './players.schema';
import { teamsTable } from './teams.schema';

/**
 * El acta: una fila por jugador y partido.
 *
 * Es la tabla que más crece de toda la partida (24 filas por partido) y de la
 * que sale absolutamente toda la estadística del juego, así que se guarda en
 * crudo: ni porcentajes ni valoración, que son derivados y se calculan al leer.
 */
export const gamePlayerStatsTable = sqliteTable(
  'game_player_stats',
  {
    id: text('id').primaryKey(),
    gameId: text('game_id')
      .notNull()
      .references(() => gamesTable.id, { onDelete: 'cascade' }),
    playerId: text('player_id')
      .notNull()
      .references(() => playersTable.id, { onDelete: 'cascade' }),
    teamId: text('team_id')
      .notNull()
      .references(() => teamsTable.id, { onDelete: 'cascade' }),
    secondsPlayed: integer('seconds_played').notNull().default(0),
    twoPointMade: integer('two_point_made').notNull().default(0),
    twoPointAttempted: integer('two_point_attempted').notNull().default(0),
    threePointMade: integer('three_point_made').notNull().default(0),
    threePointAttempted: integer('three_point_attempted').notNull().default(0),
    freeThrowMade: integer('free_throw_made').notNull().default(0),
    freeThrowAttempted: integer('free_throw_attempted').notNull().default(0),
    offensiveRebounds: integer('offensive_rebounds').notNull().default(0),
    defensiveRebounds: integer('defensive_rebounds').notNull().default(0),
    assists: integer('assists').notNull().default(0),
    steals: integer('steals').notNull().default(0),
    blocks: integer('blocks').notNull().default(0),
    turnovers: integer('turnovers').notNull().default(0),
    fouls: integer('fouls').notNull().default(0),
    foulsDrawn: integer('fouls_drawn').notNull().default(0),
    plusMinus: integer('plus_minus').notNull().default(0)
  },
  (table) => [
    index('idx_game_player_stats_game').on(table.gameId),
    index('idx_game_player_stats_player').on(table.playerId)
  ]
);

export type GamePlayerStatsRow = typeof gamePlayerStatsTable.$inferSelect;
export type NewGamePlayerStatsRow = typeof gamePlayerStatsTable.$inferInsert;
