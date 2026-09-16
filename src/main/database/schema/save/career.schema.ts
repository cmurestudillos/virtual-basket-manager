import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
import { teamsTable } from './teams.schema';

/**
 * Las etapas del entrenador: qué club dirigió y entre qué temporadas.
 *
 * Esto **sí** hay que guardarlo, a diferencia del resto del historial, que se
 * calcula. Cuando un entrenador cambia de club no queda en ninguna parte quién
 * dirigía qué el año pasado: la partida sólo sabe a quién diriges hoy, y sin
 * estas filas el palmarés le atribuiría al entrenador los títulos que ganó su
 * antecesor en el club nuevo.
 *
 * Una fila por etapa, con `end_season` a nulo mientras está en curso.
 */
export const careerSpellsTable = sqliteTable(
  'career_spells',
  {
    id: text('id').primaryKey(),
    teamId: text('team_id')
      .notNull()
      .references(() => teamsTable.id, { onDelete: 'cascade' }),
    /** Primera temporada al frente del club. */
    startSeason: integer('start_season').notNull(),
    /** Última; nulo mientras sigue dirigiéndolo. */
    endSeason: integer('end_season'),
    /** `dismissed` si le echaron, `left` si se fue por su pie. */
    endReason: text('end_reason')
  },
  (table) => [index('idx_career_spells_team').on(table.teamId)]
);

export type CareerSpellRow = typeof careerSpellsTable.$inferSelect;
export type NewCareerSpellRow = typeof careerSpellsTable.$inferInsert;
