import { z } from 'zod';

/**
 * Los entrenadores: los de la IA y el del usuario, en una misma tabla y un
 * mismo ranking.
 *
 * Todos los banquillos de club tienen entrenador. Los de la IA se inventan con
 * una semilla fija por club (sin palmarés inventado: lo que cuenta es lo que
 * hagan en la partida), se mueven solos —despidos, fichajes, retiradas— y se
 * miden con los mismos puntos que el usuario. Las selecciones no llevan
 * entrenador de la IA.
 */

/** El id del entrenador del usuario: el resto son `coach-…`. */
export const MANAGER_COACH_ID = 'manager';

/** Hasta dónde se mira el ranking. */
export type CoachRankingScope = 'world' | 'continent' | 'country' | 'competition';

export const coachRankingRequestSchema = z.object({
  scope: z.enum(['world', 'continent', 'country', 'competition']).default('world'),
  /**
   * Qué continente (`EUR`, `AME`, `OCE`), país (código) o competición (id).
   * Nulo en `world`.
   */
  id: z.string().min(1).nullable().default(null),
  page: z.number().int().min(1).default(1),
  /** Devuelve la página en la que está el usuario, en vez de `page`. */
  aroundManager: z.boolean().default(false)
});

export type CoachRankingRequest = z.input<typeof coachRankingRequestSchema>;

/** Una fila del ranking. */
export interface CoachRankingRow {
  /** Puesto dentro del alcance pedido. */
  rank: number;
  coachId: string;
  name: string;
  nationality: string;
  /** `null` en el usuario, que no tiene fecha de nacimiento. */
  age: number | null;
  isManager: boolean;
  /** Su club; `null` si está libre. */
  teamId: string | null;
  teamName: string | null;
  competitionName: string | null;
  /** 1-100; la pantalla la pinta en estrellas. */
  reputation: number;
  /** Puntos del ranking: los de este curso enteros y la mitad de los del anterior. */
  points: number;
  currentPoints: number;
  previousPoints: number;
  /** Partidos y victorias de este curso, en todos sus banquillos de club. */
  seasonGames: number;
  seasonWins: number;
  /** Títulos ganados en la partida, en toda su carrera. */
  titles: number;
}

/** Una opción del filtro del ranking. */
export interface CoachRankingFilterOption {
  id: string;
  label: string;
}

export interface CoachRankingPage {
  scope: CoachRankingScope;
  id: string | null;
  page: number;
  pageCount: number;
  pageSize: number;
  total: number;
  rows: CoachRankingRow[];
  /** La fila del usuario, esté o no en la página; `null` si no entra en el alcance. */
  managerRow: CoachRankingRow | null;
  /** Lo que se puede elegir en el filtro: sólo lo que tiene entrenadores. */
  filters: {
    continents: CoachRankingFilterOption[];
    countries: CoachRankingFilterOption[];
    competitions: CoachRankingFilterOption[];
  };
}

/** Por qué acabó una etapa en un banquillo. */
export type CoachStintEnd = 'dismissed' | 'left' | 'retired';

/** Una temporada en un banquillo, para el historial de la ficha. */
export interface CoachSeasonLine {
  seasonNumber: number;
  /** «2025-26». */
  seasonLabel: string;
  teamId: string;
  teamName: string;
  competitionName: string;
  tier: number;
  /** Puesto final en la liga regular; `null` si no acabó allí o sigue en juego. */
  position: number | null;
  teams: number;
  games: number;
  wins: number;
  /** Nombres de los títulos ganados («Liga Endesa», «Copa del Rey»). */
  titles: string[];
  points: number;
  /** Nulo si siguió hasta el final del curso (o si el curso sigue en juego). */
  endReason: CoachStintEnd | null;
  /** Si es el curso que se está jugando. */
  current: boolean;
}

/**
 * La ficha de un entrenador. La del usuario lleva además su selección y su
 * carrera; las acciones de carrera (dimitir, dejar la selección) siguen en
 * `CareerApi`.
 */
export interface CoachProfile {
  coachId: string;
  isManager: boolean;
  name: string;
  nationality: string;
  age: number | null;
  reputation: number;
  reputationLabel: string;
  /** Puesto en el ranking del mundo; `null` si está retirado. */
  worldRank: number | null;
  points: number;
  retired: boolean;
  team: {
    teamId: string;
    name: string;
    competitionName: string;
    country: string;
  } | null;
  /** Sólo en el usuario: la selección que dirige. */
  nationalTeamName: string | null;
  /** Sólo en el usuario: si la partida es de carrera. */
  careerMode: boolean;
  totals: {
    seasons: number;
    games: number;
    wins: number;
    titles: number;
  };
  /** Este curso, en todos sus banquillos de club. */
  current: { games: number; wins: number };
  /** Del curso más reciente al más antiguo. */
  history: CoachSeasonLine[];
  /** Los cinco primeros del mundo, para situarse. */
  topFive: CoachRankingRow[];
  /** La fila del usuario en el ranking del mundo, para ponerla debajo del top 5. */
  managerRow: CoachRankingRow | null;
}

export interface CoachesApi {
  ranking: (request: CoachRankingRequest) => Promise<CoachRankingPage>;
  /** Ficha de un entrenador; sin id, la del usuario. */
  getProfile: (coachId?: string | null) => Promise<CoachProfile>;
}
