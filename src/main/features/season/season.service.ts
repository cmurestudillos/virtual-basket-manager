import { randomUUID } from 'node:crypto';
import type {
  AdvanceResult,
  FixtureEntry,
  PlayoffBracket,
  PlayoffSeries,
  SeasonSummary,
  StandingEntry
} from '@shared/contracts/season.contract';
import {
  buildPlayoffFormat,
  firstRoundPairings,
  homeAdvantagePattern,
  nextRoundPairings,
  seriesWinner,
  seriesWins,
  type PlayoffRound,
  type SeriesPairing
} from '@shared/domain/playoffs';
import {
  firstPlayoffDate,
  generateDoubleRoundRobin,
  matchdayDate,
  nextPlayoffRoundStart,
  playoffGameDate
} from '@shared/domain/schedule';
import { computeStandings, type PlayedGame, type StandingRow } from '@shared/domain/standings';
import type { SaveDatabase } from '../../database/save-database';
import type { CompetitionRow, GameRow, NewGameRow, SeasonRow } from '../../database/schema/save';
import { BoardService } from '../club/board.service';
import { ClubService } from '../club/club.service';
import { FitnessService } from '../fitness/fitness.service';
import { MarketService } from '../market/market.service';
import { YouthService } from '../youth/youth.service';
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

export class DismissedError extends Error {
  constructor() {
    super('El consejo te ha destituido');
    this.name = 'DismissedError';
  }
}

export class SeasonNotFinishedError extends Error {
  constructor() {
    super('La temporada todavía no ha terminado');
    this.name = 'SeasonNotFinishedError';
  }
}

/** Una eliminatoria reconstruida a partir de sus partidos. */
interface SeriesState {
  seriesId: string;
  round: number;
  roundName: string;
  bestOf: number;
  pairing: SeriesPairing;
  games: GameRow[];
  wins: { higher: number; lower: number };
  winnerTeamId: string | null;
}

export class SeasonService {
  private readonly matchService: MatchService;
  private readonly fitnessService: FitnessService;
  private readonly clubService: ClubService;
  private readonly boardService: BoardService;
  private readonly youthService: YouthService;
  private readonly marketService: MarketService;

  /**
   * La conexión llega como resolutor y no como instancia porque la partida
   * activa cambia en caliente: el usuario puede salir al menú y cargar otra sin
   * cerrar la aplicación. Además deja el servicio probable sin Electron, que es
   * lo que permite jugar una temporada entera en un test.
   */
  constructor(private readonly resolveDb: () => SaveDatabase) {
    this.matchService = new MatchService(resolveDb);
    this.fitnessService = new FitnessService(resolveDb);
    this.clubService = new ClubService(resolveDb);
    this.boardService = new BoardService(resolveDb);
    this.youthService = new YouthService(resolveDb);
    this.marketService = new MarketService(resolveDb);
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
    const season = this.ensureStage(repository);
    const competition = repository.competitionOfTeam(this.requireManagedTeam(repository));
    const games = repository.listRegularGames(season.id);

    return {
      id: season.id,
      competitionId: season.competitionId,
      competitionName: competition.name,
      seasonNumber: season.seasonNumber,
      startYear: season.startYear,
      currentRound: season.currentRound,
      totalRounds: games.reduce((max, game) => Math.max(max, game.round), 0),
      stage: season.stage as SeasonSummary['stage'],
      playoffTeams: competition.playoffTeams,
      championTeamId: season.championTeamId,
      championTeamName: season.championTeamId
        ? (repository.teamNames().get(season.championTeamId) ?? null)
        : null
    };
  }

  getStandings(): StandingEntry[] {
    const repository = new SeasonRepository(this.resolveDb());
    const season = this.ensureSeason(repository);
    const managedTeamId = repository.gameState().managedTeamId;
    const names = repository.teamNames();

    return this.regularStandings(repository, season).map((row) => ({
      ...row,
      teamName: names.get(row.teamId) ?? row.teamId,
      isManaged: row.teamId === managedTeamId
    }));
  }

  /** Calendario de liga regular. Los playoffs tienen su propio cuadro. */
  listFixtures(round?: number): FixtureEntry[] {
    const repository = new SeasonRepository(this.resolveDb());
    const season = this.ensureSeason(repository);
    const games = repository
      .listRegularGames(season.id)
      .filter((game) => round === undefined || game.round === round);

    return this.toFixtures(repository, games);
  }

  /** Todos los partidos de un equipo, playoffs incluidos. */
  listTeamFixtures(teamId: string): FixtureEntry[] {
    const repository = new SeasonRepository(this.resolveDb());
    const season = this.ensureSeason(repository);
    return this.toFixtures(repository, repository.listTeamGames(season.id, teamId));
  }

  /** Próximo partido del equipo del usuario, jugado o no. */
  getNextGame(): FixtureEntry | null {
    const repository = new SeasonRepository(this.resolveDb());
    const season = this.ensureStage(repository);
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
    const season = this.ensureStage(repository);
    const state = repository.gameState();
    const managedTeamId = this.requireManagedTeam(repository);

    if (this.boardService.isDismissed()) {
      return { status: 'dismissed', date: state.currentDate.getTime() };
    }

    if (season.stage === 'finished') {
      return { status: 'seasonOver', date: state.currentDate.getTime() };
    }

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
      if (!game.seriesId) {
        repository.setCurrentRound(season.id, game.round);
      }
    }

    // El cuadro se mueve aquí: una serie que acaba de decidirse suelta sus
    // partidos sobrantes y, si con ella se cierra la ronda, deja montada la
    // siguiente antes de que nadie vuelva a preguntar por el calendario.
    this.ensureStage(repository);

    const nextDate = new Date(state.currentDate.getTime() + DAY_MS);
    repository.setCurrentDate(nextDate);
    this.advanceCalendar(repository, season, state.currentDate, nextDate);

    return { status: 'advanced', date: nextDate.getTime(), playedGameIds };
  }

  /**
   * Se salta los días vacíos y para en el siguiente con partidos: o los juega
   * (si son todos de la IA) o devuelve el del usuario para que lo juegue él.
   */
  advanceToNextGame(): AdvanceResult {
    const repository = new SeasonRepository(this.resolveDb());
    const season = this.ensureStage(repository);

    const nextScheduled = repository.nextScheduledDate(season.id);
    if (!nextScheduled || season.stage === 'finished') {
      const date = repository.gameState().currentDate;
      return { status: 'seasonOver', date: date.getTime() };
    }

    // Si el próximo partido es más adelante, se salta el hueco de golpe en vez
    // de avanzar día a día: entre jornadas hay seis días vacíos y no tiene
    // sentido hacer seis viajes a la base de datos por cada uno.
    const today = repository.gameState().currentDate;
    if (nextScheduled.getTime() > today.getTime()) {
      repository.setCurrentDate(nextScheduled);
      // Los días que se saltan también cuentan: sin esto, ir a la jornada
      // saldría gratis y no habría ni recuperación, ni entrenamiento, ni
      // nóminas que pagar.
      this.advanceCalendar(repository, season, today, nextScheduled);
    }

    for (let guard = 0; guard < MAX_DAYS_SKIPPED; guard += 1) {
      const result = this.advanceDay();
      if (result.status !== 'advanced' || result.playedGameIds.length > 0) {
        return result;
      }
    }

    return { status: 'seasonOver', date: repository.gameState().currentDate.getTime() };
  }

  /** Cuadro de playoffs; `null` mientras la liga regular no haya acabado. */
  getPlayoffs(): PlayoffBracket | null {
    const repository = new SeasonRepository(this.resolveDb());
    const season = this.ensureStage(repository);
    const competition = repository.competitionOfTeam(this.requireManagedTeam(repository));
    if (competition.playoffTeams < 2) {
      return null;
    }

    const series = this.readSeries(repository, season, competition);
    if (series.length === 0) {
      return null;
    }

    const names = repository.teamNames();
    const managedTeamId = repository.gameState().managedTeamId;
    const format = buildPlayoffFormat(competition.playoffTeams, competition.playoffSeriesLength);

    return {
      rounds: format
        .map((round) => ({
          round: round.round,
          name: round.name,
          bestOf: round.bestOf,
          series: series
            .filter((entry) => entry.round === round.round)
            .map((entry) => this.toPlayoffSeries(repository, entry, names, managedTeamId))
        }))
        .filter((round) => round.series.length > 0),
      championTeamId: season.championTeamId,
      championTeamName: season.championTeamId ? (names.get(season.championTeamId) ?? null) : null
    };
  }

  /**
   * Cierra la temporada terminada y arranca la siguiente.
   *
   * Lo único que hace es mover el reloj al 1 de septiembre siguiente y subir el
   * número de temporada: el calendario nuevo lo genera {@link ensureSeason} la
   * primera vez que alguien pregunte, igual que el de la primera temporada.
   */
  startNextSeason(): SeasonSummary {
    const repository = new SeasonRepository(this.resolveDb());
    // Lo primero, porque es lo más definitivo: a un destituido no le toca
    // decidir si empieza otra temporada.
    if (this.boardService.isDismissed()) {
      throw new DismissedError();
    }

    const season = this.ensureStage(repository);
    if (season.stage !== 'finished') {
      throw new SeasonNotFinishedError();
    }

    const today = repository.gameState().currentDate;
    const nextSeasonStart = new Date(Date.UTC(season.startYear + 1, 8, 1));
    repository.setSeasonNumber(season.seasonNumber + 1);
    repository.setCurrentDate(nextSeasonStart);
    // El verano devuelve a todos a cien; las bajas largas siguen corriendo.
    this.fitnessService.startNewSeason(today, nextSeasonStart);
    // Y el mercado se mueve solo: vencen contratos y la IA cubre sus huecos.
    this.marketService.processOffseason(nextSeasonStart);

    return this.getCurrent();
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
      stage: 'regular',
      championTeamId: null
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

    // Pretemporada del club: se renuevan los abonos y entran televisión y
    // patrocinio. Y el consejo pone el objetivo del curso.
    this.clubService.collectPreseason(season.id, state.currentDate);
    this.boardService.ensureForSeason(season.seasonNumber, teamIds.length);
    // Y sale la hornada del verano, para toda la liga.
    this.youthService.runIntake(season.seasonNumber, startYear);

    return season;
  }

  /**
   * La temporada, con su fase al día.
   *
   * Aquí es donde la liga regular se convierte en playoffs, donde una ronda da
   * paso a la siguiente y donde se corona al campeón. Se llama al leer y al
   * avanzar el día, y es idempotente: si no hay nada que mover, no mueve nada.
   */
  private ensureStage(repository: SeasonRepository): SeasonRow {
    const season = this.ensureSeason(repository);
    if (season.stage === 'finished') {
      return season;
    }

    const competition = repository.competitionOfTeam(this.requireManagedTeam(repository));
    const regular = repository.listRegularGames(season.id);
    const regularFinished = regular.length > 0 && regular.every(isPlayed);

    // Una liga sin playoffs corona al primero de la fase regular, como media
    // Europa. No es el caso de la liga del juego, pero el formato existe.
    if (competition.playoffTeams < 2) {
      if (regularFinished) {
        const champion = this.regularStandings(repository, season)[0];
        if (champion) {
          repository.setChampion(season.id, champion.teamId);
        }
        this.closeClubSeason(repository, season, champion?.teamId ?? null);
        repository.setStage(season.id, 'finished');
      }
      return repository.findSeasonById(season.id) ?? season;
    }

    if (season.stage === 'regular') {
      if (!regularFinished) {
        return season;
      }
      this.createFirstPlayoffRound(repository, season, competition, regular);
      repository.setStage(season.id, 'playoffs');
    }

    this.settlePlayoffs(repository, season, competition);

    return repository.findSeasonById(season.id) ?? season;
  }

  /**
   * Lo que trae el paso del tiempo, además de partidos.
   *
   * Un día de calendario es descanso y, si toca, entrenamiento; el primero de
   * mes es además nóminas, mantenimiento y revisión del consejo. Recibe el
   * tramo entero porque el reloj avanza a saltos: «ir a la jornada» se come
   * seis días de una vez y ninguno puede salir gratis.
   */
  private advanceCalendar(
    repository: SeasonRepository,
    season: SeasonRow,
    from: Date,
    to: Date
  ): void {
    this.fitnessService.advanceDays(from, to);

    const months = monthStartsBetween(from, to);
    if (months.length === 0) {
      return;
    }

    const managedTeamId = repository.gameState().managedTeamId;
    const position = this.regularStandings(repository, season).find(
      (row) => row.teamId === managedTeamId
    )?.position;

    for (const monthStart of months) {
      this.clubService.payMonthly(season.id, monthStart);
      if (position !== undefined) {
        this.boardService.monthlyReview(position);
      }
    }
  }

  /** Cierre de curso del club: premios en la caja y veredicto del consejo. */
  private closeClubSeason(
    repository: SeasonRepository,
    season: SeasonRow,
    championTeamId: string | null
  ): void {
    const managedTeamId = repository.gameState().managedTeamId;
    const standings = this.regularStandings(repository, season);
    const managed = standings.find((row) => row.teamId === managedTeamId);
    if (!managed || !managedTeamId) {
      return;
    }

    const result = {
      position: managed.position,
      teams: standings.length,
      playoffRound: this.playoffRoundOf(repository, season, managedTeamId),
      champion: championTeamId === managedTeamId
    };

    this.clubService.payPrizes(season.id, repository.gameState().currentDate, result);
    this.boardService.closeSeason(result);
  }

  /** Hasta dónde llegó un equipo en el cuadro: 0 fuera, 1 cuartos, 2 semis, 3 final. */
  private playoffRoundOf(repository: SeasonRepository, season: SeasonRow, teamId: string): number {
    const competition = repository.competitionOfTeam(teamId);
    if (competition.playoffTeams < 2) {
      return 0;
    }

    return this.readSeries(repository, season, competition).reduce(
      (deepest, entry) =>
        entry.pairing.higherSeedTeamId === teamId || entry.pairing.lowerSeedTeamId === teamId
          ? Math.max(deepest, entry.round)
          : deepest,
      0
    );
  }

  /** Clasificación de la liga regular, sin contar los playoffs. */
  private regularStandings(repository: SeasonRepository, season: SeasonRow): StandingRow[] {
    const teamIds = repository.teamIdsInCompetition(season.competitionId);
    const played: PlayedGame[] = repository
      .listRegularGames(season.id)
      .filter(isPlayed)
      .map((game) => ({
        homeTeamId: game.homeTeamId,
        awayTeamId: game.awayTeamId,
        homeScore: game.homeScore as number,
        awayScore: game.awayScore as number
      }));

    return computeStandings(teamIds, played);
  }

  /** Puesto de cada equipo en la liga regular: es lo que reparte el factor cancha. */
  private regularSeeds(repository: SeasonRepository, season: SeasonRow): Map<string, number> {
    return new Map(
      this.regularStandings(repository, season).map((row) => [row.teamId, row.position])
    );
  }

  private createFirstPlayoffRound(
    repository: SeasonRepository,
    season: SeasonRow,
    competition: CompetitionRow,
    regular: readonly GameRow[]
  ): void {
    const format = buildPlayoffFormat(competition.playoffTeams, competition.playoffSeriesLength);
    const qualified = this.regularStandings(repository, season)
      .slice(0, competition.playoffTeams)
      .map((row) => row.teamId);

    const lastMatchday = regular.reduce(
      (latest, game) => (game.scheduledOn > latest ? game.scheduledOn : latest),
      regular[0]?.scheduledOn ?? new Date()
    );

    this.createRound(
      repository,
      season,
      format[0] as PlayoffRound,
      firstRoundPairings(qualified),
      firstPlayoffDate(lastMatchday)
    );
  }

  /**
   * Mueve el cuadro: recoge las series decididas, tira los partidos que ya no
   * hacen falta y, cuando la ronda está cerrada, monta la siguiente o corona.
   */
  private settlePlayoffs(
    repository: SeasonRepository,
    season: SeasonRow,
    competition: CompetitionRow
  ): void {
    const format = buildPlayoffFormat(competition.playoffTeams, competition.playoffSeriesLength);
    const series = this.readSeries(repository, season, competition);
    if (series.length === 0) {
      return;
    }

    const currentRound = series.reduce((max, entry) => Math.max(max, entry.round), 1);
    const inRound = series.filter((entry) => entry.round === currentRound);

    for (const entry of inRound) {
      if (entry.winnerTeamId) {
        // Un 2-0 en una serie al mejor de 3 deja el tercer partido sin sentido:
        // se borra en vez de quedarse pendiente para siempre bloqueando el reloj.
        repository.deleteGames(
          entry.games.filter((game) => !isPlayed(game)).map((game) => game.id)
        );
      }
    }

    if (!inRound.every((entry) => entry.winnerTeamId)) {
      return;
    }

    if (currentRound >= format.length) {
      const champion = (inRound[0] as SeriesState).winnerTeamId as string;
      repository.setChampion(season.id, champion);
      this.closeClubSeason(repository, season, champion);
      repository.setStage(season.id, 'finished');
      return;
    }

    const seeds = this.regularSeeds(repository, season);
    const winners = inRound.map((entry) => ({
      teamId: entry.winnerTeamId as string,
      seed: seeds.get(entry.winnerTeamId as string) ?? 99
    }));

    const roundStart = inRound.reduce((earliest, entry) => {
      const first = entry.games[0]?.scheduledOn ?? earliest;
      return first < earliest ? first : earliest;
    }, inRound[0]?.games[0]?.scheduledOn ?? repository.gameState().currentDate);

    this.createRound(
      repository,
      season,
      format[currentRound] as PlayoffRound,
      nextRoundPairings(winners),
      nextPlayoffRoundStart(roundStart, (inRound[0] as SeriesState).bestOf)
    );
  }

  /** Escribe todos los partidos de una ronda del cuadro. */
  private createRound(
    repository: SeasonRepository,
    season: SeasonRow,
    format: PlayoffRound,
    pairings: readonly SeriesPairing[],
    roundStart: Date
  ): void {
    const games: NewGameRow[] = pairings.flatMap((pairing, index) => {
      // El id de la serie lleva ronda y posición en el cuadro: así el bracket
      // se ordena solo y el cruce de semifinales es siempre el mismo.
      const seriesId = `${season.id}-r${format.round}-s${index}`;

      return homeAdvantagePattern(format.bestOf).map((host, gameIndex) => {
        const higherIsHome = host === 'higher';
        return {
          id: randomUUID(),
          seasonId: season.id,
          round: format.round,
          scheduledOn: playoffGameDate(roundStart, gameIndex + 1),
          homeTeamId: higherIsHome ? pairing.higherSeedTeamId : pairing.lowerSeedTeamId,
          awayTeamId: higherIsHome ? pairing.lowerSeedTeamId : pairing.higherSeedTeamId,
          neutralVenue: false,
          seriesId,
          seriesGame: gameIndex + 1
        };
      });
    });

    repository.insertGames(games);
  }

  /**
   * Reconstruye las eliminatorias a partir de sus partidos.
   *
   * No hay tabla de series: el primer partido de cada una lo juega en casa el
   * mejor clasificado, así que de ahí sale quién es quién sin guardar nada más.
   */
  private readSeries(
    repository: SeasonRepository,
    season: SeasonRow,
    competition: CompetitionRow
  ): SeriesState[] {
    const format = buildPlayoffFormat(competition.playoffTeams, competition.playoffSeriesLength);
    const seeds = this.regularSeeds(repository, season);

    const bySeries = new Map<string, GameRow[]>();
    for (const game of repository.listPlayoffGames(season.id)) {
      const seriesId = game.seriesId as string;
      bySeries.set(seriesId, [...(bySeries.get(seriesId) ?? []), game]);
    }

    return [...bySeries.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([seriesId, games]) => {
        const ordered = [...games].sort((a, b) => (a.seriesGame ?? 0) - (b.seriesGame ?? 0));
        const opener = ordered[0] as GameRow;
        const roundFormat = format[opener.round - 1] as PlayoffRound;
        const pairing: SeriesPairing = {
          higherSeedTeamId: opener.homeTeamId,
          higherSeed: seeds.get(opener.homeTeamId) ?? 0,
          lowerSeedTeamId: opener.awayTeamId,
          lowerSeed: seeds.get(opener.awayTeamId) ?? 0
        };
        const played = ordered.filter(isPlayed).map((game) => ({
          homeTeamId: game.homeTeamId,
          awayTeamId: game.awayTeamId,
          homeScore: game.homeScore as number,
          awayScore: game.awayScore as number
        }));

        return {
          seriesId,
          round: opener.round,
          roundName: roundFormat.name,
          bestOf: roundFormat.bestOf,
          pairing,
          games: ordered,
          wins: seriesWins(pairing, played),
          winnerTeamId: seriesWinner(pairing, played, roundFormat.bestOf)
        };
      });
  }

  private toPlayoffSeries(
    repository: SeasonRepository,
    entry: SeriesState,
    names: ReadonlyMap<string, string>,
    managedTeamId: string | null
  ): PlayoffSeries {
    return {
      seriesId: entry.seriesId,
      round: entry.round,
      roundName: entry.roundName,
      bestOf: entry.bestOf,
      higherSeedTeamId: entry.pairing.higherSeedTeamId,
      higherSeedTeamName:
        names.get(entry.pairing.higherSeedTeamId) ?? entry.pairing.higherSeedTeamId,
      higherSeed: entry.pairing.higherSeed,
      lowerSeedTeamId: entry.pairing.lowerSeedTeamId,
      lowerSeedTeamName: names.get(entry.pairing.lowerSeedTeamId) ?? entry.pairing.lowerSeedTeamId,
      lowerSeed: entry.pairing.lowerSeed,
      higherSeedWins: entry.wins.higher,
      lowerSeedWins: entry.wins.lower,
      winnerTeamId: entry.winnerTeamId,
      involvesManaged:
        entry.pairing.higherSeedTeamId === managedTeamId ||
        entry.pairing.lowerSeedTeamId === managedTeamId,
      games: this.toFixtures(repository, entry.games)
    };
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
      involvesManaged: game.homeTeamId === managedTeamId || game.awayTeamId === managedTeamId,
      seriesId: game.seriesId,
      seriesGame: game.seriesGame
    }));
  }
}

/** Los primeros de mes que caen dentro del tramo `(from, to]`. */
function monthStartsBetween(from: Date, to: Date): Date[] {
  const days = Math.min(
    MAX_DAYS_SKIPPED,
    Math.max(0, Math.round((to.getTime() - from.getTime()) / DAY_MS))
  );
  const starts: Date[] = [];

  for (let index = 1; index <= days; index += 1) {
    const date = new Date(from.getTime() + index * DAY_MS);
    if (date.getUTCDate() === 1) {
      starts.push(date);
    }
  }

  return starts;
}

function isPlayed(game: GameRow): boolean {
  return game.homeScore !== null && game.awayScore !== null;
}
