import { overallForPosition } from '@shared/domain/attributes';
import { emptyPlayerBoxScore, type PlayerBoxScore } from '@shared/domain/box-score';
import { POSITIONS, type Position } from '@shared/domain/positions';
import {
  DEFENSIVE_SYSTEM_PROFILES,
  OFFENSIVE_SYSTEM_PROFILES,
  type DefensiveSystemProfile,
  type OffensiveSystemProfile
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
 * Cuota de partido de cada puesto de la rotación, del titular más usado al
 * duodécimo. Suma 5, que son los huecos de pista: repartida así da una rotación
 * de nueve hombres con titulares en torno a 30 minutos, que es lo que se ve en
 * una plantilla FIBA. Más adelante esto será lo que el usuario ajuste desde la
 * pantalla de rotación en vez de una constante.
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
  private readonly averagePossession: number;
  private offenseIsHome: boolean;
  private period = 1;
  private elapsedSeconds = 0;
  private finished = false;

  readonly gameId: string;
  readonly seed: number;

  constructor(input: SimulateGameInput) {
    this.gameId = input.gameId;
    this.ruleset = input.ruleset;
    this.seed = input.seed ?? seedFromString(input.gameId);
    this.rng = createRng(this.seed);
    this.homeState = buildTeamState(input.home, true);
    this.awayState = buildTeamState(input.away, false);
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

  /**
   * Juega un cuarto entero (o una prórroga) y devuelve su parcial. Llamarlo con
   * el partido ya terminado no hace nada: devuelve el último parcial, para que
   * un doble clic en el botón de avanzar no invente una prórroga.
   */
  playPeriod(): PeriodScore {
    if (this.finished) {
      return this.periodScores[this.periodScores.length - 1] as PeriodScore;
    }

    const { ruleset, rng, homeState: home, awayState: away, events } = this;
    const isOvertime = this.period > ruleset.periods;
    const periodSeconds = (isOvertime ? ruleset.overtimeMinutes : ruleset.periodMinutes) * 60;

    const homeAtStart = home.score;
    const awayAtStart = away.score;
    home.teamFoulsThisPeriod = 0;
    away.teamFoulsThisPeriod = 0;

    let clock = periodSeconds;
    pushEvent(events, home, away, {
      period: this.period,
      clockSeconds: clock,
      type: 'periodStart',
      teamId: '',
      playerId: null
    });

    while (clock > 0) {
      const offense = this.offenseIsHome ? home : away;
      const defense = this.offenseIsHome ? away : home;

      const duration = Math.min(
        clock,
        Math.max(MIN_POSSESSION_SECONDS, Math.round(this.averagePossession + rng.int(-7, 7)))
      );
      clock -= duration;

      chargeMinutes(home, duration);
      chargeMinutes(away, duration);
      this.elapsedSeconds += duration;

      resolvePossession({
        offense,
        defense,
        rng,
        events,
        period: this.period,
        clock,
        home,
        away,
        ruleset,
        elapsedSeconds: this.elapsedSeconds
      });

      applyFatigue(offense, defense);
      substitute(home, ruleset.personalFoulLimit, this.elapsedSeconds);
      substitute(away, ruleset.personalFoulLimit, this.elapsedSeconds);

      this.offenseIsHome = !this.offenseIsHome;
    }

    pushEvent(events, home, away, {
      period: this.period,
      clockSeconds: 0,
      type: 'periodEnd',
      teamId: '',
      playerId: null
    });

    const score: PeriodScore = {
      period: this.period,
      home: home.score - homeAtStart,
      away: away.score - awayAtStart
    };
    this.periodScores.push(score);

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

    return score;
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

function buildTeamState(team: EngineTeam, isHome: boolean): TeamState {
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
      minutesTarget: 0
    };
  });

  assignMinutesTargets(states, startersInOrder);

  return {
    team,
    states,
    score: 0,
    teamFoulsThisPeriod: 0,
    teamFoulsTotal: 0,
    offense: OFFENSIVE_SYSTEM_PROFILES[team.tactics.offensiveSystem],
    defense: DEFENSIVE_SYSTEM_PROFILES[team.tactics.defensiveSystem],
    isHome
  };
}

/**
 * Reparte las cuotas de minutos: los cinco titulares se llevan los cinco
 * primeros tramos y el resto del banquillo se ordena por nivel en su propia
 * posición. Determinista: mismo equipo, mismo reparto.
 */
function assignMinutesTargets(states: PlayerState[], startersInOrder: readonly string[]): void {
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
    forceSubstitution(defense, fouler, context.elapsedSeconds);
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
function substitute(team: TeamState, foulLimit: number, elapsedSeconds: number): void {
  if (elapsedSeconds <= 0) {
    return;
  }

  const outgoing = onCourt(team)
    .filter((state) => !state.fouledOut)
    .map((state) => ({ state, excess: playedShare(state, elapsedSeconds) - state.minutesTarget }))
    .filter(({ state, excess }) => excess > 0.06 || state.freshness < TIRED_THRESHOLD)
    .sort((a, b) => b.excess - a.excess)
    .slice(0, 2);

  for (const { state } of outgoing) {
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
    swap(state, incoming);
  }
}

function forceSubstitution(team: TeamState, outgoing: PlayerState, elapsedSeconds: number): void {
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
    return;
  }
  swap(outgoing, incoming);
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

function swap(outgoing: PlayerState, incoming: PlayerState): void {
  outgoing.onCourt = false;
  incoming.onCourt = true;
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
