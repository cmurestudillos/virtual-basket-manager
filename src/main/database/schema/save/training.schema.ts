import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { teamsTable } from './teams.schema';

/**
 * Plan de entrenamiento de un equipo: qué se trabaja y a qué ritmo.
 *
 * Una fila por equipo, los de la IA incluidos —si no, sus plantillas se
 * quedarían congeladas mientras la del usuario crece— y el foco de cada jugador
 * se guarda en su propia ficha, porque la excepción es individual y el plan es
 * del bloque.
 */
export const teamTrainingTable = sqliteTable('team_training', {
  teamId: text('team_id')
    .primaryKey()
    .references(() => teamsTable.id, { onDelete: 'cascade' }),
  /** Intensidad 1-10: mejora más rápido, cansa más y lesiona más. */
  intensity: integer('intensity').notNull().default(5),
  /** Foco del bloque; cada jugador puede tener el suyo. */
  focus: text('focus').notNull().default('balanced')
});

export type TeamTrainingRow = typeof teamTrainingTable.$inferSelect;
export type NewTeamTrainingRow = typeof teamTrainingTable.$inferInsert;
