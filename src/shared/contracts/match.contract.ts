import type { Position } from '@shared/domain/positions';

export interface BoxScoreLine {
  playerId: string;
  playerName: string;
  position: Position;
  /** Puesto en la rotación: 0-4 son los titulares. */
  depth: number;
  secondsPlayed: number;
  points: number;
  twoPointMade: number;
  twoPointAttempted: number;
  threePointMade: number;
  threePointAttempted: number;
  freeThrowMade: number;
  freeThrowAttempted: number;
  offensiveRebounds: number;
  defensiveRebounds: number;
  assists: number;
  steals: number;
  blocks: number;
  turnovers: number;
  fouls: number;
  plusMinus: number;
  /** Valoración ACB, derivada del resto de la línea. */
  efficiency: number;
}

export interface MatchTeamState {
  teamId: string;
  teamName: string;
  score: number;
  boxScores: BoxScoreLine[];
}

export interface PeriodScoreEntry {
  period: number;
  home: number;
  away: number;
}

/**
 * Estado del partido tal y como lo ve la pantalla, sea a mitad de partido o al
 * final. La misma forma sirve para la previa (cero cuartos jugados), para cada
 * parón entre cuartos y para el acta de un partido ya archivado.
 */
export interface MatchState {
  gameId: string;
  round: number;
  /** «Jornada 12» o «Semifinales · 3er partido»: lo que se lee en la cabecera. */
  roundLabel: string;
  scheduledOn: number;
  home: MatchTeamState;
  away: MatchTeamState;
  periods: PeriodScoreEntry[];
  /** Cuartos ya jugados. */
  playedPeriods: number;
  /** Cuartos del reglamento, sin contar prórrogas. */
  regulationPeriods: number;
  finished: boolean;
  /** Cuál de los dos es el equipo del usuario; `null` en un partido ajeno. */
  managedSide: 'home' | 'away' | null;
}

export interface MatchApi {
  /** Prepara el partido del usuario y devuelve la previa (sin jugar nada). */
  start: (gameId: string) => Promise<MatchState>;
  /** Juega el siguiente cuarto. Al acabar el partido lo guarda. */
  advancePeriod: (gameId: string) => Promise<MatchState>;
  /** Acta de un partido ya jugado. */
  get: (gameId: string) => Promise<MatchState | null>;
}
