import { efficiencyRating, points, type PlayerBoxScore } from '@shared/domain/box-score';
import { buildPlayoffFormat } from '@shared/domain/playoffs';
import type { Position } from '@shared/domain/positions';
import type { BoxScoreLine, MatchState, MatchTeamState } from '@shared/contracts/match.contract';
import { GameSimulation, type GameResult } from '@shared/engine/basketball';
import type { SaveDatabase } from '../../database/save-database';
import type { GameRow } from '../../database/schema/save';
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

    return toMatchState(repository, game, simulation.result, simulation.isFinished);
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
      repository.saveResult(game, result, repository.currentDate());
      sessions.delete(gameId);
    }

    return toMatchState(repository, game, result, simulation.isFinished);
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
      managedSide: managedSideOf(game, managedTeamId)
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
    return result;
  }
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
    managedSide: managedSideOf(game, managedTeamId)
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
