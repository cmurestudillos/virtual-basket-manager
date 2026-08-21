import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { teamsTable } from './teams.schema';

/** Pizarra de cada equipo. Una fila por equipo; los rivales también tienen la suya. */
export const teamTacticsTable = sqliteTable('team_tactics', {
  teamId: text('team_id')
    .primaryKey()
    .references(() => teamsTable.id, { onDelete: 'cascade' }),
  offensiveSystem: text('offensive_system').notNull().default('motion'),
  defensiveSystem: text('defensive_system').notNull().default('manToMan'),
  pace: integer('pace').notNull().default(5),
  defensiveIntensity: integer('defensive_intensity').notNull().default(5),
  offensiveReboundEffort: integer('offensive_rebound_effort').notNull().default(5),
  /** Referencia ofensiva del equipo; nulo = reparto sin estrella designada. */
  focusPlayerId: text('focus_player_id')
});

export type TeamTacticsRow = typeof teamTacticsTable.$inferSelect;
export type NewTeamTacticsRow = typeof teamTacticsTable.$inferInsert;
