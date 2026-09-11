import { z } from 'zod';
import type { Position } from '@shared/domain/positions';
import { LEADER_CATEGORY_LABELS, type LeaderCategory } from '@shared/domain/season-stats';

export const leaderCategorySchema = z.enum(
  Object.keys(LEADER_CATEGORY_LABELS) as [LeaderCategory, ...LeaderCategory[]]
);

export const leadersRequestSchema = z.object({
  category: leaderCategorySchema,
  limit: z.number().int().min(1).max(50).default(10)
});

export type LeadersRequest = z.input<typeof leadersRequestSchema>;

/**
 * Fila de estadística de temporada de un jugador.
 *
 * Lleva los totales y las medias ya calculadas: las medias son derivadas y no
 * se guardan en ninguna parte, así que si no viajan aquí la pantalla tendría
 * que repetir la división —y el redondeo— por su cuenta.
 */
export interface PlayerSeasonStats {
  playerId: string;
  playerName: string;
  teamId: string;
  teamName: string;
  position: Position;
  games: number;
  minutesPerGame: number;
  pointsPerGame: number;
  reboundsPerGame: number;
  assistsPerGame: number;
  stealsPerGame: number;
  blocksPerGame: number;
  turnoversPerGame: number;
  efficiencyPerGame: number;
  points: number;
  rebounds: number;
  assists: number;
  steals: number;
  blocks: number;
  turnovers: number;
  fouls: number;
  plusMinus: number;
  twoPointMade: number;
  twoPointAttempted: number;
  threePointMade: number;
  threePointAttempted: number;
  freeThrowMade: number;
  freeThrowAttempted: number;
  twoPointPercentage: number;
  threePointPercentage: number;
  freeThrowPercentage: number;
}

export interface LeaderBoard {
  category: LeaderCategory;
  label: string;
  /** Partidos mínimos exigidos para aparecer, como en la ACB. */
  minimumGames: number;
  entries: { rank: number; value: number; player: PlayerSeasonStats }[];
}

export interface StatsApi {
  /** Medias de temporada de una plantilla, ordenadas por valoración. */
  teamSeason: (teamId: string) => Promise<PlayerSeasonStats[]>;
  /** Líderes de la liga en una categoría. */
  leaders: (category: string, limit?: number) => Promise<LeaderBoard>;
}
