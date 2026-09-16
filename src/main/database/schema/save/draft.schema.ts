import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
import { competitionsTable } from './competitions.schema';
import { playersTable } from './players.schema';
import { teamsTable } from './teams.schema';

/**
 * El draft de la liga de formato NBA: una fila por elección.
 *
 * El orden se fija al sortear la lotería y el jugador se rellena al elegir,
 * así que el draft se puede dejar a medias —esperando la elección del usuario—
 * y retomarlo después sin perder nada.
 */
export const draftPicksTable = sqliteTable(
  'draft_picks',
  {
    id: text('id').primaryKey(),
    competitionId: text('competition_id')
      .notNull()
      .references(() => competitionsTable.id, { onDelete: 'cascade' }),
    seasonNumber: integer('season_number').notNull(),
    round: integer('round').notNull(),
    /** Elección global: 1-30 la primera ronda, 31-60 la segunda. */
    pick: integer('pick').notNull(),
    teamId: text('team_id')
      .notNull()
      .references(() => teamsTable.id, { onDelete: 'cascade' }),
    playerId: text('player_id').references(() => playersTable.id, { onDelete: 'set null' }),
    /** La consiguió en el sorteo, no por clasificación. */
    lotteryWinner: integer('lottery_winner', { mode: 'boolean' }).notNull().default(false),
    /** Se eligió y no había nadie que mereciera la pena, o se renunció. */
    passed: integer('passed', { mode: 'boolean' }).notNull().default(false)
  },
  (table) => [index('idx_draft_picks_season').on(table.seasonNumber)]
);

export type DraftPickRow = typeof draftPicksTable.$inferSelect;
