import { overallForPosition } from '@shared/domain/attributes';
import { emptyPlayerBoxScore, type PlayerBoxScore } from '@shared/domain/box-score';
import { POSITIONS, type Position } from '@shared/domain/positions';
import { LINEUP_SIZE } from '@shared/domain/rotation';
import {
  DEFENSIVE_SYSTEM_PROFILES,
  OFFENSIVE_SYSTEM_PROFILES,
  type DefensiveSystemProfile,
  type OffensiveSystemProfile,
  type TeamTactics
} from '@shared/domain/tactics';
import { createRng, seedFromString, type Rng } from './rng';
import {
  effectiveAttribute,
  lineupAverage,
  reboundWeight,
  skillMultiplier,
  usageWeight,
  type OnCourtPlayer
} from './ratings';
import type {
  EngineTeam,
  GameEvent,
  GameEventType,
  GameResult,
  LiveBench,
  OrderResult,
  PeriodScore,
  SimulateGameInput
} from './types';

/**
 * Motor de partido v0.
 *
 * Simula posesión a posesión, que es la unidad natural del baloncesto y la
 * diferencia de fondo con el motor de fútbol: allí se sorteaban unos pocos
 * goles sobre una distribución; aquí hay entre 130 y 180 sucesos por partido y
 * el marcador es la suma de todos ellos, no una tirada. Eso es lo que hace que
 * el acta salga sola y sea coherente con el resultado.
 *
 * Todo es determinista: la misma entrada y la misma semilla dan siempre el
 * mismo partido, jugada por jugada.
 *
 * Calibrado para producir, con plantillas de nivel medio (~55), marcadores en
 * la horquilla FIBA de 70-90 puntos y repartos de tiro reconocibles. Las
 * constantes están agrupadas arriba a propósito: son la palanca de ajuste
 * cuando se compare contra estadística real.
 */

const BASE_POSSESSION_SECONDS = 17.5;
const MIN_POSSESSION_SECONDS = 4;
const BASE_TURNOVER_RATE = 0.125;
const BASE_MAKE_RATE: Record<ShotType, number> = {
  close: 0.585,
  midRange: 0.415,
  threePoint: 0.355
};
const SHOOTING_FOUL_RATE: Record<ShotType, number> = {
  close: 0.2,
  midRange: 0.09,
  threePoint: 0.055
};
const BLOCK_RATE: Record<ShotType, number> = {
  close: 0.055,
  midRange: 0.018,
  threePoint: 0.006
};
const NON_SHOOTING_FOUL_RATE = 0.16;
const BASE_ASSIST_RATE = 0.58;
const OFFENSIVE_REBOUND_TILT = 0.37;
const AND_ONE_RATE = 0.28;
const STEAL_SHARE_OF_TURNOVERS = 0.55;
const HOME_COURT_MULTIPLIER = 1.025;
/** Tope de segundas opciones seguidas: evita un bucle si el rebote ofensivo se dispara. */
const MAX_SECOND_CHANCES = 3;
/** Frescura que se pierde por posesión estando en pista, antes de ajustar por resistencia. */
const FATIGUE_DRAIN_PER_POSSESSION = 1;
/** Frescura que se recupera por posesión en el banquillo. */
const BENCH_RECOVERY_PER_POSSESSION = 1.3;
/** Por debajo de esta frescura, el entrenador busca recambio. */
const TIRED_THRESHOLD = 62;
/** Frescura mínima para que un suplente entre a pista en una rotación normal. */
const REST_THRESHOLD = 74;
/**
 * Tiempo mínimo en pista antes de que el entrenador saque a alguien sólo por
 * llevar minutos de más. Sin él, el que entraba ya iba sobrado de cuota y salía
 * en la posesión siguiente: 270 cambios por partido, un tercio de ellos
 * deshaciendo el anterior. No lo veía nadie hasta que hubo retransmisión.
 * El cansancio y las faltas no esperan a que se cumpla.
 */
const MIN_STINT_SECONDS = 150;
/** Margen de cuota que tiene que ganar el cambio para merecer la pena. */
const SWAP_MARGIN = 0.04;
/**
 * Frescura que devuelve un tiempo muerto a los cinco de pista. Menos que un
 * descanso entre cuartos: es un minuto, no dos, y sin irse al vestuario.
 */
const TIMEOUT_RECOVERY = 5;
/**
 * Cuota de partido de cada puesto de la rotación, del titular más usado al
 * duodécimo. Suma 5, que son los huecos de pista: repartida así da una rotación
 * de nueve hombres con titulares en torno a 30 minutos, que es lo que se ve en
 * una plantilla FIBA.
 *
 * Es el reparto de reserva: cuando el equipo trae minutos objetivo —los que
 * pone el usuario en la pantalla de rotación— mandan esos.
 */
const MINUTES_TARGET_BY_DEPTH = [
  0.8, 0.75, 0.72, 0.7, 0.68, 0.4, 0.35, 0.3, 0.18, 0.07, 0.03, 0.02
] as const;

type ShotType = 'close' | 'midRange' | 'threePoint';

interface PlayerState extends OnCourtPlayer {
  onCourt: boolean;
  fouledOut: boolean;
  box: PlayerBoxScore;
  /** Fracción del partido que le toca jugar según su sitio en la rotación. */
  minutesTarget: number;
  /** Segundo de partido en el que pisó la pista por última vez. */
  enteredAt: number;
}

interface TeamState {
  team: EngineTeam;
  states: PlayerState[];
  score: number;
  teamFoulsThisPeriod: number;
  teamFoulsTotal: number;
  offense: OffensiveSystemProfile;
  defense: DefensiveSystemProfile;
  isHome: boolean;
  /** Tiempos muertos que le quedan por gastar. */
  timeoutsLeft: number;
  /**
   * Si la rotación la lleva el motor. La IA siempre; el equipo del usuario
   * hasta que él ordena su primer cambio en vivo y toma el mando.
   */
  autoRotation: boolean;
}

/**
 * Partido reanudable: se simula **cuarto a cuarto**, no de una tacada.
 *
 * Es lo que pide el modo resultado del juego, donde el usuario pulsa para pasar
 * de cuarto y ve el parcial. Los partidos de la IA usan {@link simulateGame},
 * que no es más que este mismo objeto con un bucle encima: hay un único camino
 * de código, así que el partido del usuario y el del rival se simulan
 * exactamente igual.
 *
 * Mantener el estado entre cuartos (en vez de resolver el partido entero y
 * limitarse a enseñarlo por partes) es lo que permitirá más adelante ajustar la
 * pizarra en el descanso sin rehacer el motor.
 */
export class GameSimulation {
  private readonly ruleset: SimulateGameInput['ruleset'];
  private readonly rng: Rng;
  private readonly homeState: TeamState;
  private readonly awayState: TeamState;
  private readonly events: GameEvent[] = [];
  private readonly periodScores: PeriodScore[] = [];
  /** No es constante: cambiar el ritmo en la pizarra lo recalcula. */
  private averagePossession: number;
  private offenseIsHome: boolean;
  private period = 1;
  private elapsedSeconds = 0;
  private finished = false;
  /** Reloj del cuarto en curso. Sólo significa algo con `periodStarted`. */
  private periodClock = 0;
  private periodStarted = false;
  private periodHomeAtStart = 0;
  private periodAwayAtStart = 0;

  readonly gameId: string;
  readonly seed: number;

  constructor(input: SimulateGameInput) {
    this.gameId = input.gameId;
    this.ruleset = input.ruleset;
    this.seed = input.seed ?? seedFromString(input.gameId);
    this.rng = createRng(this.seed);
    const regulationMinutes = this.ruleset.periods * this.ruleset.periodMinutes;
    const timeouts = this.ruleset.timeoutsPerGame;
    this.homeState = buildTeamState(input.home, true, regulationMinutes, timeouts);
    this.awayState = buildTeamState(input.away, false, regulationMinutes, timeouts);
    this.averagePossession = averagePossessionSeconds(this.homeState, this.awayState);
    // El salto inicial decide quién empieza; a partir de ahí se alterna.
    this.offenseIsHome = this.rng.chance(jumpBallHomeChance(this.homeState, this.awayState));
  }

  get isFinished(): boolean {
    return this.finished;
  }

  /** Cuarto que se jugará en la siguiente llamada a {@link playPeriod}. */
  get nextPeriod(): number {
    return this.period;
  }

  /** Cuántos cuartos se han jugado ya. */
  get playedPeriods(): number {
    return this.periodScores.length;
  }

  /** Segundos que le quedan al cuarto en curso. El cuarto entero si no ha empezado. */
  get clockSeconds(): number {
    return this.periodStarted ? this.periodClock : this.periodLengthSeconds();
  }

  /** Hay un cuarto empezado y sin terminar: el partido está en juego. */
  get isPeriodInProgress(): boolean {
    return this.periodStarted;
  }

  /**
   * Juega un cuarto entero (o una prórroga) y devuelve su parcial. Llamarlo con
   * el partido ya terminado no hace nada: devuelve el último parcial, para que
   * un doble clic en el botón de avanzar no invente una prórroga.
   */
  playPeriod(): PeriodScore {
    if (this.finished) {
      return this.periodScores[this.periodScores.length - 1] as PeriodScore;
    }

    this.beginPeriod();
    while (this.periodStarted) {
      this.playPossession();
    }

    return this.periodScores[this.periodScores.length - 1] as PeriodScore;
  }

  /**
   * Juega **una posesión** y devuelve si el cuarto sigue vivo.
   *
   * Es la unidad que necesita el partido en vivo: entre una posesión y la
   * siguiente el entrenador puede cambiar, pedir tiempo muerto o tocar la
   * pizarra. El cuarto a cuarto no es más que esto en bucle
   * ({@link playPeriod}), así que hay un único camino de código y un partido
   * seguido en vivo sale exactamente igual que uno simulado de una tacada
   * mientras nadie intervenga.
   */
  playPossession(): boolean {
    if (this.finished) {
      return false;
    }
    if (!this.periodStarted) {
      this.beginPeriod();
    }

    const { ruleset, rng, homeState: home, awayState: away, events } = this;
    const offense = this.offenseIsHome ? home : away;
    const defense = this.offenseIsHome ? away : home;

    const duration = Math.min(
      this.periodClock,
      Math.max(MIN_POSSESSION_SECONDS, Math.round(this.averagePossession + rng.int(-7, 7)))
    );
    this.periodClock -= duration;

    chargeMinutes(home, duration);
    chargeMinutes(away, duration);
    this.elapsedSeconds += duration;

    resolvePossession({
      offense,
      defense,
      rng,
      events,
      period: this.period,
      clock: this.periodClock,
      home,
      away,
      ruleset,
      elapsedSeconds: this.elapsedSeconds
    });

    applyFatigue(offense, defense);
    for (const team of [home, away]) {
      // Con el entrenador al mando, sus cambios los ordena él: la rotación
      // automática se aparta en vez de deshacerle el banquillo cada posesión.
      if (!team.autoRotation) {
        continue;
      }
      for (const change of substitute(team, ruleset.personalFoulLimit, this.elapsedSeconds)) {
        pushEvent(events, home, away, {
          period: this.period,
          clockSeconds: this.periodClock,
          type: 'substitution',
          teamId: team.team.id,
          playerId: change.incoming.player.id,
          secondaryPlayerId: change.outgoing.player.id
        });
      }
    }

    this.offenseIsHome = !this.offenseIsHome;

    if (this.periodClock <= 0) {
      this.endPeriod();
      return false;
    }
    return true;
  }

  /** Arranca el cuarto: pone el reloj, borra las faltas de equipo y lo anuncia. */
  private beginPeriod(): void {
    if (this.periodStarted || this.finished) {
      return;
    }

    const { homeState: home, awayState: away } = this;
    this.periodHomeAtStart = home.score;
    this.periodAwayAtStart = away.score;
    home.teamFoulsThisPeriod = 0;
    away.teamFoulsThisPeriod = 0;
    this.periodClock = this.periodLengthSeconds();
    this.periodStarted = true;

    pushEvent(this.events, home, away, {
      period: this.period,
      clockSeconds: this.periodClock,
      type: 'periodStart',
      teamId: '',
      playerId: null
    });
  }

  /** Cierra el cuarto: parcial, descanso y prórroga si hace falta. */
  private endPeriod(): void {
    const { ruleset, homeState: home, awayState: away } = this;

    pushEvent(this.events, home, away, {
      period: this.period,
      clockSeconds: 0,
      type: 'periodEnd',
      teamId: '',
      playerId: null
    });

    this.periodScores.push({
      period: this.period,
      home: home.score - this.periodHomeAtStart,
      away: away.score - this.periodAwayAtStart
    });
    this.periodStarted = false;

    // Descanso entre cuartos: se recupera una parte del cansancio, no todo.
    const isHalfTime = this.period === Math.floor(ruleset.periods / 2);
    recoverBetweenPeriods(home, isHalfTime);
    recoverBetweenPeriods(away, isHalfTime);

    // Empatados al final del reglamentario, hay prórroga; y otra, y otra.
    if (this.period >= ruleset.periods && home.score !== away.score) {
      this.finished = true;
    } else {
      this.period += 1;
    }
  }

  private periodLengthSeconds(): number {
    const isOvertime = this.period > this.ruleset.periods;
    return (isOvertime ? this.ruleset.overtimeMinutes : this.ruleset.periodMinutes) * 60;
  }

  // ------------------------------------------------------------------------
  // El entrenador, en vivo
  //
  // Todo lo de aquí abajo se llama **entre posesiones** y no gasta azar: son
  // decisiones, no sucesos. Por eso un partido en el que nadie interviene sale
  // idéntico a uno simulado de una tacada.
  // ------------------------------------------------------------------------

  /** Los diez de pista y los que esperan, con lo que hace falta para decidir. */
  liveBench(teamId: string): LiveBench | null {
    const team = this.teamById(teamId);
    if (!team) {
      return null;
    }

    return {
      teamId: team.team.id,
      timeoutsLeft: team.timeoutsLeft,
      autoRotation: team.autoRotation,
      players: team.states.map((state) => ({
        playerId: state.player.id,
        onCourt: state.onCourt,
        playedPosition: state.playedPosition,
        fouls: state.box.fouls,
        fouledOut: state.fouledOut,
        freshness: Math.round(state.freshness),
        secondsPlayed: state.box.secondsPlayed,
        points: state.box.twoPointMade * 2 + state.box.threePointMade * 3 + state.box.freeThrowMade
      }))
    };
  }

  /**
   * Cambio ordenado por el entrenador.
   *
   * El que entra ocupa el hueco del que sale, igual que en la rotación
   * automática: quien sustituye a un pívot juega de pívot esa posesión, aunque
   * sea base. Devuelve el motivo si no se puede, para que la pantalla lo diga
   * en vez de tragarse la orden en silencio.
   */
  orderSubstitution(teamId: string, outgoingId: string, incomingId: string): OrderResult {
    const team = this.teamById(teamId);
    if (!team) {
      return { ok: false, reason: 'Ese equipo no juega este partido' };
    }

    const outgoing = team.states.find((state) => state.player.id === outgoingId);
    const incoming = team.states.find((state) => state.player.id === incomingId);
    if (!outgoing || !incoming) {
      return { ok: false, reason: 'Ese jugador no está convocado' };
    }
    if (!outgoing.onCourt) {
      return { ok: false, reason: `${outgoing.player.name} ya está en el banquillo` };
    }
    if (incoming.onCourt) {
      return { ok: false, reason: `${incoming.player.name} ya está en pista` };
    }
    if (incoming.fouledOut) {
      return { ok: false, reason: `${incoming.player.name} está eliminado por faltas` };
    }

    swap(outgoing, incoming, this.elapsedSeconds);
    // A partir del primer cambio suyo, el banquillo es del entrenador: que el
    // motor siguiera rotando por su cuenta desharía la orden en dos posesiones.
    team.autoRotation = false;

    pushEvent(this.events, this.homeState, this.awayState, {
      period: this.period,
      clockSeconds: this.clockSeconds,
      type: 'substitution',
      teamId: team.team.id,
      playerId: incoming.player.id,
      secondaryPlayerId: outgoing.player.id
    });

    return { ok: true };
  }

  /**
   * Tiempo muerto: un minuto de banquillo que devuelve algo de piernas a los
   * cinco de pista. No es gratis —son contados— y por eso pedirlo a destiempo
   * se paga luego, que es justo la decisión que lo hace interesante.
   */
  callTimeout(teamId: string): OrderResult {
    const team = this.teamById(teamId);
    if (!team) {
      return { ok: false, reason: 'Ese equipo no juega este partido' };
    }
    if (team.timeoutsLeft <= 0) {
      return { ok: false, reason: 'No quedan tiempos muertos' };
    }
    if (!this.periodStarted) {
      return { ok: false, reason: 'El cuarto no ha empezado' };
    }

    team.timeoutsLeft -= 1;
    for (const state of team.states) {
      if (state.onCourt) {
        state.freshness = clamp(state.freshness + TIMEOUT_RECOVERY, 0, 100);
      }
    }

    pushEvent(this.events, this.homeState, this.awayState, {
      period: this.period,
      clockSeconds: this.periodClock,
      type: 'timeout',
      teamId: team.team.id,
      playerId: null
    });

    return { ok: true };
  }

  /**
   * La pizarra, sobre la marcha. Cambiar de defensa a mitad de partido es la
   * decisión de manager que pedía el partido en vivo, y el ritmo se recalcula
   * con ella porque lo fijan los dos equipos a la vez.
   */
  setTactics(teamId: string, patch: Partial<TeamTactics>): OrderResult {
    const team = this.teamById(teamId);
    if (!team) {
      return { ok: false, reason: 'Ese equipo no juega este partido' };
    }

    team.team.tactics = { ...team.team.tactics, ...patch };
    team.offense = OFFENSIVE_SYSTEM_PROFILES[team.team.tactics.offensiveSystem];
    team.defense = DEFENSIVE_SYSTEM_PROFILES[team.team.tactics.defensiveSystem];
    this.averagePossession = averagePossessionSeconds(this.homeState, this.awayState);

    return { ok: true };
  }

  /** Devuelve la rotación al motor, o se la quita. */
  setAutoRotation(teamId: string, enabled: boolean): OrderResult {
    const team = this.teamById(teamId);
    if (!team) {
      return { ok: false, reason: 'Ese equipo no juega este partido' };
    }
    team.autoRotation = enabled;
    return { ok: true };
  }

  private teamById(teamId: string): TeamState | null {
    if (this.homeState.team.id === teamId) return this.homeState;
    if (this.awayState.team.id === teamId) return this.awayState;
    return null;
  }

  /** Resultado hasta el momento. Sirve tanto a mitad de partido como al final. */
  get result(): GameResult {
    return {
      gameId: this.gameId,
      seed: this.seed,
      home: toTeamResult(this.homeState),
      away: toTeamResult(this.awayState),
      periods: [...this.periodScores],
      overtimes: Math.max(0, this.periodScores.length - this.ruleset.periods),
      events: [...this.events]
    };
  }
}

/** Partido completo de una tacada. Es lo que usan los partidos de la IA. */
export function simulateGame(input: SimulateGameInput): GameResult {
  const simulation = new GameSimulation(input);
  while (!simulation.isFinished) {
    simulation.playPeriod();
  }
  return simulation.result;
}

// --------------------------------------------------------------------------
// Construcción del estado
// --------------------------------------------------------------------------

function buildTeamState(
  team: EngineTeam,
  isHome: boolean,
  regulationMinutes: number,
  timeouts: number
): TeamState {
  const startersInOrder = resolveStarters(team);
  const states: PlayerState[] = team.players.map((player) => {
    const starterIndex = startersInOrder.indexOf(player.id);
    return {
      player,
      // Un suplente ocupa de entrada su posición natural; al entrar en pista
      // se le reasigna el hueco que deja el que sale.
      playedPosition: starterIndex >= 0 ? (POSITIONS[starterIndex] as Position) : player.position,
      freshness: clamp(player.condition, 0, 100),
      fouls: 0,
      onCourt: starterIndex >= 0,
      fouledOut: false,
      box: emptyPlayerBoxScore(player.id),
      minutesTarget: 0,
      enteredAt: 0
    };
  });

  assignMinutesTargets(states, startersInOrder, team.minutesTargets, regulationMinutes);

  return {
    team: ownTactics(team),
    states,
    score: 0,
    teamFoulsThisPeriod: 0,
    teamFoulsTotal: 0,
    offense: OFFENSIVE_SYSTEM_PROFILES[team.tactics.offensiveSystem],
    defense: DEFENSIVE_SYSTEM_PROFILES[team.tactics.defensiveSystem],
    isHome,
    timeoutsLeft: timeouts,
    autoRotation: true
  };
}

/**
 * Copia de la pizarra para que tocarla en vivo no le cambie el equipo a quien
 * lo pasó: el motor manda sobre su partido, no sobre la partida.
 */
function ownTactics(team: EngineTeam): EngineTeam {
  return { ...team, tactics: { ...team.tactics } };
}

/**
 * Reparte las cuotas de minutos.
 *
 * Si el equipo trae minutos objetivo del entrenador, mandan esos: se pasan a
 * cuota de partido y se normalizan a los cinco huecos de pista. La
 * normalización es lo que hace que una rotación descuadrada siga siendo
 * jugable — si el usuario reparte 150 minutos en vez de 200, sus jugadores no
 * se quedan sentados un cuarto entero, juegan en la proporción que él pidió.
 *
 * Sin minutos objetivo, los cinco titulares se llevan los cinco primeros tramos
 * y el resto del banquillo se ordena por nivel. Determinista en los dos casos:
 * mismo equipo, mismo reparto.
 */
function assignMinutesTargets(
  states: PlayerState[],
  startersInOrder: readonly string[],
  minutesTargets: EngineTeam['minutesTargets'],
  regulationMinutes: number
): void {
  if (applyExplicitMinutes(states, minutesTargets, regulationMinutes)) {
    return;
  }

  const starters = startersInOrder
    .map((id) => states.find((state) => state.player.id === id))
    .filter((state): state is PlayerState => state !== undefined);

  const bench = states
    .filter((state) => !startersInOrder.includes(state.player.id))
    .sort(
      (a, b) =>
        overallForPosition(b.player.attributes, b.player.position) -
        overallForPosition(a.player.attributes, a.player.position)
    );

  [...starters, ...bench].forEach((state, depth) => {
    state.minutesTarget = MINUTES_TARGET_BY_DEPTH[depth] ?? 0;
  });
}

/** Devuelve `false` si no hay minutos que aplicar, para que decida el reparto por defecto. */
function applyExplicitMinutes(
  states: PlayerState[],
  minutesTargets: EngineTeam['minutesTargets'],
  regulationMinutes: number
): boolean {
  if (!minutesTargets || regulationMinutes <= 0) {
    return false;
  }

  const shares = states.map(
    (state) => Math.max(0, minutesTargets[state.player.id] ?? 0) / regulationMinutes
  );
  const total = shares.reduce((sum, share) => sum + share, 0);
  if (total <= 0) {
    return false;
  }

  const factor = LINEUP_SIZE / total;
  states.forEach((state, index) => {
    state.minutesTarget = (shares[index] as number) * factor;
  });
  return true;
}

/**
 * Cinco inicial saneado: se respeta el que llega, y si viene incompleto (o con
 * ids que no están en la convocatoria) se rellena con los mejores disponibles
 * por posición. El motor nunca debe empezar un partido con menos de cinco.
 */
function resolveStarters(team: EngineTeam): string[] {
  const rosterIds = new Set(team.players.map((player) => player.id));
  const chosen = team.starters.filter((id) => rosterIds.has(id)).slice(0, 5);
  const used = new Set(chosen);

  for (let slot = chosen.length; slot < 5; slot += 1) {
    const wanted = POSITIONS[slot] as Position;
    const candidate =
      team.players.find((player) => !used.has(player.id) && player.position === wanted) ??
      team.players.find((player) => !used.has(player.id));
    if (!candidate) {
      break;
    }
    chosen.push(candidate.id);
    used.add(candidate.id);
  }

  return chosen;
}

// --------------------------------------------------------------------------
// Posesión
// --------------------------------------------------------------------------

interface PossessionContext {
  offense: TeamState;
  defense: TeamState;
  rng: Rng;
  events: GameEvent[];
  period: number;
  clock: number;
  home: TeamState;
  away: TeamState;
  ruleset: SimulateGameInput['ruleset'];
  /** Segundos de partido ya disputados; la rotación los necesita. */
  elapsedSeconds: number;
}

function resolvePossession(context: PossessionContext, secondChance = 0): void {
  const { offense, defense, rng } = context;
  const offLineup = onCourt(offense);
  const defLineup = onCourt(defense);
  if (offLineup.length === 0 || defLineup.length === 0) {
    return;
  }

  // 1. Pérdida de balón.
  if (rng.chance(turnoverChance(offense, defense, offLineup, defLineup))) {
    const loser = rng.weighted(
      offLineup,
      offLineup.map(
        (state) =>
          usageWeight(state, isFocus(offense, state)) *
          (120 - effectiveAttribute(state, 'handling'))
      )
    );
    loser.box.turnovers += 1;
    record(context, 'turnover', offense, loser.player.id);

    if (rng.chance(STEAL_SHARE_OF_TURNOVERS)) {
      const thief = rng.weighted(
        defLineup,
        defLineup.map((state) => effectiveAttribute(state, 'steal'))
      );
      thief.box.steals += 1;
      record(context, 'steal', defense, thief.player.id, loser.player.id);
    }
    return;
  }

  // 2. Falta sin tiro. En bonus son dos tiros libres; si no, sólo cuesta tiempo.
  if (rng.chance(NON_SHOOTING_FOUL_RATE * defense.defense.foulRate)) {
    const fouler = pickFouler(defense, rng);
    const drawer = rng.weighted(
      offLineup,
      offLineup.map((state) => usageWeight(state, isFocus(offense, state)))
    );
    commitFoul(context, fouler, drawer);

    if (defense.teamFoulsThisPeriod > context.ruleset.teamFoulBonus) {
      shootFreeThrows(context, drawer, 2, secondChance);
      return;
    }
    // Falta en juego sin bonus: la posesión sigue viva, pero sin repetir toda
    // la secuencia (ya se ha consumido el tiempo del reloj arriba).
  }

  // 3. Tiro de campo.
  const shooter = rng.weighted(
    offLineup,
    offLineup.map((state) => usageWeight(state, isFocus(offense, state)))
  );
  const shotType = pickShotType(offense, shooter, rng);

  // Tapón: se resuelve antes que el acierto, porque un tiro tapado no entra.
  const blocker = tryBlock(context, shooter, shotType, defLineup);
  if (blocker) {
    registerMiss(context, shooter, shotType);
    resolveRebound(context, secondChance);
    return;
  }

  const fouled = rng.chance(SHOOTING_FOUL_RATE[shotType] * defense.defense.foulRate);
  const made = rng.chance(makeChance(context, shooter, shotType, defLineup));

  if (fouled) {
    const fouler = pickFouler(defense, rng);
    commitFoul(context, fouler, shooter);

    // Canasta y adicional: sólo si el tiro entraba de todos modos, y no siempre.
    if (made && rng.chance(AND_ONE_RATE)) {
      registerMake(context, shooter, shotType, offLineup);
      shootFreeThrows(context, shooter, 1, secondChance);
      return;
    }

    shootFreeThrows(context, shooter, shotType === 'threePoint' ? 3 : 2, secondChance);
    return;
  }

  if (made) {
    registerMake(context, shooter, shotType, offLineup);
    return;
  }

  registerMiss(context, shooter, shotType);
  resolveRebound(context, secondChance);
}

function turnoverChance(
  offense: TeamState,
  defense: TeamState,
  offLineup: readonly PlayerState[],
  defLineup: readonly PlayerState[]
): number {
  const control =
    lineupAverage(offLineup, 'handling') * 0.6 + lineupAverage(offLineup, 'basketballIQ') * 0.4;
  const pressure =
    lineupAverage(defLineup, 'steal') * 0.6 + lineupAverage(defLineup, 'perimeterDefense') * 0.4;

  const chance =
    BASE_TURNOVER_RATE *
    offense.offense.turnoverMultiplier *
    defense.defense.turnoverForced *
    skillMultiplier(pressure - control, 0.008);

  return clamp(chance, 0.04, 0.3);
}

/**
 * Tipo de tiro: el sistema del equipo marca el reparto base y el propio
 * tirador lo tuerce hacia lo que sabe hacer. Un pívot dentro de un sistema
 * exterior sigue tirando poco de tres.
 */
function pickShotType(offense: TeamState, shooter: PlayerState, rng: Rng): ShotType {
  const mix = offense.offense.shotMix;
  const threeTendency: Record<Position, number> = {
    PG: 1.1,
    SG: 1.15,
    SF: 1,
    PF: 0.7,
    C: 0.35
  };

  const closeWeight =
    mix.close *
    ((effectiveAttribute(shooter, 'close') + effectiveAttribute(shooter, 'driving')) / 100);
  const midWeight = mix.midRange * (effectiveAttribute(shooter, 'midRange') / 50);
  const threeWeight =
    mix.threePoint *
    (effectiveAttribute(shooter, 'threePoint') / 50) *
    (threeTendency[shooter.playedPosition] ?? 1);

  return rng.weighted<ShotType>(
    ['close', 'midRange', 'threePoint'],
    [closeWeight, midWeight, threeWeight]
  );
}

function makeChance(
  context: PossessionContext,
  shooter: PlayerState,
  shotType: ShotType,
  defLineup: readonly PlayerState[]
): number {
  const { offense, defense } = context;

  const shooterSkill =
    shotType === 'close'
      ? effectiveAttribute(shooter, 'close') * 0.6 + effectiveAttribute(shooter, 'finishing') * 0.4
      : shotType === 'midRange'
        ? effectiveAttribute(shooter, 'midRange')
        : effectiveAttribute(shooter, 'threePoint');

  const defenderSkill =
    shotType === 'close'
      ? lineupAverage(defLineup, 'interiorDefense')
      : lineupAverage(defLineup, 'perimeterDefense');

  const systemFactor =
    shotType === 'close' ? defense.defense.closeDefense : defense.defense.perimeterDefense;

  const chance =
    BASE_MAKE_RATE[shotType] *
    skillMultiplier(shooterSkill - defenderSkill) *
    (1 / systemFactor) *
    (offense.isHome ? HOME_COURT_MULTIPLIER : 1);

  return clamp(chance, 0.15, 0.8);
}

function tryBlock(
  context: PossessionContext,
  shooter: PlayerState,
  shotType: ShotType,
  defLineup: readonly PlayerState[]
): PlayerState | null {
  const { rng } = context;
  const chance =
    BLOCK_RATE[shotType] *
    skillMultiplier(
      lineupAverage(defLineup, 'block') - effectiveAttribute(shooter, 'finishing'),
      0.01
    );

  if (!rng.chance(clamp(chance, 0, 0.2))) {
    return null;
  }

  const blocker = rng.weighted(
    defLineup,
    defLineup.map((state) => effectiveAttribute(state, 'block'))
  );
  blocker.box.blocks += 1;
  record(context, 'block', context.defense, blocker.player.id, shooter.player.id);
  return blocker;
}

function registerMake(
  context: PossessionContext,
  shooter: PlayerState,
  shotType: ShotType,
  offLineup: readonly PlayerState[]
): void {
  const { offense, rng } = context;
  const points = shotType === 'threePoint' ? 3 : 2;

  if (shotType === 'threePoint') {
    shooter.box.threePointMade += 1;
    shooter.box.threePointAttempted += 1;
  } else {
    shooter.box.twoPointMade += 1;
    shooter.box.twoPointAttempted += 1;
  }

  addPoints(context, offense, points);
  record(
    context,
    shotType === 'threePoint' ? 'threePointMade' : 'twoPointMade',
    offense,
    shooter.player.id,
    null,
    points
  );

  const candidates = offLineup.filter((state) => state.player.id !== shooter.player.id);
  if (candidates.length > 0 && rng.chance(BASE_ASSIST_RATE * offense.offense.assistMultiplier)) {
    const passer = rng.weighted(
      candidates,
      candidates.map(
        (state) =>
          effectiveAttribute(state, 'passing') * 0.7 +
          effectiveAttribute(state, 'basketballIQ') * 0.3
      )
    );
    passer.box.assists += 1;
    record(context, 'assist', offense, passer.player.id, shooter.player.id);
  }
}

function registerMiss(context: PossessionContext, shooter: PlayerState, shotType: ShotType): void {
  if (shotType === 'threePoint') {
    shooter.box.threePointAttempted += 1;
  } else {
    shooter.box.twoPointAttempted += 1;
  }
  record(
    context,
    shotType === 'threePoint' ? 'threePointMissed' : 'twoPointMissed',
    context.offense,
    shooter.player.id
  );
}

function shootFreeThrows(
  context: PossessionContext,
  shooter: PlayerState,
  attempts: number,
  secondChance: number
): void {
  const { rng, offense } = context;
  const chance = clamp(0.5 + (effectiveAttribute(shooter, 'freeThrow') / 100) * 0.45, 0.35, 0.95);

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    shooter.box.freeThrowAttempted += 1;
    if (rng.chance(chance)) {
      shooter.box.freeThrowMade += 1;
      addPoints(context, offense, 1);
      record(context, 'freeThrowMade', offense, shooter.player.id, null, 1);
      continue;
    }

    record(context, 'freeThrowMissed', offense, shooter.player.id);
    // Sólo el último tiro libre fallado deja rebote vivo.
    if (attempt === attempts) {
      resolveRebound(context, secondChance);
    }
  }
}

function resolveRebound(context: PossessionContext, secondChance: number): void {
  const { offense, defense, rng } = context;
  const offLineup = onCourt(offense);
  const defLineup = onCourt(defense);
  if (offLineup.length === 0 || defLineup.length === 0) {
    return;
  }

  const effort = 0.8 + offense.team.tactics.offensiveReboundEffort * 0.04;
  const offensiveWeight =
    offLineup.reduce((sum, state) => sum + reboundWeight(state, true), 0) *
    OFFENSIVE_REBOUND_TILT *
    effort;
  const defensiveWeight =
    defLineup.reduce((sum, state) => sum + reboundWeight(state, false), 0) *
    defense.defense.defensiveRebound;

  const offensiveChance = offensiveWeight / (offensiveWeight + defensiveWeight);

  if (secondChance < MAX_SECOND_CHANCES && rng.chance(offensiveChance)) {
    const rebounder = rng.weighted(
      offLineup,
      offLineup.map((state) => reboundWeight(state, true))
    );
    rebounder.box.offensiveRebounds += 1;
    record(context, 'offensiveRebound', offense, rebounder.player.id);
    resolvePossession(context, secondChance + 1);
    return;
  }

  const rebounder = rng.weighted(
    defLineup,
    defLineup.map((state) => reboundWeight(state, false))
  );
  rebounder.box.defensiveRebounds += 1;
  record(context, 'defensiveRebound', defense, rebounder.player.id);
}

function commitFoul(context: PossessionContext, fouler: PlayerState, drawer: PlayerState): void {
  const { defense, ruleset } = context;

  fouler.box.fouls += 1;
  fouler.fouls += 1;
  drawer.box.foulsDrawn += 1;
  defense.teamFoulsThisPeriod += 1;
  defense.teamFoulsTotal += 1;
  record(context, 'foul', defense, fouler.player.id, drawer.player.id);

  if (fouler.fouls >= ruleset.personalFoulLimit) {
    fouler.fouledOut = true;
    record(context, 'foulOut', defense, fouler.player.id);
    const incoming = forceSubstitution(defense, fouler, context.elapsedSeconds);
    if (incoming) {
      record(context, 'substitution', defense, incoming.player.id, fouler.player.id);
    }
  }
}

/**
 * Quién comete la falta. Relee la pista en vez de usar el quinteto capturado al
 * principio de la posesión: entre medias puede haber eliminado alguien por
 * faltas y haber entrado su recambio, y cargarle una falta más a un jugador que
 * ya está en el banquillo le dejaba con una sexta personal imposible.
 */
function pickFouler(defense: TeamState, rng: Rng): PlayerState {
  const defLineup = onCourt(defense);
  return rng.weighted(
    defLineup,
    defLineup.map(
      (state) =>
        effectiveAttribute(state, 'aggression') * 0.6 +
        effectiveAttribute(state, 'interiorDefense') * 0.4
    )
  );
}

// --------------------------------------------------------------------------
// Minutos, cansancio y rotación
// --------------------------------------------------------------------------

function chargeMinutes(team: TeamState, seconds: number): void {
  for (const state of team.states) {
    if (state.onCourt) {
      state.box.secondsPlayed += seconds;
    }
  }
}

function applyFatigue(offense: TeamState, defense: TeamState): void {
  for (const [team, defensiveLoad] of [
    [offense, 1] as const,
    [defense, defense.defense.fatigueRate] as const
  ]) {
    for (const state of team.states) {
      if (state.onCourt) {
        const stamina = state.player.attributes.stamina;
        const drain = FATIGUE_DRAIN_PER_POSSESSION * defensiveLoad * (1.6 - stamina / 100);
        state.freshness = clamp(state.freshness - drain, 0, 100);
      } else {
        state.freshness = clamp(state.freshness + BENCH_RECOVERY_PER_POSSESSION, 0, 100);
      }
    }
  }
}

function recoverBetweenPeriods(team: TeamState, isHalfTime: boolean): void {
  const recovery = isHalfTime ? 22 : 8;
  for (const state of team.states) {
    state.freshness = clamp(state.freshness + recovery, 0, 100);
  }
}

/**
 * Rotación por objetivo de minutos.
 *
 * Cada jugador lleva una cuota de partido que "le toca" jugar según su sitio en
 * la rotación (ver {@link MINUTES_TARGET_BY_DEPTH}). El entrenador saca al que
 * ya va sobrado de minutos o está fundido, y mete al que va más corto respecto
 * a su cuota. Es la mecánica que tenía PC Basket con los minutos por jugador, y
 * sin ella los doce acaban jugando prácticamente lo mismo, que no se parece a
 * ningún partido real.
 */
interface Substitution {
  outgoing: PlayerState;
  incoming: PlayerState;
}

/**
 * Devuelve los cambios hechos para que quien la llama los apunte en el acta.
 * Apuntarlos no gasta azar: el partido sale igual se registren o no.
 */
function substitute(team: TeamState, foulLimit: number, elapsedSeconds: number): Substitution[] {
  const changes: Substitution[] = [];
  if (elapsedSeconds <= 0) {
    return changes;
  }

  const outgoing = onCourt(team)
    .filter((state) => !state.fouledOut)
    .map((state) => ({
      state,
      excess: playedShare(state, elapsedSeconds) - state.minutesTarget,
      tired: state.freshness < TIRED_THRESHOLD
    }))
    .filter(
      ({ state, excess, tired }) =>
        tired || (excess > 0.06 && elapsedSeconds - state.enteredAt >= MIN_STINT_SECONDS)
    )
    .sort((a, b) => b.excess - a.excess)
    .slice(0, 2);

  for (const { state, excess, tired } of outgoing) {
    const incoming = bestBenchCandidate(
      team,
      state.playedPosition,
      foulLimit,
      REST_THRESHOLD,
      elapsedSeconds
    );
    if (!incoming) {
      continue;
    }
    // Por minutos, sólo si el que entra va de verdad más corto que el que sale;
    // si no, el cambio se deshace solo en cuanto pase el tiempo mínimo.
    const incomingExcess = playedShare(incoming, elapsedSeconds) - incoming.minutesTarget;
    if (!tired && incomingExcess > excess - SWAP_MARGIN) {
      continue;
    }
    swap(state, incoming, elapsedSeconds);
    changes.push({ outgoing: state, incoming });
  }
  return changes;
}

/** Saca al eliminado y devuelve quién entra por él, si queda alguien. */
function forceSubstitution(
  team: TeamState,
  outgoing: PlayerState,
  elapsedSeconds: number
): PlayerState | null {
  const incoming = bestBenchCandidate(
    team,
    outgoing.playedPosition,
    Number.POSITIVE_INFINITY,
    0,
    elapsedSeconds
  );
  if (!incoming) {
    // Sin recambio, el eliminado abandona la pista igualmente: el equipo juega
    // con menos, que es lo que dice el reglamento.
    outgoing.onCourt = false;
    return null;
  }
  swap(outgoing, incoming, elapsedSeconds);
  return incoming;
}

function bestBenchCandidate(
  team: TeamState,
  slot: Position,
  foulLimit: number,
  minimumFreshness: number,
  elapsedSeconds: number
): PlayerState | null {
  const candidates = team.states.filter(
    (state) =>
      !state.onCourt &&
      !state.fouledOut &&
      state.fouls < foulLimit &&
      state.freshness >= minimumFreshness
  );
  if (candidates.length === 0) {
    return null;
  }

  return candidates.reduce((best, candidate) =>
    benchScore(candidate, slot, elapsedSeconds) > benchScore(best, slot, elapsedSeconds)
      ? candidate
      : best
  );
}

/**
 * Criterio del entrenador al elegir recambio: sobre todo, quién va más corto de
 * minutos respecto a su cuota; después, si encaja en el hueco que queda libre.
 */
function benchScore(state: PlayerState, slot: Position, elapsedSeconds: number): number {
  const deficit = state.minutesTarget - playedShare(state, elapsedSeconds);
  const positionFit = state.player.position === slot ? 12 : 0;
  const closeness =
    6 - Math.abs(POSITIONS.indexOf(state.player.position) - POSITIONS.indexOf(slot)) * 2;
  return deficit * 100 + positionFit + closeness;
}

/** Fracción del partido disputado hasta ahora que este jugador ha estado en pista. */
function playedShare(state: PlayerState, elapsedSeconds: number): number {
  return elapsedSeconds <= 0 ? 0 : state.box.secondsPlayed / elapsedSeconds;
}

function swap(outgoing: PlayerState, incoming: PlayerState, elapsedSeconds: number): void {
  outgoing.onCourt = false;
  incoming.onCourt = true;
  incoming.enteredAt = elapsedSeconds;
  incoming.playedPosition = outgoing.playedPosition;
}

// --------------------------------------------------------------------------
// Utilidades
// --------------------------------------------------------------------------

function onCourt(team: TeamState): PlayerState[] {
  return team.states.filter((state) => state.onCourt);
}

function isFocus(team: TeamState, state: PlayerState): boolean {
  return team.team.tactics.focusPlayerId === state.player.id;
}

function addPoints(context: PossessionContext, team: TeamState, points: number): void {
  team.score += points;
  const opponent = team === context.home ? context.away : context.home;
  for (const state of onCourt(team)) {
    state.box.plusMinus += points;
  }
  for (const state of onCourt(opponent)) {
    state.box.plusMinus -= points;
  }
}

function record(
  context: PossessionContext,
  type: GameEventType,
  team: TeamState,
  playerId: string | null,
  secondaryPlayerId: string | null = null,
  points?: number
): void {
  pushEvent(context.events, context.home, context.away, {
    period: context.period,
    clockSeconds: Math.max(0, context.clock),
    type,
    teamId: team.team.id,
    playerId,
    secondaryPlayerId,
    ...(points === undefined ? {} : { points })
  });
}

function pushEvent(
  events: GameEvent[],
  home: TeamState,
  away: TeamState,
  event: Omit<GameEvent, 'homeScore' | 'awayScore'>
): void {
  events.push({ ...event, homeScore: home.score, awayScore: away.score });
}

function averagePossessionSeconds(home: TeamState, away: TeamState): number {
  const pace =
    (home.team.tactics.pace * home.offense.paceMultiplier +
      away.team.tactics.pace * away.offense.paceMultiplier) /
    2;
  return clamp(BASE_POSSESSION_SECONDS - (pace - 5) * 0.8, 11, 22);
}

/** Probabilidad de que el salto inicial caiga del lado local. */
function jumpBallHomeChance(home: TeamState, away: TeamState): number {
  const homeJump = lineupAverage(onCourt(home), 'jumping');
  const awayJump = lineupAverage(onCourt(away), 'jumping');
  return clamp(0.5 + (homeJump - awayJump) * 0.004, 0.25, 0.75);
}

function toTeamResult(team: TeamState): GameResult['home'] {
  return {
    teamId: team.team.id,
    score: team.score,
    boxScores: team.states.map((state) => state.box),
    teamFouls: team.teamFoulsTotal
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
