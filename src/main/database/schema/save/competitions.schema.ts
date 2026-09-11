import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

/**
 * Competiciones: ligas, copas y competiciones continentales.
 *
 * Una sola tabla para las tres porque comparten casi todo (país, reglamento,
 * nivel) y se diferencian en `format`, que es lo que decide cómo se genera el
 * calendario. La alternativa —una tabla por tipo— obliga a triplicar cada
 * consulta de "competiciones en las que juega este equipo".
 */
export const competitionsTable = sqliteTable('competitions', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  shortName: text('short_name').notNull(),
  country: text('country').notNull(),
  /**
   * `EUR`, `AME` u `OCE`. Es lo que decide a qué competición continental puede
   * ir un club: sin esto habría que mantener una lista de países a mano en el
   * código, y el día que entre otro país habría que acordarse de tocarla.
   */
  continent: text('continent').notNull().default('EUR'),
  /** `fiba` o `nba`: decide duración de cuartos, faltas y posesión. */
  rulesetId: text('ruleset_id').notNull().default('fiba'),
  /** 1 = máxima categoría del país, 2 = segunda, etc. */
  tier: integer('tier').notNull().default(1),
  /** `league` (todos contra todos), `cup` (eliminatoria), `continental`. */
  format: text('format').notNull().default('league'),
  /**
   * Playoffs al final de la liga regular: número de equipos que los disputan.
   * 0 = el campeón es el primero de la fase regular, como en muchas ligas
   * europeas. Es la diferencia estructural más importante con el fútbol.
   */
  playoffTeams: integer('playoff_teams').notNull().default(0),
  /** Partidos de cada eliminatoria de playoff (3, 5 o 7). */
  playoffSeriesLength: integer('playoff_series_length').notNull().default(5)
});

export type CompetitionRow = typeof competitionsTable.$inferSelect;
export type NewCompetitionRow = typeof competitionsTable.$inferInsert;
