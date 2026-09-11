import { efficiencyRating, points, type PlayerBoxScore } from '@shared/domain/box-score';
import { buildPlayoffFormat } from '@shared/domain/playoffs';
import { analystRevealsRival } from '@shared/domain/staff';
import {
  DEFENSIVE_SYSTEM_LABELS,
  OFFENSIVE_SYSTEM_LABELS,
  type DefensiveSystem,
  type OffensiveSystem
} from '@shared/domain/tactics';
import type { Position } from '@shared/domain/positions';
import type {
  BoxScoreLine,
  MatchScouting,
  MatchState,
  MatchTeamState
} from '@shared/contracts/match.contract';
import { GameSimulation, type GameResult } from '@shared/engine/basketball';
import type { SaveDatabase } from '../../database/save-database';
import type { GameRow } from '../../database/schema/save';
import { StaffService } from '../staff/staff.service';
import { BoardService } from '../club/board.service';
import { ClubService } from '../club/club.service';
import { FitnessService } from '../fitness/fitness.service';
import { buildEngineTeam } from './engine-input';
import { MatchRepository, type PlayerCard } from './match.repository';

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
const sessions = new Map<string, GameSimulation>();

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
      home: buildEngineTeam(db, game.homeTeamId),
      away: buildEngineTeam(db, game.awayTeamId),
      ruleset: repository.rulesetForGame(game.id),
      neutralVenue: game.neutralVenue
    });
    sessions.set(gameId, simulation);

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
    const simulation = sessions.get(gameId);
    if (!simulation) {
      const stored = this.get(gameId);
      if (stored) {
        return stored;
      }
      return this.start(gameId);
    }

    simulation.playPeriod();
    const result = simulation.result;

    if (simulation.isFinished) {
      const playedOn = repository.currentDate();
      repository.saveResult(game, result, playedOn);
      applyPhysicalEffects(db, game.id, result, playedOn);
      applyClubEffects(db, game, result, playedOn, roundLabel(repository, game));
      sessions.delete(gameId);
    }

    return toMatchState(db, repository, game, result, simulation.isFinished);
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
    const managedTeamId = repository.managedTeamId();
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

    return {
      gameId: game.id,
      round: game.round,
      roundLabel: roundLabel(repository, game),
      scheduledOn: game.scheduledOn.getTime(),
      home: toSide(game.homeTeamId, game.homeScore, 'home'),
      away: toSide(game.awayTeamId, game.awayScore, 'away'),
      periods: repository.parsePeriodScores(game),
      playedPeriods: repository.parsePeriodScores(game).length,
      regulationPeriods: repository.rulesetForGame(game.id).periods,
      finished: true,
      managedSide: managedSideOf(game, managedTeamId),
      scouting: scoutRival(db, repository, game, managedTeamId)
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
      home: buildEngineTeam(db, game.homeTeamId),
      away: buildEngineTeam(db, game.awayTeamId),
      ruleset: repository.rulesetForGame(game.id),
      neutralVenue: game.neutralVenue
    });

    while (!simulation.isFinished) {
      simulation.playPeriod();
    }

    const result = simulation.result;
    repository.saveResult(game, result, playedOn);
    applyPhysicalEffects(db, game.id, result, playedOn);
    applyClubEffects(db, game, result, playedOn, roundLabel(repository, game));
    return result;
  }
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
  const lines = [...result.home.boxScores, ...result.away.boxScores].map((line) => ({
    playerId: line.playerId,
    secondsPlayed: line.secondsPlayed
  }));

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
  label: string
): void {
  const outcome = {
    homeTeamId: game.homeTeamId,
    awayTeamId: game.awayTeamId,
    homeScore: result.home.score,
    awayScore: result.away.score
  };

  new ClubService(() => db).collectHomeGame({
    ...outcome,
    seasonId: game.seasonId,
    date: playedOn,
    label
  });
  new BoardService(() => db).afterManagedGame(outcome);
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
  const managedTeamId = repository.managedTeamId();
  const homeCards = repository.playerCards(game.homeTeamId);
  const awayCards = repository.playerCards(game.awayTeamId);

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
    regulationPeriods: repository.rulesetForGame(game.id).periods,
    finished,
    managedSide: managedSideOf(game, managedTeamId),
    scouting: scoutRival(db, repository, game, managedTeamId)
  };
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
  if (!game.seriesId) {
    return `Jornada ${game.round}`;
  }

  const competition = repository.competitionForGame(game.id);
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
