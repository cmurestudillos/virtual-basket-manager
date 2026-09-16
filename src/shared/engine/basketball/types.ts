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
  /**
   * Minutos objetivo por jugador (id -> minutos de partido), tal y como los
   * reparte el entrenador en la pantalla de rotación. Si no viene, o suma cero,
   * el motor reparte por profundidad: los equipos que nadie ha tocado siguen
   * saliendo a jugar con una rotación razonable.
   */
  minutesTargets?: Readonly<Record<string, number>>;
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
  | 'timeout'
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
  /**
   * Desde dónde se tiró, en los tiros de campo y en los tapones. No sale del
   * azar: es el tipo de tiro que el motor ya había decidido, apuntado para
   * poder dibujarlo en la pista.
   */
  shotType?: ShotZone;
  /** Los cinco de cada equipo al empezar el cuarto, en su inicio. */
  lineups?: { home: string[]; away: string[] };
  homeScore: number;
  awayScore: number;
}

/** Zona de un tiro de campo. */
export type ShotZone = 'close' | 'midRange' | 'threePoint';

export interface PeriodScore {
  period: number;
  home: number;
  away: number;
}

/** Un convocado visto desde el banquillo, mientras el partido está en juego. */
export interface LivePlayer {
  playerId: string;
  onCourt: boolean;
  /** El hueco que ocupa ahora, que no tiene por qué ser su posición natural. */
  playedPosition: Position;
  fouls: number;
  fouledOut: boolean;
  /** Frescura 0-100: lo que le queda en las piernas ahora mismo. */
  freshness: number;
  secondsPlayed: number;
  points: number;
}

/** El banquillo de un equipo durante el partido: lo que el entrenador mira para decidir. */
export interface LiveBench {
  teamId: string;
  timeoutsLeft: number;
  /** Si la rotación sigue en manos del motor. */
  autoRotation: boolean;
  players: LivePlayer[];
}

/**
 * Respuesta a una orden del entrenador. El «no» lleva siempre su motivo: una
 * orden que se pierde en silencio es peor que una rechazada.
 */
export type OrderResult = { ok: true } | { ok: false; reason: string };

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
