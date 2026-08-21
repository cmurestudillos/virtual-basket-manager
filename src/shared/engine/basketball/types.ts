import type { PlayerAttributes } from '@shared/domain/attributes';
import type { PlayerBoxScore } from '@shared/domain/box-score';
import type { Position } from '@shared/domain/positions';
import type { Ruleset } from '@shared/domain/rulesets';
import type { TeamTactics } from '@shared/domain/tactics';

/** Jugador tal y como lo ve el motor: sin nada de base de datos ni de UI. */
export interface EnginePlayer {
  id: string;
  name: string;
  /** Posición natural. La que juega sale de la alineación. */
  position: Position;
  attributes: PlayerAttributes;
  /** Forma física con la que llega al partido, 0-100. */
  condition: number;
}

export interface EngineTeam {
  id: string;
  name: string;
  /** Convocados (12 en FIBA). El motor no elige convocatoria, la recibe hecha. */
  players: EnginePlayer[];
  /** Cinco inicial: ids en orden PG, SG, SF, PF, C. */
  starters: readonly string[];
  tactics: TeamTactics;
}

export interface SimulateGameInput {
  /** Identificador del partido; también sirve de semilla si no se pasa `seed`. */
  gameId: string;
  home: EngineTeam;
  away: EngineTeam;
  ruleset: Ruleset;
  /** Semilla explícita. Si falta, se deriva de `gameId`. */
  seed?: number;
  /** Cancha neutral: elimina la ventaja de jugar en casa (Copa, Final Four). */
  neutralVenue?: boolean;
}

export type GameEventType =
  | 'twoPointMade'
  | 'twoPointMissed'
  | 'threePointMade'
  | 'threePointMissed'
  | 'freeThrowMade'
  | 'freeThrowMissed'
  | 'offensiveRebound'
  | 'defensiveRebound'
  | 'assist'
  | 'steal'
  | 'block'
  | 'turnover'
  | 'foul'
  | 'foulOut'
  | 'substitution'
  | 'periodStart'
  | 'periodEnd';

/**
 * Una jugada del acta. La lista completa es lo que permitirá más adelante
 * reproducir el partido en directo (marcador que sube jugada a jugada) sin que
 * el resultado dependa de si el usuario lo ve o no.
 */
export interface GameEvent {
  /** 1..N; los valores por encima de `ruleset.periods` son prórrogas. */
  period: number;
  /** Segundos restantes del cuarto cuando ocurre. */
  clockSeconds: number;
  type: GameEventType;
  teamId: string;
  playerId: string | null;
  /** Segundo jugador implicado: asistente, robado, sustituto. */
  secondaryPlayerId?: string | null;
  /** Puntos que suma la jugada, si suma. */
  points?: number;
  homeScore: number;
  awayScore: number;
}

export interface PeriodScore {
  period: number;
  home: number;
  away: number;
}

export interface TeamGameResult {
  teamId: string;
  score: number;
  boxScores: PlayerBoxScore[];
  /** Faltas de equipo acumuladas en todo el partido. */
  teamFouls: number;
}

export interface GameResult {
  gameId: string;
  seed: number;
  home: TeamGameResult;
  away: TeamGameResult;
  periods: PeriodScore[];
  /** Número de prórrogas jugadas (0 si el partido acabó en el reglamentario). */
  overtimes: number;
  events: GameEvent[];
}
