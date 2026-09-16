import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
import { playersTable } from './players.schema';
import { seasonsTable } from './seasons.schema';
import { teamsTable } from './teams.schema';

/**
 * Las selecciones.
 *
 * Una selección es un equipo más —fila en `teams` con `national_of`— para que
 * el motor, la alineación, la pizarra y la pantalla de partido sirvan tal cual.
 * Lo que la distingue es que no tiene plantilla propia: sus jugadores siguen en
 * sus clubes y juegan con ella cuando están **convocados**.
 */

/** Los doce de cada selección en cada ventana. */
export const nationalCallupsTable = sqliteTable(
  'national_callups',
  {
    id: text('id').primaryKey(),
    nationalTeamId: text('national_team_id')
      .notNull()
      .references(() => teamsTable.id, { onDelete: 'cascade' }),
    playerId: text('player_id')
      .notNull()
      .references(() => playersTable.id, { onDelete: 'cascade' }),
    seasonNumber: integer('season_number').notNull(),
    /** `november`, `february` o `summer`. */
    window: text('window').notNull()
  },
  (table) => [
    index('idx_national_callups_window').on(table.seasonNumber, table.window),
    index('idx_national_callups_player').on(table.playerId)
  ]
);

/** En qué grupo cae cada selección, en la clasificación y en el Mundial. */
export const nationalGroupsTable = sqliteTable(
  'national_groups',
  {
    id: text('id').primaryKey(),
    seasonId: text('season_id')
      .notNull()
      .references(() => seasonsTable.id, { onDelete: 'cascade' }),
    groupName: text('group_name').notNull(),
    teamId: text('team_id')
      .notNull()
      .references(() => teamsTable.id, { onDelete: 'cascade' }),
    /** Bombo del que salió: 1 el de las mejores. */
    pot: integer('pot').notNull()
  },
  (table) => [index('idx_national_groups_season').on(table.seasonId)]
);

/**
 * Las etapas del usuario como seleccionador. Van aparte de las de club porque
 * se solapan con ellas: se puede dirigir un club y una selección a la vez.
 */
export const nationalSpellsTable = sqliteTable('national_spells', {
  id: text('id').primaryKey(),
  teamId: text('team_id')
    .notNull()
    .references(() => teamsTable.id, { onDelete: 'cascade' }),
  startSeason: integer('start_season').notNull(),
  endSeason: integer('end_season'),
  /** `dismissed`, `left`, o nulo mientras dura. */
  endReason: text('end_reason')
});

export type NationalCallupRow = typeof nationalCallupsTable.$inferSelect;
export type NationalGroupRow = typeof nationalGroupsTable.$inferSelect;
export type NationalSpellRow = typeof nationalSpellsTable.$inferSelect;
