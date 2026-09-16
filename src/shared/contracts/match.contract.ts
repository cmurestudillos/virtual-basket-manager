import type { PlayLine } from '@shared/domain/play-by-play';
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
  /** Lo que dura un cuarto, en segundos: diez minutos en FIBA, doce en la NBA. */
  periodSeconds: number;
  /** Y lo que dura una prórroga. */
  overtimeSeconds: number;
  finished: boolean;
  /** Cuál de los dos es el equipo del usuario; `null` en un partido ajeno. */
  managedSide: 'home' | 'away' | null;
  /**
   * Lo que el analista ha sacado del rival. `null` si no hay analista, si no
   * llega al nivel que hace falta o si el partido no es del usuario.
   */
  scouting: MatchScouting | null;
  /**
   * La retransmisión jugada a jugada de lo disputado hasta ahora. `null` en el
   * acta de un partido ajeno: de esos sólo se guarda el resultado.
   */
  playByPlay: PlayLine[] | null;
}

/** Informe del analista sobre el rival, para la previa. */
export interface MatchScouting {
  teamId: string;
  teamName: string;
  offensiveSystem: string;
  defensiveSystem: string;
  pace: number;
  defensiveIntensity: number;
  /** Su referencia ofensiva, si tienen una designada. */
  focusPlayerName: string | null;
}

/** Un convocado visto desde el banquillo mientras el partido está en juego. */
export interface LiveBenchPlayer {
  playerId: string;
  playerName: string;
  /** Posición natural: la de su ficha. */
  position: Position;
  /** El hueco que ocupa ahora, que puede no ser el suyo. */
  playedPosition: Position;
  onCourt: boolean;
  fouls: number;
  fouledOut: boolean;
  /** Piernas que le quedan, 0-100. Lo que decide si toca sentarlo. */
  freshness: number;
  secondsPlayed: number;
  points: number;
}

/**
 * Una posesión de partido en vivo, tal y como llega a la pantalla.
 *
 * No trae el acta entera ni toda la retransmisión: son ciento y pico
 * posesiones por partido y mandar el partido completo en cada una sería tirar
 * el trabajo del códec por la ventana. Llegan las jugadas nuevas y lo que hace
 * falta para decidir: marcador, reloj y banquillo.
 */
export interface LiveTick {
  gameId: string;
  period: number;
  /** Segundos que le quedan al cuarto. */
  clockSeconds: number;
  homeScore: number;
  awayScore: number;
  /** Las jugadas que ha dejado esta posesión, ya narradas. */
  lines: PlayLine[];
  /** Con esta posesión se acabó el cuarto. */
  periodEnded: boolean;
  /** Y con él, el partido: toca leer el acta guardada. */
  finished: boolean;
  /** El banquillo del usuario. `null` en un partido que no es suyo. */
  bench: LiveBenchPlayer[] | null;
  timeoutsLeft: number;
  rivalTimeoutsLeft: number;
  /** Si la rotación sigue en manos del motor o la lleva ya el entrenador. */
  autoRotation: boolean;
}

/** Respuesta a una orden del banquillo: el «no» llega con su motivo. */
export interface LiveOrderResult {
  ok: boolean;
  /** Qué ha impedido la orden. `null` si salió bien. */
  reason: string | null;
  /** El banquillo tal y como queda tras la orden. */
  tick: LiveTick | null;
}

/** Lo que se le puede tocar a la pizarra sin parar el partido. */
export interface LiveTacticsPatch {
  offensiveSystem?: string;
  defensiveSystem?: string;
  pace?: number;
  defensiveIntensity?: number;
}

export interface MatchApi {
  /** Prepara el partido del usuario y devuelve la previa (sin jugar nada). */
  start: (gameId: string) => Promise<MatchState>;
  /** Juega el siguiente cuarto. Al acabar el partido lo guarda. */
  advancePeriod: (gameId: string) => Promise<MatchState>;
  /** Acta de un partido ya jugado. */
  get: (gameId: string) => Promise<MatchState | null>;
  /** El partido como va ahora: sirve con el partido a medias y con el acabado. */
  snapshot: (gameId: string) => Promise<MatchState | null>;
  /** Juega **una posesión** del partido en vivo. */
  advancePossession: (gameId: string) => Promise<LiveTick>;
  /** Cambio ordenado desde el banquillo. */
  substitute: (gameId: string, outgoingId: string, incomingId: string) => Promise<LiveOrderResult>;
  /** Tiempo muerto del equipo del usuario. */
  callTimeout: (gameId: string) => Promise<LiveOrderResult>;
  /** Toca la pizarra sin parar el partido. */
  setLiveTactics: (gameId: string, patch: LiveTacticsPatch) => Promise<LiveOrderResult>;
  /** Devuelve la rotación al motor, o se la quita. */
  setAutoRotation: (gameId: string, enabled: boolean) => Promise<LiveOrderResult>;
}
