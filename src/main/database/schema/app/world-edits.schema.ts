import { integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core';

/**
 * Las ediciones del mundo base: lo que el usuario ha cambiado de clubes y
 * jugadores respecto al dataset con el que se distribuye el juego.
 *
 * Viven en la base de la aplicación y no en el dataset porque el dataset, una
 * vez instalado el juego, está en una carpeta de sólo lectura. Y viven **como
 * parches** —sólo los campos cambiados— para que el original siga intacto: se
 * puede restaurar, y una versión nueva del juego con un dataset corregido no
 * pisa lo que el usuario editó ni lo que el usuario editó pisa el resto.
 *
 * Una fila por club o jugador editado. Se aplican al crear cada partida nueva;
 * las ya empezadas no cambian.
 */
export const worldEditsTable = sqliteTable(
  'world_edits',
  {
    /** `team` o `player`. */
    entityType: text('entity_type').notNull(),
    entityId: text('entity_id').notNull(),
    /** Los campos cambiados, en JSON. */
    data: text('data').notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull()
  },
  (table) => [primaryKey({ columns: [table.entityType, table.entityId] })]
);

export type WorldEditRow = typeof worldEditsTable.$inferSelect;
export type NewWorldEditRow = typeof worldEditsTable.$inferInsert;
