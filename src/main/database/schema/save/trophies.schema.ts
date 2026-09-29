import { sqliteTable, text, integer, real, index, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { seasonsTable } from './seasons.schema';

/**
 * Los trofeos (2026-09-29): lo que el juego tiene que enseñar al mánager y los
 * premios de fin de temporada.
 *
 * El palmarés **no** vive aquí: sigue saliendo de `seasons.champion_team_id`,
 * que es lo que permite que una partida vieja vea sus títulos en la vitrina sin
 * migrar nada. Esto guarda lo que no se puede deducir: qué pantalla de campeón
 * queda por enseñar y quién ganó cada premio.
 */

/**
 * Una pantalla de campeón pendiente —título, ascenso o gala—, sólo del club o
 * de la selección que dirige el usuario. Que gane un rival es un correo, no
 * una celebración.
 *
 * Un título se gana dentro del avance del calendario, sin nadie mirando: se
 * apunta aquí y la pantalla sale la próxima vez que la interfaz pregunta.
 * `seen_on` es lo que impide que salga dos veces. El índice único
 * (`season_id`, `kind`) hace que reintentar un avance no apunte la misma copa
 * otra vez: cada temporada es una competición, y en ella sólo se gana una.
 */
export const celebrationsTable = sqliteTable(
  'celebrations',
  {
    id: text('id').primaryKey(),
    /** `CelebrationKind`: `title`, `promotion` o `season_gala`. */
    kind: text('kind').notNull(),
    /** `TrophyKind`: qué copa se levanta en la pantalla. */
    trophyKind: text('trophy_kind').notNull(),
    /** La temporada de la competición ganada; en el ascenso, la de la división de la que se sube. */
    seasonId: text('season_id')
      .notNull()
      .references(() => seasonsTable.id, { onDelete: 'cascade' }),
    competitionId: text('competition_id').notNull(),
    teamId: text('team_id').notNull(),
    /** Congelado: el club puede cambiar de nombre en el editor y la copa se ganó con este. */
    teamName: text('team_name').notNull(),
    /** Lo que se ha ganado; en el ascenso, la división a la que se sube. */
    competitionName: text('competition_name').notNull(),
    /** El día de juego en que ocurrió. */
    happenedOn: integer('happened_on', { mode: 'timestamp_ms' }).notNull(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    /** `null` mientras está por enseñar. */
    seenOn: integer('seen_on', { mode: 'timestamp_ms' })
  },
  (table) => [
    uniqueIndex('celebrations_season_kind_idx').on(table.seasonId, table.kind),
    index('celebrations_seen_on_idx').on(table.seenOn)
  ]
);

/**
 * Los premios de fin de temporada de una liga: MVP, líderes, mejor defensor,
 * mejor joven, entrenador del año, MVP de la final y el quinteto ideal (cinco
 * filas, `slot` 0..4 de base a pívot). De **todas** las ligas que se juegan.
 *
 * Los nombres van congelados a propósito: un premio es un hecho histórico y se
 * tiene que seguir leyendo cuando el jugador se haya retirado o el club haya
 * bajado de categoría. El índice único hace idempotente la entrega.
 */
export const seasonAwardsTable = sqliteTable(
  'season_awards',
  {
    id: text('id').primaryKey(),
    seasonId: text('season_id')
      .notNull()
      .references(() => seasonsTable.id, { onDelete: 'cascade' }),
    competitionId: text('competition_id').notNull(),
    /** `SeasonAwardType`. */
    type: text('type').notNull(),
    /** `null` en el entrenador del año. */
    playerId: text('player_id'),
    playerName: text('player_name'),
    /** Sólo en el entrenador del año. */
    coachId: text('coach_id'),
    coachName: text('coach_name'),
    /** Bandera de quien lo gana, para la gala. */
    nationality: text('nationality'),
    teamId: text('team_id').notNull(),
    teamName: text('team_name').notNull(),
    /** La cifra del premio, en sus unidades (ver `SeasonAwardWinner.value`). */
    value: real('value').notNull(),
    /** 0 en los premios sueltos; 0..4 en el quinteto ideal. */
    slot: integer('slot').notNull().default(0),
    /** Sólo en el quinteto ideal: `PG` … `C`. */
    position: text('position'),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull()
  },
  (table) => [uniqueIndex('season_awards_unique_idx').on(table.seasonId, table.type, table.slot)]
);

export type CelebrationRow = typeof celebrationsTable.$inferSelect;
export type NewCelebrationRow = typeof celebrationsTable.$inferInsert;
export type SeasonAwardRow = typeof seasonAwardsTable.$inferSelect;
export type NewSeasonAwardRow = typeof seasonAwardsTable.$inferInsert;
