import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
import { gamesTable } from './games.schema';

/**
 * Los avisos de la bandeja.
 *
 * Se guardan —no se recalculan como el historial— porque un aviso es algo que
 * pasó **en un momento**: la lesión de octubre ya no se ve en la plantilla de
 * enero, y sin la fila no habría forma de contarla. Llevan la ruta a la que
 * mandan para que pulsar uno te lleve a donde se decide.
 */
export const inboxMessagesTable = sqliteTable(
  'inbox_messages',
  {
    id: text('id').primaryKey(),
    /** Fecha del juego en que se detectó. */
    createdOn: integer('created_on', { mode: 'timestamp_ms' }).notNull(),
    seasonNumber: integer('season_number').notNull(),
    /** `injury`, `board`, `press`… ver el dominio de la bandeja. */
    category: text('category').notNull(),
    title: text('title').notNull(),
    body: text('body').notNull(),
    /** Nombre de la ruta a la que lleva; nulo si es sólo informativo. */
    routeName: text('route_name'),
    /** Parámetros de la ruta, en JSON. */
    routeParams: text('route_params'),
    read: integer('read', { mode: 'boolean' }).notNull().default(false),
    /** Si es el aviso de una rueda de prensa, cuál. */
    pressConferenceId: text('press_conference_id')
  },
  (table) => [index('idx_inbox_created').on(table.createdOn)]
);

/**
 * Las ruedas de prensa: la pregunta que te hicieron y lo que contestaste.
 *
 * Sólo se puede contestar la última: en cuanto hay otra, la anterior caduca.
 * Contestar tres semanas tarde a lo de una racha que ya acabó no tendría
 * sentido, y dejarlas acumular convertiría la prensa en un trámite.
 */
export const pressConferencesTable = sqliteTable('press_conferences', {
  id: text('id').primaryKey(),
  gameId: text('game_id').references(() => gamesTable.id, { onDelete: 'set null' }),
  createdOn: integer('created_on', { mode: 'timestamp_ms' }).notNull(),
  /** Tema, que decide las respuestas posibles. */
  topic: text('topic').notNull(),
  question: text('question').notNull(),
  /** Tono elegido; nulo mientras no se conteste. */
  answerTone: text('answer_tone'),
  /** La frase con la que la grada y el consejo se tomaron la respuesta. */
  reaction: text('reaction'),
  expired: integer('expired', { mode: 'boolean' }).notNull().default(false)
});

export type InboxMessageRow = typeof inboxMessagesTable.$inferSelect;
export type NewInboxMessageRow = typeof inboxMessagesTable.$inferInsert;
export type PressConferenceRow = typeof pressConferencesTable.$inferSelect;
export type NewPressConferenceRow = typeof pressConferencesTable.$inferInsert;
