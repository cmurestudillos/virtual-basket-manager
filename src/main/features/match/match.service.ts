import { efficiencyRating, points, type PlayerBoxScore } from '@shared/domain/box-score';
import { continentalRoundName } from '@shared/domain/continental';
import { CUP_TEAMS, cupRoundName } from '@shared/domain/cup';
import { buildPlayoffFormat } from '@shared/domain/playoffs';
import { narrateGame, type PlayLine } from '@shared/domain/play-by-play';
import { analystRevealsRival } from '@shared/domain/staff';
import {
  DEFENSIVE_SYSTEM_LABELS,
  OFFENSIVE_SYSTEM_LABELS,
  type DefensiveSystem,
  type OffensiveSystem,
  type TeamTactics
} from '@shared/domain/tactics';
import type { Position } from '@shared/domain/positions';
import type {
  BoxScoreLine,
  LiveBenchPlayer,
  LiveOrderResult,
  LiveTacticsPatch,
  LiveTick,
  MatchScouting,
  MatchState,
  MatchTeamState
} from '@shared/contracts/match.contract';
import {
  GameSimulation,
  type GameEvent,
  type GameResult,
  type LiveBench,
  type OrderResult
} from '@shared/engine/basketball';
import type { SaveDatabase } from '../../database/save-database';
import type { GameRow } from '../../database/schema/save';
import { StaffService } from '../staff/staff.service';
import { BoardService } from '../club/board.service';
import { ClubService } from '../club/club.service';
import { FitnessService } from '../fitness/fitness.service';
import { worldCupRoundName } from '@shared/domain/national-teams';
import { buildEngineTeam } from './engine-input';
import { MatchRepository, type PlayerCard } from './match.repository';
import { decodePlayByPlay, encodePlayByPlay } from './play-by-play-codec';

export class GameNotFoundError extends Error {
  constructor(gameId: string) {
    super(`No existe el partido ${gameId}`);
    this.name = 'GameNotFoundError';
  }
}

export class GameAlreadyPlayedError extends Error {
  constructor(gameId: string) {
    super(`El partido ${gameId} ya se ha jugado`);
    this.name = 'GameAlreadyPlayedError';
  }
}

/**
 * Partidos del usuario en curso, uno por partida.
 *
 * Vive en memoria a propósito y no en la base de datos: un partido a medias no
 * es un estado que merezca la pena persistir. Si la aplicación se cierra en el
 * tercer cuarto, el partido vuelve a estar sin jugar y se repite — y como la
 * semilla sale del id del partido, se repite exactamente igual. Guardar cuartos
 * sueltos obligaría a que la clasificación supiera qué hacer con un partido a
 * medio jugar, que es un problema que no hace falta tener.
 */
interface LiveSession {
  simulation: GameSimulation;
  /**
   * Cuántas líneas narradas se han mandado ya a la pantalla. La retransmisión
   * se vuelve a narrar entera en cada posesión —narrar sólo el trozo nuevo
   * partiría los parciales y los tiros libres seguidos, que necesitan lo de
   * antes para contarse bien— y de aquí sale lo que todavía no ha visto.
   */
  deliveredLines: number;
}

const sessions = new Map<string, LiveSession>();

export class MatchService {
  /** Ver el porqué del resolutor en {@link SeasonService}. */
  constructor(private readonly resolveDb: () => SaveDatabase) {}

  /** Prepara el partido del usuario y devuelve la previa, sin jugar nada. */
  start(gameId: string): MatchState {
    const db = this.resolveDb();
    const repository = new MatchRepository(db);
    const game = requireUnplayedGame(repository, gameId);

    const simulation = new GameSimulation({
      gameId: game.id,
      home: buildEngineTeam(db, game.homeTeamId, repository.currentDate()),
      away: buildEngineTeam(db, game.awayTeamId, repository.currentDate()),
      ruleset: repository.rulesetForGame(game.id),
      neutralVenue: game.neutralVenue
    });
    sessions.set(gameId, { simulation, deliveredLines: 0 });

    return toMatchState(db, repository, game, simulation.result, simulation.isFinished);
  }

  /** Juega el siguiente cuarto; si con él acaba el partido, lo guarda. */
  advancePeriod(gameId: string): MatchState {
    const db = this.resolveDb();
    const repository = new MatchRepository(db);
    const game = repository.findGame(gameId);
    if (!game) {
      throw new GameNotFoundError(gameId);
    }

    // Sin sesión viva (recarga de la interfaz, partido ya archivado) se
    // devuelve lo que haya guardado en vez de empezar un partido nuevo por
    // detrás, que dejaría dos resultados distintos para el mismo encuentro.
    const session = sessions.get(gameId);
    if (!session) {
      const stored = this.get(gameId);
      if (stored) {
        return stored;
      }
      return this.start(gameId);
    }

    const { simulation } = session;
    simulation.playPeriod();
    const result = simulation.result;

    if (simulation.isFinished) {
      archiveGame(db, repository, game, result);
      sessions.delete(gameId);
    }

    return toMatchState(db, repository, game, result, simulation.isFinished);
  }

  // ------------------------------------------------------------------------
  // El partido en vivo
  // ------------------------------------------------------------------------

  /**
   * El partido como va ahora mismo: acta y parciales de lo jugado hasta aquí.
   *
   * Hace falta porque un partido en vivo **no está en la base de datos hasta
   * que termina** —y con razón: la clasificación no sabría qué hacer con un
   * tercer cuarto— así que entre cuarto y cuarto la pantalla no tiene de dónde
   * sacar los parciales. Con sesión viva se los da la sesión; sin ella, el acta
   * guardada, que es lo que pasa en cuanto suena la bocina.
   */
  snapshot(gameId: string): MatchState | null {
    const db = this.resolveDb();
    const repository = new MatchRepository(db);
    const game = repository.findGame(gameId);
    if (!game) {
      return null;
    }

    const session = sessions.get(gameId);
    if (!session) {
      return this.get(gameId);
    }

    return toMatchState(
      db,
      repository,
      game,
      session.simulation.result,
      session.simulation.isFinished
    );
  }

  /**
   * Juega **una posesión** y devuelve lo que ha pasado en ella.
   *
   * Es el latido del partido en vivo: la pantalla pide una posesión, la
   * reproduce con su reloj y pide la siguiente. Entre una y otra caben las
   * órdenes del banquillo, y por eso no se juega por delante ni se guarda
   * nada adelantado — lo que el entrenador ordena ahora tiene que notarse en
   * la posesión siguiente, no tres más tarde.
   */
  advancePossession(gameId: string): LiveTick {
    const db = this.resolveDb();
    const repository = new MatchRepository(db);
    const game = repository.findGame(gameId);
    if (!game) {
      throw new GameNotFoundError(gameId);
    }

    const session = this.requireSession(gameId, game);
    const { simulation } = session;
    const periodBefore = simulation.nextPeriod;

    const alive = simulation.playPossession();

    if (simulation.isFinished) {
      archiveGame(db, repository, game, simulation.result);
    }

    const tick = this.buildTick(repository, game, session, periodBefore, !alive);
    if (simulation.isFinished) {
      sessions.delete(gameId);
    }
    return tick;
  }

  /** Cambio ordenado desde el banquillo, en vivo. */
  substitute(gameId: string, outgoingId: string, incomingId: string): LiveOrderResult {
    return this.order(gameId, (simulation, teamId) =>
      simulation.orderSubstitution(teamId, outgoingId, incomingId)
    );
  }

  /** Tiempo muerto del equipo del usuario. */
  callTimeout(gameId: string): LiveOrderResult {
    return this.order(gameId, (simulation, teamId) => simulation.callTimeout(teamId));
  }

  /** La pizarra, sin parar el partido. */
  setLiveTactics(gameId: string, patch: LiveTacticsPatch): LiveOrderResult {
    return this.order(gameId, (simulation, teamId) =>
      simulation.setTactics(teamId, sanitizeTacticsPatch(patch))
    );
  }

  /** Devuelve la rotación al motor, o se la quita. */
  setAutoRotation(gameId: string, enabled: boolean): LiveOrderResult {
    return this.order(gameId, (simulation, teamId) => simulation.setAutoRotation(teamId, enabled));
  }

  /**
   * El camino común de todas las órdenes: encontrar el partido, comprobar que
   * es del usuario —nadie dirige al rival— y devolver el banquillo como quede.
   */
  private order(
    gameId: string,
    apply: (simulation: GameSimulation, teamId: string) => OrderResult
  ): LiveOrderResult {
    const db = this.resolveDb();
    const repository = new MatchRepository(db);
    const game = repository.findGame(gameId);
    if (!game) {
      throw new GameNotFoundError(gameId);
    }

    const managedTeamId = repository.userTeamFor(game);
    const side = managedSideOf(game, managedTeamId);
    if (!side || !managedTeamId) {
      return { ok: false, reason: 'Este partido no es tuyo', tick: null };
    }

    const session = this.requireSession(gameId, game);
    const result = apply(session.simulation, managedTeamId);
    const tick = this.buildTick(repository, game, session, session.simulation.nextPeriod, false);

    return { ok: result.ok, reason: result.ok ? null : result.reason, tick };
  }

  /** La sesión viva del partido, arrancándola si hiciera falta. */
  private requireSession(gameId: string, game: GameRow): LiveSession {
    const existing = sessions.get(gameId);
    if (existing) {
      return existing;
    }
    if (game.homeScore !== null) {
      throw new GameAlreadyPlayedError(gameId);
    }
    this.start(gameId);
    return sessions.get(gameId) as LiveSession;
  }

  /** Lo que la pantalla necesita tras una posesión o una orden. */
  private buildTick(
    repository: MatchRepository,
    game: GameRow,
    session: LiveSession,
    period: number,
    periodEnded: boolean
  ): LiveTick {
    const { simulation } = session;
    const result = simulation.result;
    const regulationPeriods = repository.rulesetForGame(game.id).periods;

    const all = narrate(repository, game, result.events, regulationPeriods);
    const lines = all.slice(session.deliveredLines);
    session.deliveredLines = all.length;

    const managedTeamId = repository.userTeamFor(game);
    const side = managedSideOf(game, managedTeamId);
    const rivalId = side === 'home' ? game.awayTeamId : game.homeTeamId;
    const bench = managedTeamId ? simulation.liveBench(managedTeamId) : null;
    const rivalBench = simulation.liveBench(rivalId);

    return {
      gameId: game.id,
      period,
      // Con el cuarto cerrado, el motor ya tiene puesto el reloj del siguiente:
      // decir eso aquí haría saltar el marcador a 10:00 justo al sonar la
      // bocina. Lo que la pantalla tiene que enseñar es el cero.
      clockSeconds: periodEnded ? 0 : simulation.clockSeconds,
      homeScore: result.home.score,
      awayScore: result.away.score,
      lines,
      periodEnded,
      finished: simulation.isFinished,
      bench: bench ? toBenchPlayers(repository, bench, managedTeamId as string) : null,
      timeoutsLeft: bench?.timeoutsLeft ?? 0,
      rivalTimeoutsLeft: rivalBench?.timeoutsLeft ?? 0,
      autoRotation: bench?.autoRotation ?? true
    };
  }

  /** Acta de un partido ya jugado, leída de la base de datos. */
  get(gameId: string): MatchState | null {
    const db = this.resolveDb();
    const repository = new MatchRepository(db);
    const game = repository.findGame(gameId);
    if (!game || game.homeScore === null || game.awayScore === null) {
      return null;
    }

    const stored = repository.listBoxScores(gameId);
    const managedTeamId = repository.userTeamFor(game);
    const cards = {
      home: repository.playerCards(game.homeTeamId),
      away: repository.playerCards(game.awayTeamId)
    };

    const toSide = (teamId: string, score: number, side: 'home' | 'away'): MatchTeamState => ({
      teamId,
      teamName: repository.teamName(teamId),
      score,
      boxScores: stored
        .filter((row) => row.teamId === teamId)
        .map((row) => toBoxScoreLine(row, cards[side].get(row.playerId)))
        .sort(byActaOrder)
    });

    const ruleset = repository.rulesetForGame(game.id);
    const regulationPeriods = ruleset.periods;
    const events = decodePlayByPlay(game.playByPlay, game);

    return {
      gameId: game.id,
      round: game.round,
      roundLabel: roundLabel(repository, game),
      scheduledOn: game.scheduledOn.getTime(),
      home: toSide(game.homeTeamId, game.homeScore, 'home'),
      away: toSide(game.awayTeamId, game.awayScore, 'away'),
      periods: repository.parsePeriodScores(game),
      playedPeriods: repository.parsePeriodScores(game).length,
      regulationPeriods,
      periodSeconds: ruleset.periodMinutes * 60,
      overtimeSeconds: ruleset.overtimeMinutes * 60,
      finished: true,
      managedSide: managedSideOf(game, managedTeamId),
      scouting: scoutRival(db, repository, game, managedTeamId),
      playByPlay: events ? narrate(repository, game, events, regulationPeriods) : null
    };
  }

  /**
   * Resuelve de una tacada un partido en el que no juega el usuario. Mismo
   * motor y mismo camino que el suyo, sólo que sin pararse entre cuartos.
   */
  simulateAiGame(db: SaveDatabase, game: GameRow, playedOn: Date): GameResult {
    const repository = new MatchRepository(db);
    const simulation = new GameSimulation({
      gameId: game.id,
      home: buildEngineTeam(db, game.homeTeamId, playedOn),
      away: buildEngineTeam(db, game.awayTeamId, playedOn),
      ruleset: repository.rulesetForGame(game.id),
      neutralVenue: game.neutralVenue
    });

    while (!simulation.isFinished) {
      simulation.playPeriod();
    }

    const result = simulation.result;
    repository.saveResult(game, result, playedOn, keptPlayByPlay(repository, game, result));
    applyPhysicalEffects(db, game.id, result, playedOn);
    applyClubEffects(db, game, result, playedOn, repository);
    return result;
  }
}

/**
 * Guarda el partido terminado: acta, retransmisión, piernas y caja.
 *
 * Pasa por aquí tanto el partido jugado cuarto a cuarto como el visto en vivo
 * posesión a posesión, que es lo que garantiza que verlo de una manera o de
 * otra deje exactamente lo mismo en la partida.
 */
function archiveGame(
  db: SaveDatabase,
  repository: MatchRepository,
  game: GameRow,
  result: GameResult
): void {
  const playedOn = repository.currentDate();
  repository.saveResult(game, result, playedOn, keptPlayByPlay(repository, game, result));
  applyPhysicalEffects(db, game.id, result, playedOn);
  applyClubEffects(db, game, result, playedOn, repository);
}

/** El banquillo del motor, con los nombres y las posiciones de la ficha puestos. */
function toBenchPlayers(
  repository: MatchRepository,
  bench: LiveBench,
  teamId: string
): LiveBenchPlayer[] {
  const cards = repository.playerCards(teamId);
  const depthOf = (playerId: string): number => cards.get(playerId)?.depth ?? 99;

  return (
    bench.players
      .map((player) => {
        const card = cards.get(player.playerId);
        return {
          playerId: player.playerId,
          playerName: card?.name ?? player.playerId,
          nationality: card?.nationality ?? '',
          position: card?.position ?? player.playedPosition,
          playedPosition: player.playedPosition,
          onCourt: player.onCourt,
          fouls: player.fouls,
          fouledOut: player.fouledOut,
          freshness: player.freshness,
          secondsPlayed: player.secondsPlayed,
          points: player.points
        };
      })
      // Los de pista arriba; debajo, el banquillo por orden de rotación.
      .sort(
        (a, b) => Number(b.onCourt) - Number(a.onCourt) || depthOf(a.playerId) - depthOf(b.playerId)
      )
  );
}

/**
 * La pizarra llega del renderer, así que se comprueba aquí: un sistema que no
 * existe o un deslizador fuera de rango se descarta en vez de colarse al motor.
 */
function sanitizeTacticsPatch(patch: LiveTacticsPatch): Partial<TeamTactics> {
  const clean: Partial<TeamTactics> = {};

  if (patch.offensiveSystem && patch.offensiveSystem in OFFENSIVE_SYSTEM_LABELS) {
    clean.offensiveSystem = patch.offensiveSystem as OffensiveSystem;
  }
  if (patch.defensiveSystem && patch.defensiveSystem in DEFENSIVE_SYSTEM_LABELS) {
    clean.defensiveSystem = patch.defensiveSystem as DefensiveSystem;
  }
  if (typeof patch.pace === 'number') {
    clean.pace = clampSlider(patch.pace);
  }
  if (typeof patch.defensiveIntensity === 'number') {
    clean.defensiveIntensity = clampSlider(patch.defensiveIntensity);
  }

  return clean;
}

function clampSlider(value: number): number {
  return Math.min(10, Math.max(1, Math.round(value)));
}

/**
 * Lo que el partido deja en las piernas: desgaste y, a veces, enfermería.
 *
 * Se hace aquí y no en el servicio de temporada porque el partido del usuario
 * termina dentro de este servicio, a botonazos, y el de la IA en una tacada: es
 * el único punto por el que pasan los dos.
 */
function applyPhysicalEffects(
  db: SaveDatabase,
  gameId: string,
  result: GameResult,
  playedOn: Date
): void {
  const margin = result.home.score - result.away.score;
  const game = new MatchRepository(db).findGame(gameId);
  const lines = [
    ...result.home.boxScores.map((line) => ({
      playerId: line.playerId,
      secondsPlayed: line.secondsPlayed,
      teamId: game?.homeTeamId,
      won: margin > 0,
      margin
    })),
    ...result.away.boxScores.map((line) => ({
      playerId: line.playerId,
      secondsPlayed: line.secondsPlayed,
      teamId: game?.awayTeamId,
      won: margin < 0,
      margin: -margin
    }))
  ];

  new FitnessService(() => db).applyGameEffects(gameId, lines, playedOn);
}

/**
 * Y lo que el partido deja en la caja y en el ánimo del consejo: taquilla y
 * ambiente si se jugaba en casa, y confianza siempre que juegue el usuario.
 */
function applyClubEffects(
  db: SaveDatabase,
  game: GameRow,
  result: GameResult,
  playedOn: Date,
  repository: MatchRepository
): void {
  const outcome = {
    homeTeamId: game.homeTeamId,
    awayTeamId: game.awayTeamId,
    homeScore: result.home.score,
    awayScore: result.away.score
  };

  // En sede neutral no hay taquilla de nadie: la Copa no llena tu pabellón.
  if (!game.neutralVenue) {
    new ClubService(() => db).collectHomeGame({
      ...outcome,
      seasonId: game.seasonId,
      date: playedOn,
      label: roundLabel(repository, game)
    });
  }

  new BoardService(() => db).afterManagedGame({
    ...outcome,
    // El consejo puso el objetivo en la liga: lo de fuera cuenta la mitad.
    secondary: repository.competitionForGame(game.id)?.format === 'continental'
  });
}

function requireUnplayedGame(repository: MatchRepository, gameId: string): GameRow {
  const game = repository.findGame(gameId);
  if (!game) {
    throw new GameNotFoundError(gameId);
  }
  if (game.homeScore !== null) {
    throw new GameAlreadyPlayedError(gameId);
  }
  return game;
}

function toMatchState(
  db: SaveDatabase,
  repository: MatchRepository,
  game: GameRow,
  result: GameResult,
  finished: boolean
): MatchState {
  const managedTeamId = repository.userTeamFor(game);
  const homeCards = repository.playerCards(game.homeTeamId);
  const awayCards = repository.playerCards(game.awayTeamId);
  const ruleset = repository.rulesetForGame(game.id);
  const regulationPeriods = ruleset.periods;

  return {
    gameId: game.id,
    round: game.round,
    roundLabel: roundLabel(repository, game),
    scheduledOn: game.scheduledOn.getTime(),
    home: {
      teamId: game.homeTeamId,
      teamName: repository.teamName(game.homeTeamId),
      score: result.home.score,
      boxScores: result.home.boxScores
        .map((line) => fromEngineLine(line, homeCards.get(line.playerId)))
        .sort(byActaOrder)
    },
    away: {
      teamId: game.awayTeamId,
      teamName: repository.teamName(game.awayTeamId),
      score: result.away.score,
      boxScores: result.away.boxScores
        .map((line) => fromEngineLine(line, awayCards.get(line.playerId)))
        .sort(byActaOrder)
    },
    periods: result.periods,
    playedPeriods: result.periods.length,
    regulationPeriods,
    periodSeconds: ruleset.periodMinutes * 60,
    overtimeSeconds: ruleset.overtimeMinutes * 60,
    finished,
    managedSide: managedSideOf(game, managedTeamId),
    scouting: scoutRival(db, repository, game, managedTeamId),
    playByPlay: narrate(repository, game, result.events, regulationPeriods)
  };
}

/** La retransmisión se guarda sólo si juega el usuario; ver `games.playByPlay`. */
function keptPlayByPlay(
  repository: MatchRepository,
  game: GameRow,
  result: GameResult
): string | null {
  return managedSideOf(game, repository.userTeamFor(game))
    ? encodePlayByPlay(result.events, game)
    : null;
}

function narrate(
  repository: MatchRepository,
  game: GameRow,
  events: readonly GameEvent[],
  regulationPeriods: number
): PlayLine[] {
  const ids = new Set<string>();
  for (const event of events) {
    if (event.playerId) ids.add(event.playerId);
    if (event.secondaryPlayerId) ids.add(event.secondaryPlayerId);
  }
  const names = repository.shortNames([...ids]);

  return narrateGame(events, {
    homeTeamId: game.homeTeamId,
    homeTeamName: repository.teamName(game.homeTeamId),
    awayTeamName: repository.teamName(game.awayTeamId),
    regulationPeriods,
    playerName: (playerId) => names.get(playerId) ?? '—'
  });
}

/**
 * Lo que el analista saca del rival antes de jugar.
 *
 * Es el único efecto del puesto y por eso es concreto: sistemas, ritmo,
 * intensidad y a quién van a buscar. Sin analista —o con uno de aprendiz— no se
 * ve nada, que es lo que hace que contratarlo signifique algo.
 */
function scoutRival(
  db: SaveDatabase,
  repository: MatchRepository,
  game: GameRow,
  managedTeamId: string | null
): MatchScouting | null {
  const side = managedSideOf(game, managedTeamId);
  if (!side || !managedTeamId) {
    return null;
  }

  const level = new StaffService(() => db).levels(managedTeamId).analyst;
  if (!analystRevealsRival(level)) {
    return null;
  }

  const rivalId = side === 'home' ? game.awayTeamId : game.homeTeamId;
  const tactics = repository.teamTactics(rivalId);
  if (!tactics) {
    return null;
  }

  return {
    teamId: rivalId,
    teamName: repository.teamName(rivalId),
    offensiveSystem: OFFENSIVE_SYSTEM_LABELS[tactics.offensiveSystem as OffensiveSystem],
    defensiveSystem: DEFENSIVE_SYSTEM_LABELS[tactics.defensiveSystem as DefensiveSystem],
    pace: tactics.pace,
    defensiveIntensity: tactics.defensiveIntensity,
    focusPlayerName: tactics.focusPlayerId ? repository.playerName(tactics.focusPlayerId) : null
  };
}

/**
 * Cómo se llama este partido: una jornada de liga o un partido de una serie.
 *
 * En playoffs el número de jornada no dice nada —el tercero de unas semifinales
 * no es «la jornada 3»— así que la cabecera necesita el nombre de la ronda y el
 * número de partido dentro de la eliminatoria.
 */
function roundLabel(repository: MatchRepository, game: GameRow): string {
  const competition = repository.competitionForGame(game.id);

  // La Copa no tiene jornadas: tiene rondas, y se juega a partido único.
  if (competition?.format === 'cup') {
    return `${competition.name} · ${cupRoundName(CUP_TEAMS / Math.pow(2, game.round - 1))}`;
  }

  // Selecciones: la clasificación va por jornadas y el Mundial por rondas.
  if (competition?.format === 'national-qualifiers') {
    return `${competition.name} · jornada ${game.round}`;
  }
  if (competition?.format === 'national-tournament') {
    return `${competition.name} · ${worldCupRoundName(game.round)}`;
  }

  // Europa sí tiene jornadas, pero también cuartos y Final Four.
  if (competition?.format === 'continental') {
    return `${competition.name} · ${continentalRoundName(game.round)}`;
  }

  if (!game.seriesId) {
    return `Jornada ${game.round}`;
  }
  if (!competition || competition.playoffTeams < 2) {
    return 'Playoffs';
  }

  const format = buildPlayoffFormat(competition.playoffTeams, competition.playoffSeriesLength);
  const name = format[game.round - 1]?.name ?? 'Playoffs';
  const ordinal = game.seriesGame === 3 ? '3er' : `${game.seriesGame}º`;

  return `${name} · ${ordinal} partido`;
}

function managedSideOf(game: GameRow, managedTeamId: string | null): 'home' | 'away' | null {
  if (managedTeamId === game.homeTeamId) {
    return 'home';
  }
  if (managedTeamId === game.awayTeamId) {
    return 'away';
  }
  return null;
}

function fromEngineLine(line: PlayerBoxScore, card: PlayerCard | undefined): BoxScoreLine {
  return {
    playerId: line.playerId,
    playerName: card?.name ?? line.playerId,
    nationality: card?.nationality ?? '',
    position: card?.position ?? ('SF' as Position),
    depth: card?.depth ?? 99,
    secondsPlayed: line.secondsPlayed,
    points: points(line),
    twoPointMade: line.twoPointMade,
    twoPointAttempted: line.twoPointAttempted,
    threePointMade: line.threePointMade,
    threePointAttempted: line.threePointAttempted,
    freeThrowMade: line.freeThrowMade,
    freeThrowAttempted: line.freeThrowAttempted,
    offensiveRebounds: line.offensiveRebounds,
    defensiveRebounds: line.defensiveRebounds,
    assists: line.assists,
    steals: line.steals,
    blocks: line.blocks,
    turnovers: line.turnovers,
    fouls: line.fouls,
    plusMinus: line.plusMinus,
    efficiency: efficiencyRating(line)
  };
}

function toBoxScoreLine(
  row: {
    playerId: string;
    secondsPlayed: number;
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
    foulsDrawn: number;
    plusMinus: number;
  },
  card: PlayerCard | undefined
): BoxScoreLine {
  return fromEngineLine(row as PlayerBoxScore, card);
}

/** Orden del acta: titulares primero, y dentro de cada grupo el que más jugó. */
function byActaOrder(a: BoxScoreLine, b: BoxScoreLine): number {
  return a.depth - b.depth || b.secondsPlayed - a.secondsPlayed;
}
