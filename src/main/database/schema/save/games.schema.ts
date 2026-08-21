import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { seasonsTable } from './seasons.schema';
import { teamsTable } from './teams.schema';

/**
 * Partidos. Cubre tanto los de liga regular como los de eliminatoria: una
 * serie de playoff son varias filas con el mismo `seriesId` y `seriesGame`
 * distinto, en vez de una tabla aparte.
 */
export const gamesTable = sqliteTable('games', {
  id: text('id').primaryKey(),
  seasonId: text('season_id')
    .notNull()
    .references(() => seasonsTable.id, { onDelete: 'cascade' }),
  round: integer('round').notNull(),
  homeTeamId: text('home_team_id')
    .notNull()
    .references(() => teamsTable.id, { onDelete: 'cascade' }),
  awayTeamId: text('away_team_id')
    .notNull()
    .references(() => teamsTable.id, { onDelete: 'cascade' }),
  homeScore: integer('home_score'),
  awayScore: integer('away_score'),
  /** Parciales de cada cuarto/prórroga, en JSON: `[{period,home,away}]`. */
  periodScores: text('period_scores'),
  overtimes: integer('overtimes').notNull().default(0),
  playedOn: integer('played_on', { mode: 'timestamp_ms' }),
  /** Cancha neutral: Copa y Final Four. */
  neutralVenue: integer('neutral_venue', { mode: 'boolean' }).notNull().default(false),
  /** Semilla con la que se simuló: permite reproducir el partido tal cual. */
  seed: integer('seed'),
  /** Eliminatoria a la que pertenece, si la hay. */
  seriesId: text('series_id'),
  /** Número de partido dentro de la eliminatoria (1..7). */
  seriesGame: integer('series_game')
});

export type GameRow = typeof gamesTable.$inferSelect;
export type NewGameRow = typeof gamesTable.$inferInsert;
