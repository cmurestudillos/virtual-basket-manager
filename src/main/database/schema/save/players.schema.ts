import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { teamsTable } from './teams.schema';

/**
 * Jugadores.
 *
 * Los 21 atributos van en columnas propias y no en un JSON: el juego ordena y
 * filtra por ellos constantemente (mejores triplistas del mercado, mejor
 * reboteador libre) y con un blob habría que leer la tabla entera en memoria
 * para cualquiera de esas consultas.
 */
export const playersTable = sqliteTable('players', {
  id: text('id').primaryKey(),
  /** Nulo = agente libre. */
  teamId: text('team_id').references(() => teamsTable.id, { onDelete: 'set null' }),
  firstName: text('first_name').notNull(),
  lastName: text('last_name').notNull(),
  nationality: text('nationality').notNull(),
  birthDate: integer('birth_date', { mode: 'timestamp_ms' }).notNull(),
  /** Posición natural: PG, SG, SF, PF o C. */
  position: text('position').notNull(),
  /** Segunda posición que puede ocupar sin penalización grande. Opcional. */
  secondaryPosition: text('secondary_position'),
  heightCm: integer('height_cm').notNull(),
  weightKg: integer('weight_kg').notNull(),
  /** Envergadura: en baloncesto explica tapones y robos mejor que la altura. */
  wingspanCm: integer('wingspan_cm').notNull(),
  photo: text('photo'),

  // --- Atributos (1-99) ---
  close: integer('close').notNull(),
  midRange: integer('mid_range').notNull(),
  threePoint: integer('three_point').notNull(),
  freeThrow: integer('free_throw').notNull(),
  finishing: integer('finishing').notNull(),
  passing: integer('passing').notNull(),
  handling: integer('handling').notNull(),
  driving: integer('driving').notNull(),
  perimeterDefense: integer('perimeter_defense').notNull(),
  interiorDefense: integer('interior_defense').notNull(),
  steal: integer('steal').notNull(),
  block: integer('block').notNull(),
  offensiveRebound: integer('offensive_rebound').notNull(),
  defensiveRebound: integer('defensive_rebound').notNull(),
  speed: integer('speed').notNull(),
  strength: integer('strength').notNull(),
  jumping: integer('jumping').notNull(),
  stamina: integer('stamina').notNull(),
  basketballIq: integer('basketball_iq').notNull(),
  consistency: integer('consistency').notNull(),
  aggression: integer('aggression').notNull(),

  // --- Estado ---
  /** Techo al que puede llegar su media, 1-99. */
  potential: integer('potential').notNull(),
  /** Forma física 0-100 con la que llega al siguiente partido. */
  condition: integer('condition').notNull().default(100),
  morale: integer('morale').notNull().default(70),
  /**
   * Días de baja que le quedan; 0 = disponible.
   *
   * En días del calendario y no en partidos: una baja de tres semanas se lleva
   * tres jornadas de liga, pero seis partidos de playoff.
   */
  injuryDaysLeft: integer('injury_days_left').notNull().default(0),
  /** Qué tiene: «Esguince de tobillo». Nulo si está sano. */
  injuryName: text('injury_name'),
  /** Foco de entrenamiento propio; nulo = el del bloque. */
  trainingFocus: text('training_focus'),

  // --- Contrato ---
  wageCents: integer('wage_cents').notNull().default(0),
  contractUntil: integer('contract_until', { mode: 'timestamp_ms' }),
  valueCents: integer('value_cents').notNull().default(0)
});

export type PlayerRow = typeof playersTable.$inferSelect;
export type NewPlayerRow = typeof playersTable.$inferInsert;
