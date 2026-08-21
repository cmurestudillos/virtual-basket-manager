import { randomUUID } from 'node:crypto';
import type {
  AdvanceResult,
  FixtureEntry,
  SeasonSummary,
  StandingEntry
} from '@shared/contracts/season.contract';
import { generateDoubleRoundRobin, matchdayDate } from '@shared/domain/schedule';
import { computeStandings, type PlayedGame } from '@shared/domain/standings';
import type { SaveDatabase } from '../../database/save-database';
import type { GameRow, NewGameRow, SeasonRow } from '../../database/schema/save';
import { MatchService } from '../match/match.service';
import { SeasonRepository } from './season.repository';

const DAY_MS = 24 * 60 * 60 * 1000;
/** Tope de días que se saltan de una vez, por si el calendario se queda sin partidos. */
const MAX_DAYS_SKIPPED = 400;

export class NoManagedTeamError extends Error {
  constructor() {
    super('La partida no tiene equipo asignado');
    this.name = 'NoManagedTeamError';
  }
}

export class SeasonService {
  private readonly matchService: MatchService;

  /**
   * La conexión llega como resolutor y no como instancia porque la partida
   * activa cambia en caliente: el usuario puede salir al menú y cargar otra sin
   * cerrar la aplicación. Además deja el servicio probable sin Electron, que es
   * lo que permite jugar una temporada entera en un test.
   */
  constructor(private readonly resolveDb: () => SaveDatabase) {
    this.matchService = new MatchService(resolveDb);
  }

  /**
   * Temporada en curso, creándola si aún no existe.
   *
   * La creación es perezosa y no parte del sembrado de la partida: la
   * temporada siguiente se crea exactamente igual, así que hay un único sitio
   * donde se genera un calendario.
   */
  getCurrent(): SeasonSummary {
    const repository = new SeasonRepository(this.resolveDb());
    const season = this.ensureSeason(repository);
    const competition = repository.competitionOfTeam(this.requireManagedTeam(repository));
    const games = repository.listGames(season.id);

    return {
      id: season.id,
      competitionId: season.competitionId,
      competitionName: competition.name,
      seasonNumber: season.seasonNumber,
      startYear: season.startYear,
      currentRound: season.currentRound,
      totalRounds: games.reduce((max, game) => Math.max(max, game.round), 0),
      stage: season.stage as SeasonSummary['stage']
    };
  }

  getStandings(): StandingEntry[] {
    const repository = new SeasonRepository(this.resolveDb());
    const season = this.ensureSeason(repository);
    const managedTeamId = repository.gameState().managedTeamId;
    const names = repository.teamNames();

    const teamIds = repository.teamIdsInCompetition(season.competitionId);
    const played: PlayedGame[] = repository
      .listGames(season.id)
      .filter(isPlayed)
      .map((game) => ({
        homeTeamId: game.homeTeamId,
        awayTeamId: game.awayTeamId,
        homeScore: game.homeScore as number,
        awayScore: game.awayScore as number
      }));

    return computeStandings(teamIds, played).map((row) => ({
      ...row,
      teamName: names.get(row.teamId) ?? row.teamId,
      isManaged: row.teamId === managedTeamId
    }));
  }

  listFixtures(round?: number): FixtureEntry[] {
    const repository = new SeasonRepository(this.resolveDb());
    const season = this.ensureSeason(repository);
    const games =
      round === undefined
        ? repository.listGames(season.id)
        : repository.listGamesInRound(season.id, round);

    return this.toFixtures(repository, games);
  }

  listTeamFixtures(teamId: string): FixtureEntry[] {
    const repository = new SeasonRepository(this.resolveDb());
    const season = this.ensureSeason(repository);
    return this.toFixtures(repository, repository.listTeamGames(season.id, teamId));
  }

  /** Próximo partido del equipo del usuario, jugado o no. */
  getNextGame(): FixtureEntry | null {
    const repository = new SeasonRepository(this.resolveDb());
    const season = this.ensureSeason(repository);
    const managedTeamId = this.requireManagedTeam(repository);

    const next = repository.listTeamGames(season.id, managedTeamId).find((game) => !isPlayed(game));

    return next ? (this.toFixtures(repository, [next])[0] as FixtureEntry) : null;
  }

  /**
   * Avanza un día del calendario del juego.
   *
   * El día no pasa mientras quede pendiente un partido del equipo del usuario:
   * ese lo juega él, cuarto a cuarto. Los demás se resuelven aquí.
   */
  advanceDay(): AdvanceResult {
    const db = this.resolveDb();
    const repository = new SeasonRepository(db);
    const season = this.ensureSeason(repository);
    const state = repository.gameState();
    const managedTeamId = this.requireManagedTeam(repository);

    const pending = repository.listPendingGamesUpTo(season.id, state.currentDate);
    const userGame = pending.find(
      (game) => game.homeTeamId === managedTeamId || game.awayTeamId === managedTeamId
    );
    if (userGame) {
      return { status: 'userGame', gameId: userGame.id, date: state.currentDate.getTime() };
    }

    const playedGameIds: string[] = [];
    for (const game of pending) {
      this.matchService.simulateAiGame(db, game, state.currentDate);
      playedGameIds.push(game.id);
      repository.setCurrentRound(season.id, game.round);
    }

    const nextDate = new Date(state.currentDate.getTime() + DAY_MS);
    repository.setCurrentDate(nextDate);

    return { status: 'advanced', date: nextDate.getTime(), playedGameIds };
  }

  /**
   * Se salta los días vacíos y para en el siguiente con partidos: o los juega
   * (si son todos de la IA) o devuelve el del usuario para que lo juegue él.
   */
  advanceToNextGame(): AdvanceResult {
    const repository = new SeasonRepository(this.resolveDb());
    const season = this.ensureSeason(repository);

    const nextScheduled = repository.nextScheduledDate(season.id);
    if (!nextScheduled) {
      const date = repository.gameState().currentDate;
      return { status: 'seasonOver', date: date.getTime() };
    }

    // Si el próximo partido es más adelante, se salta el hueco de golpe en vez
    // de avanzar día a día: entre jornadas hay seis días vacíos y no tiene
    // sentido hacer seis viajes a la base de datos por cada uno.
    const today = repository.gameState().currentDate;
    if (nextScheduled.getTime() > today.getTime()) {
      repository.setCurrentDate(nextScheduled);
    }

    for (let guard = 0; guard < MAX_DAYS_SKIPPED; guard += 1) {
      const result = this.advanceDay();
      if (result.status !== 'advanced' || result.playedGameIds.length > 0) {
        return result;
      }
    }

    return { status: 'seasonOver', date: repository.gameState().currentDate.getTime() };
  }

  // ------------------------------------------------------------------------

  private requireManagedTeam(repository: SeasonRepository): string {
    const managedTeamId = repository.gameState().managedTeamId;
    if (!managedTeamId) {
      throw new NoManagedTeamError();
    }
    return managedTeamId;
  }

  /** Devuelve la temporada en curso, generando calendario si es la primera vez. */
  private ensureSeason(repository: SeasonRepository): SeasonRow {
    const state = repository.gameState();
    const managedTeamId = this.requireManagedTeam(repository);
    const competition = repository.competitionOfTeam(managedTeamId);

    const existing = repository.findSeason(competition.id, state.seasonNumber);
    if (existing) {
      return existing;
    }

    // El año de arranque sale de la fecha del juego, no del reloj real: una
    // partida empezada en septiembre de 2025 juega la temporada 2025-26 aunque
    // se juegue en 2030.
    const startYear = state.currentDate.getUTCFullYear();
    const season: SeasonRow = {
      id: randomUUID(),
      competitionId: competition.id,
      seasonNumber: state.seasonNumber,
      startYear,
      currentRound: 1,
      stage: 'regular'
    };
    repository.insertSeason(season);

    const teamIds = repository.teamIdsInCompetition(competition.id);
    const rounds = generateDoubleRoundRobin(teamIds);
    const games: NewGameRow[] = rounds.flatMap((pairings, index) =>
      pairings.map((pairing) => ({
        id: randomUUID(),
        seasonId: season.id,
        round: index + 1,
        scheduledOn: matchdayDate(startYear, index + 1),
        homeTeamId: pairing.homeTeamId,
        awayTeamId: pairing.awayTeamId,
        neutralVenue: false
      }))
    );
    repository.insertGames(games);

    return season;
  }

  private toFixtures(repository: SeasonRepository, games: readonly GameRow[]): FixtureEntry[] {
    const names = repository.teamNames();
    const managedTeamId = repository.gameState().managedTeamId;

    return games.map((game) => ({
      gameId: game.id,
      round: game.round,
      scheduledOn: game.scheduledOn.getTime(),
      homeTeamId: game.homeTeamId,
      homeTeamName: names.get(game.homeTeamId) ?? game.homeTeamId,
      awayTeamId: game.awayTeamId,
      awayTeamName: names.get(game.awayTeamId) ?? game.awayTeamId,
      homeScore: game.homeScore,
      awayScore: game.awayScore,
      overtimes: game.overtimes,
      played: isPlayed(game),
      involvesManaged: game.homeTeamId === managedTeamId || game.awayTeamId === managedTeamId
    }));
  }
}

function isPlayed(game: GameRow): boolean {
  return game.homeScore !== null && game.awayScore !== null;
}
