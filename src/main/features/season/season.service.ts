import { randomUUID } from 'node:crypto';
import type {
  AdvanceResult,
  ContinentalSummary,
  ContinentalView,
  CupBracket,
  CupTie,
  FixtureEntry,
  LeagueEntry,
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
  CUP_TEAMS,
  buildCupFormat,
  cupCutoffRound,
  cupPairings,
  cupPrizeCents,
  cupRoundDate,
  nextCupPairings,
  type CupRound
} from '@shared/domain/cup';
import {
  CONTINENTAL_TEAMS,
  FINAL_ROUND,
  MIN_CAPACITY_BY_TIER,
  QUARTERFINAL_ROUND,
  continentalBestOf,
  continentalDateFor,
  continentalRoundName,
  continentalStageOf,
  continentalPrizeCents,
  isNeutralVenueRound,
  nextContinentalPairings,
  qualifyForContinental,
  quarterfinalPairings,
  type ContinentalCandidate
} from '@shared/domain/continental';
import { DIVISION_REPUTATION_STEP, divisionSwap, zoneFor } from '@shared/domain/promotion';
import {
  firstPlayoffDate,
  generateRoundRobin,
  matchdayDate,
  nextPlayoffRoundStart,
  playoffGameDate,
  roundRobinLaps
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
      tier: competition.tier,
      playoffTeams: competition.playoffTeams,
      championTeamId: season.championTeamId,
      championTeamName: season.championTeamId
        ? (repository.teamNames().get(season.championTeamId) ?? null)
        : null
    };
  }

  /**
   * Clasificación de una división; por defecto, la del equipo del usuario.
   *
   * Cada fila sabe si es puesto de playoff, de ascenso o de descenso: es lo que
   * hace que la mitad de abajo de la tabla se lea con la misma tensión que la
   * de arriba.
   */
  getStandings(competitionId?: string): StandingEntry[] {
    const repository = new SeasonRepository(this.resolveDb());
    const season = this.ensureStage(repository);
    const managedTeamId = repository.gameState().managedTeamId;
    const names = repository.teamNames();

    const leagues = this.leagueSeasons(repository, season);
    const index = Math.max(
      0,
      leagues.findIndex((row) => row.competitionId === (competitionId ?? season.competitionId))
    );
    const target = leagues[index] ?? season;
    const competition = repository.findCompetition(target.competitionId);
    const standings = this.regularStandings(repository, target);

    return standings.map((row) => ({
      ...row,
      teamName: names.get(row.teamId) ?? row.teamId,
      isManaged: row.teamId === managedTeamId,
      zone: zoneFor(row.position, {
        teams: standings.length,
        playoffTeams: competition?.playoffTeams ?? 0,
        promotes: index > 0,
        relegates: index < leagues.length - 1
      })
    }));
  }

  /** Las divisiones que se juegan, para poder asomarse a la de al lado. */
  listLeagues(): LeagueEntry[] {
    const repository = new SeasonRepository(this.resolveDb());
    const season = this.ensureSeason(repository);
    const names = repository.teamNames();
    const managedTeamId = repository.gameState().managedTeamId;

    return this.leagueSeasons(repository, season).map((row) => {
      const competition = repository.findCompetition(row.competitionId);

      return {
        competitionId: row.competitionId,
        name: competition?.name ?? row.competitionId,
        tier: competition?.tier ?? 1,
        isManaged: row.id === season.id,
        championTeamId: row.championTeamId,
        championTeamName: row.championTeamId ? (names.get(row.championTeamId) ?? null) : null,
        hasManagedTeam:
          managedTeamId !== null &&
          repository.teamIdsInCompetition(row.competitionId).includes(managedTeamId)
      };
    });
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

    return this.toFixtures(
      repository,
      repository.listTeamGamesIn(this.activeSeasonIds(repository, season), teamId)
    );
  }

  /** Próximo partido del equipo del usuario, jugado o no. */
  getNextGame(): FixtureEntry | null {
    const repository = new SeasonRepository(this.resolveDb());
    const season = this.ensureStage(repository);
    const managedTeamId = this.requireManagedTeam(repository);

    const next = repository
      .listTeamGamesIn(this.activeSeasonIds(repository, season), managedTeamId)
      .find((game) => !isPlayed(game));

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

    const pending = repository.listPendingGamesUpTo(
      this.activeSeasonIds(repository, season),
      state.currentDate
    );
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
      // La jornada sólo avanza con la liga: un partido de Copa no mueve el
      // contador de jornadas.
      if (!game.seriesId && game.seasonId === season.id) {
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

    const nextScheduled = repository.nextScheduledDate(this.activeSeasonIds(repository, season));
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

  /** Cuadro de Copa; `null` mientras no se haya cerrado la primera vuelta. */
  getCup(): CupBracket | null {
    const repository = new SeasonRepository(this.resolveDb());
    const season = this.ensureStage(repository);
    const cup = this.cupSeason(repository, season);
    if (!cup) {
      return null;
    }

    const competition = repository.findCompetition(cup.competitionId);
    const games = repository.listGames(cup.id);
    const names = repository.teamNames();
    const managedTeamId = repository.gameState().managedTeamId;

    return {
      competitionName: competition?.name ?? 'Copa',
      seasonNumber: cup.seasonNumber,
      rounds: buildCupFormat(CUP_TEAMS)
        .map((round) => ({
          round: round.round,
          name: round.name,
          ties: games
            .filter((game) => game.round === round.round)
            .map((game) => this.toCupTie(game, names, managedTeamId))
        }))
        .filter((round) => round.ties.length > 0),
      championTeamId: cup.championTeamId,
      championTeamName: cup.championTeamId ? (names.get(cup.championTeamId) ?? null) : null
    };
  }

  /** Las competiciones continentales que se juegan este curso. */
  listContinental(): ContinentalSummary[] {
    const repository = new SeasonRepository(this.resolveDb());
    const season = this.ensureStage(repository);
    const continent = this.managedContinent(repository, season);
    if (!continent) {
      return [];
    }

    const names = repository.teamNames();
    const managedTeamId = repository.gameState().managedTeamId;

    return this.continentalCompetitions(repository, continent).flatMap((competition) => {
      const continental = repository.findSeasonOf(competition.id, season.seasonNumber);
      if (!continental) {
        return [];
      }

      return [
        {
          competitionId: competition.id,
          name: competition.name,
          tier: competition.tier,
          involvesManaged:
            managedTeamId !== null &&
            this.continentalEntrants(repository, continental).includes(managedTeamId),
          championTeamId: continental.championTeamId,
          championTeamName: continental.championTeamId
            ? (names.get(continental.championTeamId) ?? null)
            : null
        }
      ];
    });
  }

  /**
   * Una competición continental por dentro.
   *
   * Sin argumento devuelve la que juega el club del usuario, que es la que va a
   * mirar nueve de cada diez veces; si no juega ninguna, la de más rango.
   */
  getContinental(competitionId?: string): ContinentalView | null {
    const repository = new SeasonRepository(this.resolveDb());
    const season = this.ensureStage(repository);
    const summaries = this.listContinental();
    const summary =
      summaries.find((row) => row.competitionId === competitionId) ??
      summaries.find((row) => row.involvesManaged) ??
      summaries[0];
    if (!summary) {
      return null;
    }

    const competition = repository.findCompetition(summary.competitionId) as CompetitionRow;
    const continental = repository.findSeasonOf(
      summary.competitionId,
      season.seasonNumber
    ) as SeasonRow;
    const names = repository.teamNames();
    const managedTeamId = repository.gameState().managedTeamId;
    const standings = this.continentalStandings(repository, continental);

    const series = this.readContinentalSeries(repository, continental);
    const seeds = new Map(standings.map((row) => [row.teamId, row.position]));

    return {
      ...summary,
      seasonNumber: continental.seasonNumber,
      stage: continental.stage as ContinentalView['stage'],
      group: standings.map((row) => ({
        ...row,
        teamName: names.get(row.teamId) ?? row.teamId,
        isManaged: row.teamId === managedTeamId,
        // Los ocho primeros pasan al cuadro: es lo único que se juega la tabla.
        zone: row.position <= competition.playoffTeams ? 'playoffs' : null
      })),
      knockout: {
        rounds: [...new Set(series.map((entry) => entry.round))]
          .sort((a, b) => a - b)
          .map((round) => ({
            round,
            name: continentalRoundName(round),
            bestOf: continentalBestOf(round),
            series: series
              .filter((entry) => entry.round === round)
              .map((entry) => this.toContinentalSeries(repository, entry, names, seeds))
          })),
        championTeamId: continental.championTeamId,
        championTeamName: continental.championTeamId
          ? (names.get(continental.championTeamId) ?? null)
          : null
      }
    };
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
    // Antes de subir el contador: los ascensos se deciden con las
    // clasificaciones del curso que acaba de terminar, y el calendario del
    // siguiente ya tiene que encontrar a cada equipo en su división.
    this.applyPromotions(repository, season);
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

  /**
   * Devuelve la temporada en curso, generando calendario si es la primera vez.
   *
   * Y no sólo la del usuario: **todas** las divisiones del país arrancan a la
   * vez. Si la segunda no se jugara no habría de dónde sacar quién sube, y
   * descender sería desaparecer del mundo.
   */
  private ensureSeason(repository: SeasonRepository): SeasonRow {
    const state = repository.gameState();
    const managedTeamId = this.requireManagedTeam(repository);
    const competition = repository.competitionOfTeam(managedTeamId);

    const existing = repository.findSeason(competition.id, state.seasonNumber);
    if (existing) {
      return existing;
    }

    const season = this.createLeagueSeason(repository, competition, state);

    // Pretemporada del club: se renuevan los abonos y entran televisión y
    // patrocinio. Y el consejo pone el objetivo del curso, que en segunda no es
    // el mismo que en primera.
    this.clubService.collectPreseason(season.id, state.currentDate);
    this.boardService.ensureForSeason(
      season.seasonNumber,
      repository.teamIdsInCompetition(competition.id).length,
      competition.tier
    );
    // Y sale la hornada del verano, para toda la liga.
    this.youthService.runIntake(season.seasonNumber, season.startYear);

    // Las demás divisiones del país, que se juegan igual aunque el usuario no
    // esté en ellas.
    for (const other of this.leagueCompetitions(repository, competition.country)) {
      if (!repository.findSeason(other.id, state.seasonNumber)) {
        this.createLeagueSeason(repository, other, state);
      }
    }

    return season;
  }

  /** Crea una temporada de liga con su calendario de ida y vuelta. */
  private createLeagueSeason(
    repository: SeasonRepository,
    competition: CompetitionRow,
    state: { currentDate: Date; seasonNumber: number }
  ): SeasonRow {
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
    // Las vueltas que le quepan a la liga en la temporada: dieciocho equipos
    // juegan ida y vuelta, diez juegan tres vueltas y una de treinta, una sola.
    const rounds = generateRoundRobin(teamIds, roundRobinLaps(teamIds.length));
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

  /**
   * Ascensos y descensos entre divisiones vecinas.
   *
   * Bajan los dos últimos de arriba y suben los dos primeros de abajo, así que
   * ninguna liga cambia de tamaño y el calendario del curso siguiente sale
   * igual que el de este. La reputación viaja con el equipo: sin eso, ascender
   * sería sólo cambiar de rivales.
   */
  private applyPromotions(repository: SeasonRepository, season: SeasonRow): void {
    const leagues = this.leagueSeasons(repository, season);
    const managedTeamId = repository.gameState().managedTeamId;
    const today = repository.gameState().currentDate;

    for (let index = 0; index + 1 < leagues.length; index += 1) {
      const upper = leagues[index] as SeasonRow;
      const lower = leagues[index + 1] as SeasonRow;
      const { promoted, relegated } = divisionSwap({
        upper: this.regularStandings(repository, upper),
        lower: this.regularStandings(repository, lower)
      });

      for (const teamId of promoted) {
        this.moveTeam(repository, teamId, upper.competitionId, DIVISION_REPUTATION_STEP);
      }
      for (const teamId of relegated) {
        this.moveTeam(repository, teamId, lower.competitionId, -DIVISION_REPUTATION_STEP);
      }

      if (!managedTeamId) {
        continue;
      }
      if (promoted.includes(managedTeamId)) {
        // El premio se apunta en la temporada que se acaba de ganar, que es
        // donde el usuario lo va a buscar en el libro.
        this.clubService.payPromotion(lower.id, today);
        this.boardService.afterDivisionChange('promoted');
      }
      if (relegated.includes(managedTeamId)) {
        this.boardService.afterDivisionChange('relegated');
      }
    }
  }

  /** Cambia a un equipo de división, con lo que eso le hace a su reputación. */
  private moveTeam(
    repository: SeasonRepository,
    teamId: string,
    competitionId: string,
    reputationDelta: number
  ): void {
    const team = repository.findTeam(teamId);
    if (!team) {
      return;
    }

    repository.moveTeamToCompetition(
      teamId,
      competitionId,
      Math.min(100, Math.max(1, team.reputation + reputationDelta))
    );
  }

  /** Las ligas de un país, de la primera categoría hacia abajo. */
  private leagueCompetitions(repository: SeasonRepository, country: string): CompetitionRow[] {
    return repository
      .listCompetitions()
      .filter((row) => row.format === 'league' && row.country === country)
      .sort((a, b) => a.tier - b.tier);
  }

  /** Las temporadas de liga en marcha este curso, de primera hacia abajo. */
  private leagueSeasons(repository: SeasonRepository, season: SeasonRow): SeasonRow[] {
    const country = this.leagueCountry(repository, season) ?? '';

    return this.leagueCompetitions(repository, country)
      .map((competition) => repository.findSeason(competition.id, season.seasonNumber))
      .filter((row): row is SeasonRow => row !== null);
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
    // La Copa corre en paralelo y tiene su propio cuadro que mover.
    this.ensureCup(repository, season);
    // Y Europa —o América— otros tantos.
    this.ensureContinental(repository, season);

    // Y las otras divisiones también terminan, con su campeón: si la segunda se
    // quedara a medias no habría a quién ascender en septiembre.
    for (const other of this.leagueSeasons(repository, season)) {
      if (other.id !== season.id) {
        this.advanceLeague(repository, other);
      }
    }

    return this.advanceLeague(repository, season);
  }

  /**
   * Una liga, con su fase al día: regular, playoffs y campeón.
   *
   * Sirve igual para la del usuario que para la de al lado. Lo que sólo pasa en
   * la suya —premios y consejo— se filtra más abajo, al mirar si su equipo está
   * en esa clasificación.
   */
  private advanceLeague(repository: SeasonRepository, season: SeasonRow): SeasonRow {
    if (season.stage === 'finished') {
      return season;
    }

    const competition = repository.findCompetition(season.competitionId) as CompetitionRow;
    const regular = repository.listRegularGames(season.id);
    const regularFinished = regular.length > 0 && regular.every(isPlayed);

    // Una liga sin playoffs corona al primero de la fase regular, como media
    // Europa y como la segunda división de la partida: allí lo que se juega es
    // subir, y el campeón es el que acaba arriba.
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
   * La Copa: se monta al cerrar la primera vuelta con los ocho primeros y se
   * resuelve sola, ronda a ronda, según se van jugando los partidos.
   *
   * Vive en su propia temporada —la de la competición de copa— para que sus
   * partidos no se cuelen jamás en la clasificación de la liga.
   */
  private ensureCup(repository: SeasonRepository, season: SeasonRow): void {
    const cupCompetition = repository
      .listCompetitions()
      .find(
        (row) => row.format === 'cup' && row.country === this.leagueCountry(repository, season)
      );
    if (!cupCompetition) {
      return;
    }

    // La Copa es de la máxima categoría: la juegan los ocho primeros de la
    // primera división, esté el usuario en ella o mirándola desde abajo.
    const league = this.leagueSeasons(repository, season)[0];
    if (!league) {
      return;
    }

    const regular = repository.listRegularGames(league.id);
    const totalRounds = regular.reduce((max, game) => Math.max(max, game.round), 0);
    const cutoff = cupCutoffRound(totalRounds);
    const firstHalfPlayed =
      totalRounds > 0 && regular.filter((game) => game.round <= cutoff).every(isPlayed);

    let cup = repository.findSeasonOf(cupCompetition.id, season.seasonNumber);
    if (!cup) {
      if (!firstHalfPlayed) {
        return;
      }

      cup = {
        id: randomUUID(),
        competitionId: cupCompetition.id,
        seasonNumber: season.seasonNumber,
        startYear: season.startYear,
        currentRound: 1,
        stage: 'playoffs',
        championTeamId: null
      };
      repository.insertSeason(cup);

      const qualified = this.regularStandings(repository, league)
        .slice(0, CUP_TEAMS)
        .map((row) => row.teamId);
      this.createCupRound(
        repository,
        cup,
        buildCupFormat(CUP_TEAMS)[0] as CupRound,
        cupPairings(qualified)
      );
      return;
    }

    if (cup.stage === 'finished') {
      return;
    }

    const format = buildCupFormat(CUP_TEAMS);
    const games = repository.listGames(cup.id);
    const currentRound = games.reduce((max, game) => Math.max(max, game.round), 1);
    const inRound = games.filter((game) => game.round === currentRound);
    if (inRound.length === 0 || !inRound.every(isPlayed)) {
      return;
    }

    const seeds = this.regularSeeds(repository, league);
    const winners = inRound
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((game) => {
        const teamId =
          (game.homeScore as number) > (game.awayScore as number)
            ? game.homeTeamId
            : game.awayTeamId;
        return { teamId, seed: seeds.get(teamId) ?? 99 };
      });

    if (currentRound >= format.length) {
      const champion = winners[0]?.teamId ?? null;
      if (champion) {
        repository.setChampion(cup.id, champion);
      }
      repository.setStage(cup.id, 'finished');
      this.rewardCup(repository, cup, currentRound, champion);
      return;
    }

    this.rewardCup(repository, cup, currentRound, null);
    this.createCupRound(
      repository,
      cup,
      format[currentRound] as CupRound,
      nextCupPairings(winners)
    );
  }

  /**
   * Las competiciones continentales del club del usuario.
   *
   * Sólo se juegan las de **su** continente: simular a la vez la Euroliga y la
   * American League sería duplicar el trabajo del reloj para enseñar un
   * palmarés que el jugador no va a mirar.
   */
  private ensureContinental(repository: SeasonRepository, season: SeasonRow): void {
    const continent = this.managedContinent(repository, season);
    if (!continent) {
      return;
    }

    // Por rango: la primera se queda a los mejores y la siguiente recoge.
    const taken = new Set<string>();
    for (const competition of this.continentalCompetitions(repository, continent)) {
      const existing = repository.findSeasonOf(competition.id, season.seasonNumber);
      if (existing) {
        for (const teamId of this.continentalEntrants(repository, existing)) {
          taken.add(teamId);
        }
        this.advanceContinental(repository, existing, competition);
        continue;
      }

      const entrants = this.pickContinentalEntrants(repository, season, competition, taken);
      if (entrants.length < CONTINENTAL_TEAMS) {
        // Sin dieciséis no hay torneo: mejor no crearlo que crear uno cojo.
        continue;
      }
      for (const teamId of entrants) {
        taken.add(teamId);
      }
      this.createContinentalSeason(repository, season, competition, entrants);
    }
  }

  /** Competiciones continentales de un continente, de la primera hacia abajo. */
  private continentalCompetitions(
    repository: SeasonRepository,
    continent: string
  ): CompetitionRow[] {
    return repository
      .listCompetitions()
      .filter((row) => row.format === 'continental' && row.continent === continent)
      .sort((a, b) => a.tier - b.tier);
  }

  /** El continente donde juega el club del usuario. */
  private managedContinent(repository: SeasonRepository, season: SeasonRow): string | null {
    return repository.findCompetition(season.competitionId)?.continent ?? null;
  }

  /**
   * Quién juega una competición continental este año.
   *
   * Los candidatos salen de las ligas del continente, con el puesto del curso
   * pasado si ya se jugó y con la reputación si es la primera temporada. El
   * reparto lo decide el dominio; aquí sólo se recogen los datos.
   */
  private pickContinentalEntrants(
    repository: SeasonRepository,
    season: SeasonRow,
    competition: CompetitionRow,
    taken: ReadonlySet<string>
  ): string[] {
    const candidates: ContinentalCandidate[] = [];

    for (const league of repository
      .listCompetitions()
      .filter((row) => row.format === 'league' && row.continent === competition.continent)) {
      const previous = repository.findSeason(league.id, season.seasonNumber - 1);
      const order = previous
        ? this.regularStandings(repository, previous).map((row) => row.teamId)
        : [];

      for (const teamId of repository.teamIdsInCompetition(league.id)) {
        const team = repository.findTeam(teamId);
        if (!team) {
          continue;
        }
        const position = order.indexOf(teamId);
        candidates.push({
          teamId,
          competitionId: league.id,
          // Sin temporada anterior —o recién ascendido— se ordena por lo que
          // es el club, que es lo único que se sabe de él.
          rank: position >= 0 ? position + 1 : order.length + team.reputation * -1 + 200,
          reputation: team.reputation,
          capacity: team.pavilionCapacity
        });
      }
    }

    return qualifyForContinental(candidates, {
      slots: CONTINENTAL_TEAMS,
      minCapacity: MIN_CAPACITY_BY_TIER[competition.tier] ?? 0,
      taken
    });
  }

  /** Crea la competición del año con su fase de liga a una vuelta. */
  private createContinentalSeason(
    repository: SeasonRepository,
    season: SeasonRow,
    competition: CompetitionRow,
    entrants: readonly string[]
  ): void {
    const continental: SeasonRow = {
      id: randomUUID(),
      competitionId: competition.id,
      seasonNumber: season.seasonNumber,
      startYear: season.startYear,
      currentRound: 1,
      stage: 'regular',
      championTeamId: null
    };
    repository.insertSeason(continental);

    repository.insertGames(
      generateRoundRobin(entrants, 1).flatMap((pairings, index) =>
        pairings.map((pairing) => ({
          id: randomUUID(),
          seasonId: continental.id,
          round: index + 1,
          scheduledOn: continentalDateFor(continental.startYear, index + 1),
          homeTeamId: pairing.homeTeamId,
          awayTeamId: pairing.awayTeamId,
          neutralVenue: false
        }))
      )
    );

    // Entrar ya paga: son los derechos de la competición.
    this.rewardContinental(repository, continental, competition, null, null);
  }

  /**
   * Mueve la competición: de la fase de liga a los cuartos, de los cuartos a la
   * Final Four y de ahí al campeón.
   */
  private advanceContinental(
    repository: SeasonRepository,
    continental: SeasonRow,
    competition: CompetitionRow
  ): void {
    if (continental.stage === 'finished') {
      return;
    }

    const series = this.readContinentalSeries(repository, continental);
    if (series.length === 0) {
      const group = repository.listRegularGames(continental.id);
      if (group.length === 0 || !group.every(isPlayed)) {
        return;
      }

      const seeds = this.continentalStandings(repository, continental).map((row) => row.teamId);
      this.createContinentalRound(
        repository,
        continental,
        QUARTERFINAL_ROUND,
        quarterfinalPairings(seeds)
      );
      repository.setStage(continental.id, 'playoffs');
      return;
    }

    const currentRound = series.reduce((max, entry) => Math.max(max, entry.round), 1);
    const inRound = series.filter((entry) => entry.round === currentRound);

    for (const entry of inRound) {
      if (entry.winnerTeamId) {
        // Un 2-0 al mejor de tres deja el tercero sin sentido: se borra en vez
        // de quedarse pendiente bloqueando el reloj.
        repository.deleteGames(
          entry.games.filter((game) => !isPlayed(game)).map((game) => game.id)
        );
      }
    }

    if (!inRound.every((entry) => entry.winnerTeamId)) {
      return;
    }

    if (currentRound >= FINAL_ROUND) {
      const champion = (inRound[0] as ContinentalSeries).winnerTeamId as string;
      repository.setChampion(continental.id, champion);
      repository.setStage(continental.id, 'finished');
      this.rewardContinental(repository, continental, competition, currentRound, champion);
      return;
    }

    this.rewardContinental(repository, continental, competition, currentRound, null);

    const seeds = new Map(
      this.continentalStandings(repository, continental).map((row) => [row.teamId, row.position])
    );
    const winners = inRound.map((entry) => ({
      teamId: entry.winnerTeamId as string,
      seed: seeds.get(entry.winnerTeamId as string) ?? 99
    }));

    this.createContinentalRound(
      repository,
      continental,
      currentRound + 1,
      nextContinentalPairings(winners)
    );
  }

  /** Escribe una ronda de la eliminatoria continental. */
  private createContinentalRound(
    repository: SeasonRepository,
    continental: SeasonRow,
    round: number,
    pairings: readonly SeriesPairing[]
  ): void {
    const bestOf = continentalBestOf(round);
    const neutral = isNeutralVenueRound(round);

    repository.insertGames(
      pairings.flatMap((pairing, index) => {
        // El id lleva ronda y sitio en el cuadro: así el bracket se ordena solo.
        const seriesId = `${continental.id}-c${round}-s${index}`;

        return homeAdvantagePattern(bestOf).map((host, gameIndex) => {
          const higherIsHome = host === 'higher';
          return {
            id: randomUUID(),
            seasonId: continental.id,
            round,
            scheduledOn: continentalDateFor(continental.startYear, round, gameIndex + 1),
            homeTeamId: higherIsHome ? pairing.higherSeedTeamId : pairing.lowerSeedTeamId,
            awayTeamId: higherIsHome ? pairing.lowerSeedTeamId : pairing.higherSeedTeamId,
            // La Final Four se juega en sede única: allí no hay factor cancha.
            neutralVenue: neutral,
            seriesId,
            seriesGame: gameIndex + 1
          };
        });
      })
    );
  }

  /**
   * Reconstruye las eliminatorias continentales a partir de sus partidos.
   *
   * Como en los playoffs: no hay tabla de series, el primer partido de cada una
   * lo abre en casa el mejor clasificado y de ahí sale quién es quién.
   */
  private readContinentalSeries(
    repository: SeasonRepository,
    continental: SeasonRow
  ): ContinentalSeries[] {
    const bySeries = new Map<string, GameRow[]>();
    for (const game of repository.listPlayoffGames(continental.id)) {
      const key = game.seriesId as string;
      const games = bySeries.get(key);
      if (games) {
        games.push(game);
      } else {
        bySeries.set(key, [game]);
      }
    }

    return [...bySeries.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([seriesId, games]) => {
        const first = games[0] as GameRow;
        const bestOf = continentalBestOf(first.round);
        const pairing: SeriesPairing = {
          higherSeedTeamId: first.homeTeamId,
          higherSeed: 0,
          lowerSeedTeamId: first.awayTeamId,
          lowerSeed: 0
        };
        const played = games.filter(isPlayed).map((game) => ({
          homeTeamId: game.homeTeamId,
          awayTeamId: game.awayTeamId,
          homeScore: game.homeScore as number,
          awayScore: game.awayScore as number
        }));

        return {
          seriesId,
          round: first.round,
          bestOf,
          pairing,
          games,
          winnerTeamId: seriesWinner(pairing, played, bestOf)
        };
      });
  }

  /** Clasificación de la fase de liga continental. */
  private continentalStandings(
    repository: SeasonRepository,
    continental: SeasonRow
  ): StandingRow[] {
    const games = repository.listRegularGames(continental.id);
    const teamIds = [
      ...new Set(games.flatMap((game) => [game.homeTeamId, game.awayTeamId]))
    ].sort();

    return computeStandings(
      teamIds,
      games.filter(isPlayed).map((game) => ({
        homeTeamId: game.homeTeamId,
        awayTeamId: game.awayTeamId,
        homeScore: game.homeScore as number,
        awayScore: game.awayScore as number
      }))
    );
  }

  /** Los dieciséis que juegan una competición continental ya creada. */
  private continentalEntrants(repository: SeasonRepository, continental: SeasonRow): string[] {
    return [
      ...new Set(
        repository
          .listRegularGames(continental.id)
          .flatMap((game) => [game.homeTeamId, game.awayTeamId])
      )
    ];
  }

  /** Premio continental al club del usuario, si llegó hasta ahí. */
  private rewardContinental(
    repository: SeasonRepository,
    continental: SeasonRow,
    competition: CompetitionRow,
    round: number | null,
    championTeamId: string | null
  ): void {
    const managedTeamId = repository.gameState().managedTeamId;
    if (!managedTeamId) {
      return;
    }

    const games = repository.listGames(continental.id);
    const plays =
      round === null
        ? games.some((game) => involves(game, managedTeamId))
        : games.some((game) => game.round === round && involves(game, managedTeamId));
    if (!plays) {
      return;
    }

    const stage = round === null ? 'group' : continentalStageOf(round);
    const champion = championTeamId === managedTeamId;

    this.clubService.recordEntry({
      teamId: managedTeamId,
      seasonId: continental.id,
      happenedOn: repository.gameState().currentDate,
      type: 'prize',
      description: champion
        ? `Campeón de ${competition.name}`
        : `${competition.name}: ${round === null ? 'fase de liga' : continentalRoundName(round)}`,
      amountCents: continentalPrizeCents(stage, champion, competition.tier)
    });
  }

  /** Escribe una ronda de Copa: partido único y siempre en cancha neutral. */
  private createCupRound(
    repository: SeasonRepository,
    cup: SeasonRow,
    format: CupRound,
    pairings: readonly SeriesPairing[]
  ): void {
    repository.insertGames(
      pairings.map((pairing, index) => ({
        // El id lleva ronda y posición en el cuadro: así el bracket se ordena
        // solo y el cruce de semifinales es siempre el mismo.
        id: `${cup.id}-c${format.round}-t${index}`,
        seasonId: cup.id,
        round: format.round,
        scheduledOn: cupRoundDate(cup.startYear, format.round),
        homeTeamId: pairing.higherSeedTeamId,
        awayTeamId: pairing.lowerSeedTeamId,
        // Sede neutral: en la Copa no hay factor cancha para nadie.
        neutralVenue: true
      }))
    );
  }

  /** Premio de Copa al club del usuario, si llegó hasta ahí. */
  private rewardCup(
    repository: SeasonRepository,
    cup: SeasonRow,
    round: number,
    championTeamId: string | null
  ): void {
    const managedTeamId = repository.gameState().managedTeamId;
    if (!managedTeamId) {
      return;
    }

    const played = repository
      .listGames(cup.id)
      .filter((game) => game.round === round && involves(game, managedTeamId));
    if (played.length === 0) {
      return;
    }

    this.clubService.recordEntry({
      teamId: managedTeamId,
      seasonId: cup.id,
      happenedOn: repository.gameState().currentDate,
      type: 'prize',
      description:
        championTeamId === managedTeamId
          ? 'Campeón de Copa'
          : `Copa: ${buildCupFormat(CUP_TEAMS)[round - 1]?.name ?? 'ronda'}`,
      amountCents: cupPrizeCents(round, championTeamId === managedTeamId)
    });
  }

  /** Temporada de Copa del curso en marcha, si ya existe. */
  private cupSeason(repository: SeasonRepository, season: SeasonRow): SeasonRow | null {
    const cupCompetition = repository
      .listCompetitions()
      .find(
        (row) => row.format === 'cup' && row.country === this.leagueCountry(repository, season)
      );

    return cupCompetition ? repository.findSeasonOf(cupCompetition.id, season.seasonNumber) : null;
  }

  private leagueCountry(repository: SeasonRepository, season: SeasonRow): string | undefined {
    return repository.findCompetition(season.competitionId)?.country;
  }

  /**
   * Todas las competiciones con partidos vivos este curso.
   *
   * El reloj las mira a la vez: la liga del usuario, la división de al lado y
   * la Copa comparten calendario y se juegan los mismos días.
   */
  private activeSeasonIds(repository: SeasonRepository, season: SeasonRow): string[] {
    const cup = this.cupSeason(repository, season);
    const ids = this.leagueSeasons(repository, season).map((row) => row.id);
    if (cup) {
      ids.push(cup.id);
    }

    const continent = this.managedContinent(repository, season);
    if (continent) {
      for (const competition of this.continentalCompetitions(repository, continent)) {
        const continental = repository.findSeasonOf(competition.id, season.seasonNumber);
        if (continental) {
          ids.push(continental.id);
        }
      }
    }

    return ids;
  }

  private toCupTie(
    game: GameRow,
    names: ReadonlyMap<string, string>,
    managedTeamId: string | null
  ): CupTie {
    return {
      gameId: game.id,
      round: game.round,
      scheduledOn: game.scheduledOn.getTime(),
      homeTeamId: game.homeTeamId,
      homeTeamName: names.get(game.homeTeamId) ?? game.homeTeamId,
      awayTeamId: game.awayTeamId,
      awayTeamName: names.get(game.awayTeamId) ?? game.awayTeamId,
      homeScore: game.homeScore,
      awayScore: game.awayScore,
      played: isPlayed(game),
      involvesManaged: involves(game, managedTeamId)
    };
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

    this.clubService.payPrizes(season.id, repository.gameState().currentDate, {
      ...result,
      // En segunda se cobra una fracción de lo de primera: es lo que convierte
      // un descenso en un agujero y no en un cambio de rivales.
      tier: repository.findCompetition(season.competitionId)?.tier ?? 1
    });
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

  /** Una eliminatoria continental tal y como la enseña el cuadro. */
  private toContinentalSeries(
    repository: SeasonRepository,
    entry: ContinentalSeries,
    names: ReadonlyMap<string, string>,
    seeds: ReadonlyMap<string, number>
  ): PlayoffSeries {
    const managedTeamId = repository.gameState().managedTeamId;
    const played = entry.games.filter(isPlayed).map((game) => ({
      homeTeamId: game.homeTeamId,
      awayTeamId: game.awayTeamId,
      homeScore: game.homeScore as number,
      awayScore: game.awayScore as number
    }));
    const wins = seriesWins(entry.pairing, played);

    return {
      seriesId: entry.seriesId,
      round: entry.round,
      roundName: continentalRoundName(entry.round),
      bestOf: entry.bestOf,
      higherSeedTeamId: entry.pairing.higherSeedTeamId,
      higherSeedTeamName:
        names.get(entry.pairing.higherSeedTeamId) ?? entry.pairing.higherSeedTeamId,
      higherSeed: seeds.get(entry.pairing.higherSeedTeamId) ?? 0,
      lowerSeedTeamId: entry.pairing.lowerSeedTeamId,
      lowerSeedTeamName: names.get(entry.pairing.lowerSeedTeamId) ?? entry.pairing.lowerSeedTeamId,
      lowerSeed: seeds.get(entry.pairing.lowerSeedTeamId) ?? 0,
      higherSeedWins: wins.higher,
      lowerSeedWins: wins.lower,
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

/** Una eliminatoria continental reconstruida a partir de sus partidos. */
interface ContinentalSeries {
  seriesId: string;
  round: number;
  bestOf: number;
  pairing: SeriesPairing;
  games: GameRow[];
  winnerTeamId: string | null;
}

/** Si un equipo juega ese partido. */
function involves(game: GameRow, teamId: string | null): boolean {
  return teamId !== null && (game.homeTeamId === teamId || game.awayTeamId === teamId);
}

function isPlayed(game: GameRow): boolean {
  return game.homeScore !== null && game.awayScore !== null;
}
