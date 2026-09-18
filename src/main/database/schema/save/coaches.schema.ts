import { sqliteTable, text, integer, real, index } from 'drizzle-orm/sqlite-core';
import { competitionsTable } from './competitions.schema';
import { teamsTable } from './teams.schema';

/**
 * Los entrenadores: los de la IA y el del usuario, en una misma tabla.
 *
 * `teamId` nulo es un entrenador libre: la bolsa de la que fichan los clubes
 * es esta misma tabla sin equipo, igual que el mercado de técnicos. El usuario
 * es la fila `manager`, sin fecha de nacimiento, con el nombre y la bandera de
 * `game_state`. La reputación no se guarda —sale del historial—; sí la de
 * partida, que es lo único que no se puede deducir de nada.
 */
export const coachesTable = sqliteTable(
  'coaches',
  {
    id: text('id').primaryKey(),
    /** Su club; nulo = libre (o retirado). */
    teamId: text('team_id').references(() => teamsTable.id, { onDelete: 'set null' }),
    firstName: text('first_name').notNull(),
    lastName: text('last_name').notNull(),
    /** Código de nacionalidad, para su bandera. */
    nationality: text('nationality').notNull().default('ESP'),
    /** Nula en el usuario, que no tiene edad en el juego. */
    birthDate: integer('birth_date', { mode: 'timestamp_ms' }),
    /** Lo que valía al entrar en la partida, 1-100. */
    baseReputation: integer('base_reputation').notNull().default(35),
    /** Retirado: ni entrena ni sale en el ranking, pero su historial se conserva. */
    retired: integer('retired', { mode: 'boolean' }).notNull().default(false)
  },
  (table) => [index('idx_coaches_team').on(table.teamId)]
);

/**
 * Los tramos en un banquillo: un entrenador, un club, una temporada.
 *
 * Una etapa de tres años son tres filas, y un despido en enero parte la
 * temporada del club en dos (la del que se va y la del que llega). Las fechas
 * dicen qué partidos son de quién: se cuentan los del club entre el inicio
 * (incluido) y el final (excluido), que es nulo mientras el tramo sigue.
 *
 * Las cifras se **congelan al cerrar el curso**: mientras se juega, salen en
 * vivo de los partidos; al empezar el siguiente se apuntan aquí y ya no se
 * recalculan, porque los clubes cambian de liga y de reputación y el pasado
 * tiene que quedarse como fue.
 */
export const coachSeasonsTable = sqliteTable(
  'coach_seasons',
  {
    id: text('id').primaryKey(),
    coachId: text('coach_id')
      .notNull()
      .references(() => coachesTable.id, { onDelete: 'cascade' }),
    teamId: text('team_id')
      .notNull()
      .references(() => teamsTable.id, { onDelete: 'cascade' }),
    seasonNumber: integer('season_number').notNull(),
    /** La liga del club esa temporada: la de después de los ascensos sería otra. */
    competitionId: text('competition_id')
      .notNull()
      .references(() => competitionsTable.id, { onDelete: 'cascade' }),
    startDate: integer('start_date', { mode: 'timestamp_ms' }).notNull(),
    /** Nula mientras sigue en el banquillo. */
    endDate: integer('end_date', { mode: 'timestamp_ms' }),
    /** `dismissed`, `left` o `retired`; nulo si siguió hasta el final del curso. */
    endReason: text('end_reason'),
    /** Si las cifras ya están congeladas (curso cerrado). */
    closed: integer('closed', { mode: 'boolean' }).notNull().default(false),
    games: integer('games').notNull().default(0),
    wins: integer('wins').notNull().default(0),
    /** Puesto final en la liga regular; nulo si no acabó el curso en el banquillo. */
    position: integer('position'),
    /** Equipos de la liga, para leer el puesto. */
    teams: integer('teams').notNull().default(0),
    tier: integer('tier').notNull().default(1),
    /** Reputación del club al cerrar el curso: es la que valora al entrenador. */
    clubReputation: integer('club_reputation').notNull().default(50),
    titles: integer('titles').notNull().default(0),
    /** Nombres de los títulos, en JSON (`["Liga", "Copa"]`). */
    titleNames: text('title_names').notNull().default('[]'),
    points: real('points').notNull().default(0)
  },
  (table) => [
    index('idx_coach_seasons_coach').on(table.coachId),
    index('idx_coach_seasons_season').on(table.seasonNumber)
  ]
);

export type CoachRow = typeof coachesTable.$inferSelect;
export type NewCoachRow = typeof coachesTable.$inferInsert;
export type CoachSeasonRow = typeof coachSeasonsTable.$inferSelect;
export type NewCoachSeasonRow = typeof coachSeasonsTable.$inferInsert;
