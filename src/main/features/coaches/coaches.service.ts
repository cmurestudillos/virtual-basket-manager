import {
  MANAGER_COACH_ID,
  coachRankingRequestSchema,
  type CoachProfile,
  type CoachRankingFilterOption,
  type CoachRankingPage,
  type CoachRankingRequest,
  type CoachRankingRow,
  type CoachSeasonLine,
  type CoachStintEnd
} from '@shared/contracts/coaches.contract';
import type { TeamCoachRef } from '@shared/contracts/teams.contract';
import { objectiveForReputation, seasonVerdict } from '@shared/domain/board';
import {
  coachReputation,
  managerReputation,
  managerReputationLabel,
  vacancyChance,
  type CareerSeasonRecord
} from '@shared/domain/career';
import {
  POACH_CHANCE,
  canDismissMidSeason,
  chooseReplacement,
  coachAge,
  isClearlyBelowExpectations,
  poolShortfall,
  retirementChance,
  summerDismissalChance,
  type CoachCandidate
} from '@shared/domain/coaches';
import { compareRanking, rankingPoints } from '@shared/domain/coach-ranking';
import { countryName } from '@shared/domain/simulation-scope';
import { computeStandings } from '@shared/domain/standings';
import { createRng, seedFromString } from '@shared/engine/basketball/rng';
import type { SaveDatabase } from '../../database/save-database';
import type {
  CoachRow,
  CoachSeasonRow,
  CompetitionRow,
  NewCoachSeasonRow,
  TeamRow
} from '../../database/schema/save';
import { managerSeasonRecords, teamManagedIn } from '../career/career-records';
import { CareerRepository } from '../career/career.repository';
import { BoardService } from '../club/board.service';
import { ClubRepository } from '../club/club.repository';
import { NationalService } from '../national/national.service';
import { SeasonRepository } from '../season/season.repository';
import { SeasonFigures } from './coach-figures';
import {
  FREE_COACH_PREFIX,
  buildFreeCoaches,
  buildInitialCoaches,
  openStint,
  type CoachFactoryClub
} from './coach-factory';
import { CoachRepository } from './coaches.repository';

export class CoachNotFoundError extends Error {
  constructor(coachId: string) {
    super(`No existe el entrenador ${coachId}`);
    this.name = 'CoachNotFoundError';
  }
}

/** Filas por página del ranking. */
export const COACH_RANKING_PAGE_SIZE = 25;

const CONTINENT_NAMES: Record<string, string> = {
  EUR: 'Europa',
  AME: 'América',
  OCE: 'Oceanía'
};

/** Una fila del ranking con lo que hace falta para filtrarla. */
interface WorldEntry {
  row: CoachRankingRow;
  continent: string | null;
  country: string | null;
  competitionId: string | null;
}

/** El ranking del mundo entero, ya ordenado, y lo que se puede filtrar. */
interface World {
  entries: WorldEntry[];
  filters: CoachRankingPage['filters'];
  seasonNumber: number;
  figures: SeasonFigures;
}

/**
 * Los entrenadores: el ranking, las fichas y el carrusel de la IA.
 *
 * El carrusel no tiene reloj propio: lo mueve la temporada. Cada cambio de mes
 * trae los despidos de mitad de curso y los fichajes ({@link monthlyMoves}), y
 * el verano, el cierre de los tramos, los despidos por objetivo, las retiradas
 * y los banquillos del curso nuevo ({@link closeSeason} y {@link openSeason}).
 * Todo con semillas fijas por club, entrenador y ventana: la misma partida
 * mueve siempre los mismos banquillos.
 *
 * Lo que hace el usuario —coger un club, dimitir, que le echen— no avisa a
 * nadie: {@link ensure} lo descubre comparando su fila con la partida, igual
 * que la carrera se entera del despido al leer. Por eso se llama al principio
 * de todo lo que lee o mueve entrenadores, y es barato si no hay nada que hacer.
 */
export class CoachService {
  /** Ver el porqué del resolutor en `SeasonService`. */
  constructor(private readonly resolveDb: () => SaveDatabase) {}

  /**
   * Deja los banquillos al día.
   *
   * En una partida de antes de los entrenadores los inventa (con las mismas
   * semillas que una nueva) y abre sus tramos desde el principio del curso en
   * juego, para que cuenten los partidos ya jugados. Después sincroniza al
   * usuario con su club y cubre cualquier banquillo vacío.
   */
  ensure(): void {
    const db = this.resolveDb();
    const repository = new CoachRepository(db);
    const state = repository.gameState();
    if (!state) {
      return;
    }
    const seasonStart = this.seasonStart(repository, state.seasonNumber, state.currentDate);

    if (repository.isEmpty()) {
      this.seedWorld(db, repository, state, seasonStart);
    }
    // Un curso que se quedó sin congelar —una partida cortada a medio verano—
    // se congela ahora, antes de que nadie abra tramos en el siguiente.
    for (const seasonNumber of repository.unfrozenSeasons()) {
      if (seasonNumber < state.seasonNumber) {
        this.freezeSeason(
          repository,
          seasonNumber,
          new Map(),
          this.seasonEnd(repository, seasonNumber, seasonStart)
        );
      }
    }

    this.syncManager(db, repository, state);
    // Los fichajes antes que los tramos: al arrancar un curso, quien cambia de
    // club lo hace sin haber abierto antes un tramo vacío en el que deja.
    this.fillVacancies(
      repository,
      state.currentDate,
      `${state.seasonNumber}:${monthKey(state.currentDate)}`,
      state.seasonNumber
    );
    this.reconcileStints(repository, state.seasonNumber, seasonStart, state.currentDate);
  }

  /**
   * Un cambio de mes con la temporada en marcha.
   *
   * En cada liga que se juega y siga en la fase regular, al entrenador de un
   * club que va claramente por debajo de lo que es lo pueden echar. La tirada
   * es **la misma** que abre ese banquillo al usuario en la carrera
   * (`club|curso:mes`): si un club te llama este mes, es que ese mismo mes se
   * planteó cambiar de entrenador. Después se cubren los banquillos vacíos.
   */
  monthlyMoves(monthStart: Date): void {
    this.ensure();
    const db = this.resolveDb();
    const repository = new CoachRepository(db);
    const state = repository.gameState();
    if (!state) {
      return;
    }
    const seasons = new SeasonRepository(db);
    const window = `${state.seasonNumber}:${monthKey(monthStart)}`;
    const managerTeamId = this.managerClub(db, state);
    const teams = repository.teams();
    const benches = repository.benches();
    const open = new Map(repository.openStints().map((row) => [row.coachId, row]));

    for (const competition of this.playedLeagues(repository, seasons)) {
      const season = seasons.findSeason(competition.id, state.seasonNumber);
      if (!season || season.stage !== 'regular') {
        continue;
      }
      const teamIds = repository.teamIdsInCompetition(competition.id);
      const games = repository.playedRegularGames(season.id);
      const standings = computeStandings(teamIds, games);
      const expected = expectedPositions(teamIds, teams);

      for (const row of standings) {
        const coach = benches.get(row.teamId);
        if (!coach || coach.id === MANAGER_COACH_ID || row.teamId === managerTeamId) {
          continue;
        }
        const stint = open.get(coach.id);
        const since = stint?.startDate.getTime() ?? 0;
        const gamesInCharge = games.filter(
          (game) =>
            (game.homeTeamId === row.teamId || game.awayTeamId === row.teamId) &&
            game.scheduledOn.getTime() >= since
        ).length;
        if (!canDismissMidSeason({ stage: season.stage, gamesInCharge })) {
          continue;
        }
        const below = isClearlyBelowExpectations({
          position: row.position,
          expectedPosition: expected.get(row.teamId) ?? row.position,
          teams: standings.length
        });
        const roll = createRng(seedFromString(`${row.teamId}|${window}`)).chance(
          vacancyChance(row.position, standings.length)
        );
        if (below && roll) {
          if (stint) {
            repository.closeStint(stint.id, monthStart, 'dismissed');
          }
          repository.setTeam(coach.id, null);
        }
      }
    }

    this.fillVacancies(repository, monthStart, window, state.seasonNumber);
  }

  /**
   * El final de un curso, antes de los ascensos: retiradas, despidos por
   * objetivo y los tramos congelados con sus cifras.
   *
   * Tiene que ir antes de que nadie cambie de liga: el veredicto se mide con la
   * clasificación y la categoría del curso que acaba.
   */
  closeSeason(seasonNumber: number, seasonEnd: Date): void {
    this.ensure();
    const db = this.resolveDb();
    const repository = new CoachRepository(db);
    const state = repository.gameState();
    if (!state) {
      return;
    }
    const reasons = new Map<string, CoachStintEnd>();

    // Las retiradas, primero: quien se retira no se entera de si le echaban.
    for (const coach of repository.all()) {
      if (coach.id === MANAGER_COACH_ID || coach.retired || !coach.birthDate) {
        continue;
      }
      const age = coachAge(coach.birthDate, seasonEnd);
      const roll = createRng(seedFromString(`${coach.id}|${seasonNumber}:retiro`));
      if (roll.chance(retirementChance(age, coach.teamId !== null))) {
        if (coach.teamId) {
          reasons.set(coach.id, 'retired');
        }
        repository.retire(coach.id);
      }
    }

    // Los despidos del verano, en las ligas que se han jugado.
    const figures = this.figures(repository, seasonNumber);
    const seasons = new SeasonRepository(db);
    const managerTeamId = this.managerClub(db, state);
    const teams = repository.teams();
    const benches = repository.benches();

    for (const competition of this.playedLeagues(repository, seasons)) {
      const season = figures.leagueSeason(competition.id);
      if (!season) {
        continue;
      }
      const standings = figures.standings(
        competition.id,
        repository.teamIdsInCompetition(competition.id)
      );
      for (const row of standings) {
        const coach = benches.get(row.teamId);
        if (!coach || coach.id === MANAGER_COACH_ID || row.teamId === managerTeamId) {
          continue;
        }
        const verdict = seasonVerdict({
          objective: objectiveForReputation(
            teams.get(row.teamId)?.reputation ?? 50,
            competition.tier
          ),
          position: row.position,
          teams: standings.length,
          playoffRound: figures.playoffRound(competition.id, row.teamId),
          champion: season.championTeamId === row.teamId
        });
        const roll = createRng(seedFromString(`${row.teamId}|${seasonNumber}:verano:despido`));
        if (roll.chance(summerDismissalChance(verdict))) {
          reasons.set(coach.id, 'dismissed');
          repository.setTeam(coach.id, null);
        }
      }
    }

    this.freezeSeason(repository, seasonNumber, reasons, seasonEnd, figures);
  }

  /**
   * El arranque de un curso: banquillos vacíos cubiertos, tramos nuevos para
   * todos y la bolsa repuesta con jóvenes hasta volver a su tamaño.
   */
  openSeason(seasonNumber: number, seasonStart: Date): void {
    this.ensure();
    const repository = new CoachRepository(this.resolveDb());
    const free = repository
      .all()
      .filter((coach) => coach.id !== MANAGER_COACH_ID && !coach.retired && coach.teamId === null);
    const missing = poolShortfall(free.length);
    if (missing > 0) {
      repository.insertCoaches(
        buildFreeCoaches({
          count: missing,
          firstIndex: repository.lastFreeIndex(FREE_COACH_PREFIX) + 1,
          seed: `mercado-entrenadores-${seasonNumber}`,
          nationalities: worldCountries(repository.competitions()),
          today: seasonStart,
          young: true
        })
      );
    }
  }

  /** El entrenador de cada club, para las fichas y las listas de clubes. */
  coachRefs(): Map<string, TeamCoachRef> {
    this.ensure();
    const db = this.resolveDb();
    const repository = new CoachRepository(db);
    const state = repository.gameState();
    const reputations = aiReputations(repository.closedStints());
    const refs = new Map<string, TeamCoachRef>();

    for (const [teamId, coach] of repository.benches()) {
      const isManager = coach.id === MANAGER_COACH_ID;
      refs.set(teamId, {
        id: coach.id,
        name: isManager ? (state?.managerName ?? fullName(coach)) : fullName(coach),
        nationality: isManager
          ? (state?.managerNationality ?? coach.nationality)
          : coach.nationality,
        reputation: isManager
          ? managerReputation(managerSeasonRecords(db))
          : (reputations.get(coach.id)?.(coach.baseReputation) ?? coach.baseReputation),
        isManager
      });
    }
    return refs;
  }

  /** El entrenador de un club; `null` si el banquillo está vacío. */
  coachOf(teamId: string): TeamCoachRef | null {
    return this.coachRefs().get(teamId) ?? null;
  }

  /** El ranking, con su alcance y su página. */
  ranking(request: CoachRankingRequest = {}): CoachRankingPage {
    const parsed = coachRankingRequestSchema.parse(request ?? {});
    this.ensure();
    const world = this.world();

    const rows = world.entries
      .filter((entry) => inScope(entry, parsed.scope, parsed.id))
      .map((entry, index) => ({ ...entry.row, rank: index + 1 }));
    const total = rows.length;
    const pageCount = Math.max(1, Math.ceil(total / COACH_RANKING_PAGE_SIZE));
    const managerRow = rows.find((row) => row.isManager) ?? null;
    const wanted =
      parsed.aroundManager && managerRow
        ? Math.ceil(managerRow.rank / COACH_RANKING_PAGE_SIZE)
        : parsed.page;
    const page = Math.min(pageCount, Math.max(1, wanted));

    return {
      scope: parsed.scope,
      id: parsed.id,
      page,
      pageCount,
      pageSize: COACH_RANKING_PAGE_SIZE,
      total,
      rows: rows.slice((page - 1) * COACH_RANKING_PAGE_SIZE, page * COACH_RANKING_PAGE_SIZE),
      managerRow,
      filters: world.filters
    };
  }

  /** La ficha de un entrenador; sin id, la del usuario. */
  getProfile(coachId?: string | null): CoachProfile {
    this.ensure();
    const db = this.resolveDb();
    const repository = new CoachRepository(db);
    const id = coachId ?? MANAGER_COACH_ID;
    const coach = repository.findById(id);
    const state = repository.gameState();
    if (!coach || !state) {
      throw new CoachNotFoundError(id);
    }

    const world = this.world();
    const isManager = coach.id === MANAGER_COACH_ID;
    const worldIndex = world.entries.findIndex((entry) => entry.row.coachId === coach.id);
    const entry = worldIndex >= 0 ? world.entries[worldIndex] : undefined;
    const history = this.historyOf(repository, coach.id, world);
    const teams = repository.teams();
    const competitions = repository.competitions();
    const team = coach.teamId ? teams.get(coach.teamId) : undefined;
    const competition = team ? competitions.get(team.competitionId) : undefined;

    const reputation =
      entry?.row.reputation ??
      (isManager
        ? managerReputation(managerSeasonRecords(db))
        : (aiReputations(repository.closedStints()).get(coach.id)?.(coach.baseReputation) ??
          coach.baseReputation));
    const current = history.filter((line) => line.current);
    const national = isManager ? new NationalService(this.resolveDb).userTeamId() : null;
    const ranked = world.entries.map((row, index) => ({ ...row.row, rank: index + 1 }));

    return {
      coachId: coach.id,
      isManager,
      name: isManager ? state.managerName : fullName(coach),
      nationality: isManager ? state.managerNationality : coach.nationality,
      age: coach.birthDate ? coachAge(coach.birthDate, state.currentDate) : null,
      reputation,
      reputationLabel: managerReputationLabel(reputation),
      worldRank: entry ? worldIndex + 1 : null,
      points: entry?.row.points ?? 0,
      retired: coach.retired,
      team:
        team && competition
          ? {
              teamId: team.id,
              name: team.name,
              competitionName: competition.name,
              country: competition.country
            }
          : null,
      nationalTeamName: national ? (teams.get(national)?.name ?? null) : null,
      careerMode: isManager ? state.careerMode : false,
      totals: {
        seasons: new Set(history.map((line) => line.seasonNumber)).size,
        games: history.reduce((sum, line) => sum + line.games, 0),
        wins: history.reduce((sum, line) => sum + line.wins, 0),
        titles: history.reduce((sum, line) => sum + line.titles.length, 0)
      },
      current: {
        games: current.reduce((sum, line) => sum + line.games, 0),
        wins: current.reduce((sum, line) => sum + line.wins, 0)
      },
      history,
      topFive: ranked.slice(0, 5),
      managerRow: ranked.find((row) => row.isManager) ?? null
    };
  }

  // ------------------------------------------------------------------------
  // Sincronía y carrusel
  // ------------------------------------------------------------------------

  /**
   * El club que dirige el usuario ahora mismo, o `null` si está sin banquillo:
   * destituido, o en carrera sin etapa abierta. Es la misma cuenta que para el
   * reloj de la temporada.
   */
  private managerClub(db: SaveDatabase, state: { managedTeamId: string | null }): string | null {
    if (!state.managedTeamId) {
      return null;
    }
    if (new BoardService(() => db).isDismissed()) {
      return null;
    }
    if (new CareerRepository(db).isUnemployed()) {
      return null;
    }
    return state.managedTeamId;
  }

  /** Inventa a todos los entrenadores de una partida que no los tiene. */
  private seedWorld(
    db: SaveDatabase,
    repository: CoachRepository,
    state: NonNullable<ReturnType<CoachRepository['gameState']>>,
    seasonStart: Date
  ): void {
    const managerTeamId = this.managerClub(db, state);
    const { coaches, stints } = buildInitialCoaches({
      clubs: factoryClubs(repository),
      nationalities: worldCountries(repository.competitions()),
      seasonStart,
      seasonNumber: state.seasonNumber,
      managerTeamId,
      managerName: state.managerName,
      managerNationality: state.managerNationality
    });
    repository.insertCoaches(coaches);
    repository.insertStints(stints);
    this.backfillManager(db, repository, state.seasonNumber);
  }

  /**
   * Las temporadas que el usuario ya había dirigido antes de existir los
   * entrenadores: salen de sus etapas y de los partidos, que siguen en la
   * partida. Los de la IA no tienen pasado: no se inventa palmarés.
   */
  private backfillManager(db: SaveDatabase, repository: CoachRepository, seasonNumber: number) {
    const career = new CareerRepository(db);
    const spells = career.spells();
    const managedTeamId = career.gameState().managedTeamId;
    const clubs = new Map(repository.leagueClubs().map((row) => [row.team.id, row]));
    const stints: NewCoachSeasonRow[] = [];

    for (let season = 1; season < seasonNumber; season += 1) {
      const teamId = teamManagedIn(spells, season, managedTeamId);
      const club = teamId ? clubs.get(teamId) : undefined;
      if (!teamId || !club) {
        continue;
      }
      const figures = this.figures(repository, season);
      const competitionId = figures.leagueOf(teamId) ?? club.competition.id;
      const start = this.seasonStart(repository, season, new Date(0));
      const end = this.seasonEnd(repository, season, start);
      stints.push({
        ...openStint(
          MANAGER_COACH_ID,
          { ...club.team, competitionId, tier: club.competition.tier },
          season,
          start
        ),
        endDate: end,
        endReason:
          spells.find((spell) => spell.teamId === teamId && spell.endSeason === season)
            ?.endReason ?? null
      });
    }

    repository.insertStints(stints);
    // Las cifras, como en cualquier cierre de curso.
    for (const season of new Set(stints.map((row) => row.seasonNumber))) {
      this.freezeSeason(repository, season, new Map(), this.seasonEnd(repository, season));
    }
  }

  /**
   * El usuario, al día: su nombre y bandera, y su banquillo.
   *
   * Si ha cogido un club, el entrenador de la IA que había se va a la bolsa
   * (despedido: el club lo cambia por el usuario). Si se ha quedado sin club,
   * su tramo se cierra —como despido o como marcha, según fuera— y el
   * banquillo queda vacante para el carrusel.
   */
  private syncManager(
    db: SaveDatabase,
    repository: CoachRepository,
    state: NonNullable<ReturnType<CoachRepository['gameState']>>
  ): void {
    const [firstName = state.managerName, ...rest] = state.managerName.trim().split(/\s+/);
    const lastName = rest.join(' ');
    let manager = repository.findById(MANAGER_COACH_ID);
    if (!manager) {
      repository.insertCoaches([
        {
          id: MANAGER_COACH_ID,
          teamId: null,
          firstName,
          lastName,
          nationality: state.managerNationality,
          birthDate: null,
          baseReputation: 35,
          retired: false
        }
      ]);
      manager = repository.findById(MANAGER_COACH_ID) as CoachRow;
    }
    if (
      manager.firstName !== firstName ||
      manager.lastName !== lastName ||
      manager.nationality !== state.managerNationality
    ) {
      repository.updateCoach(MANAGER_COACH_ID, {
        firstName,
        lastName,
        nationality: state.managerNationality
      });
    }

    const club = this.managerClub(db, state);
    if (manager.teamId === club) {
      return;
    }
    const today = state.currentDate;
    const open = repository.openStints();

    if (manager.teamId) {
      const stint = open.find((row) => row.coachId === MANAGER_COACH_ID);
      if (stint) {
        repository.closeStint(stint.id, today, this.managerExitReason(db, manager.teamId));
      }
      repository.setTeam(MANAGER_COACH_ID, null);
    }

    if (club) {
      const incumbent = repository.benches().get(club);
      if (incumbent && incumbent.id !== MANAGER_COACH_ID) {
        const stint = open.find((row) => row.coachId === incumbent.id);
        if (stint) {
          repository.closeStint(stint.id, today, 'dismissed');
        }
        repository.setTeam(incumbent.id, null);
      }
      repository.setTeam(MANAGER_COACH_ID, club);
      const info = factoryClubs(repository).find((row) => row.id === club);
      if (info) {
        repository.insertStints([openStint(MANAGER_COACH_ID, info, state.seasonNumber, today)]);
      }
    }
  }

  /** Cómo dejó el usuario un club: destituido si el consejo lo echó; si no, se marchó. */
  private managerExitReason(db: SaveDatabase, teamId: string): CoachStintEnd {
    if (new ClubRepository(db).findBoard(teamId)?.dismissed) {
      return 'dismissed';
    }
    const spell = new CareerRepository(db)
      .spells()
      .filter((row) => row.teamId === teamId)
      .at(-1);
    return spell?.endReason === 'dismissed' ? 'dismissed' : 'left';
  }

  /**
   * Un tramo abierto por cada entrenador con banquillo, en el curso en juego.
   *
   * Es la red de seguridad de todo lo demás: cierra los tramos que ya no
   * cuadran con su club y abre los que falten. Quien no tenía ninguno este
   * curso lo abre desde el principio del curso; quien ya tenía, desde hoy.
   */
  private reconcileStints(
    repository: CoachRepository,
    seasonNumber: number,
    seasonStart: Date,
    today: Date
  ): void {
    const coaches = new Map(repository.all().map((row) => [row.id, row]));
    const covered = new Set<string>();

    for (const stint of repository.openStints()) {
      const coach = coaches.get(stint.coachId);
      if (coach && coach.teamId === stint.teamId && stint.seasonNumber === seasonNumber) {
        covered.add(coach.id);
        continue;
      }
      repository.closeStint(stint.id, today, coach?.retired ? 'retired' : 'left');
    }

    const clubs = new Map(factoryClubs(repository).map((row) => [row.id, row]));
    const thisSeason = new Set(repository.stintsOfSeason(seasonNumber).map((row) => row.coachId));
    const missing: NewCoachSeasonRow[] = [];
    for (const coach of coaches.values()) {
      const club = coach.teamId ? clubs.get(coach.teamId) : undefined;
      if (!club || coach.retired || covered.has(coach.id)) {
        continue;
      }
      missing.push(
        openStint(coach.id, club, seasonNumber, thisSeason.has(coach.id) ? today : seasonStart)
      );
    }
    repository.insertStints(missing);
  }

  /**
   * Cubre los banquillos vacíos, del club más grande al más pequeño.
   *
   * Cada club elige con {@link chooseReplacement}: el mejor libre dispuesto o,
   * con la tirada `club|ventana:robo`, el de un club más pequeño del mismo
   * continente. Quitarle el entrenador a otro deja otro banquillo vacío, que
   * entra en la cola: la cadena acaba siempre, porque cada robo baja al menos
   * un escalón de reputación. Si no hay nadie, se sube a un joven.
   */
  private fillVacancies(
    repository: CoachRepository,
    today: Date,
    window: string,
    seasonNumber: number
  ): void {
    const clubs = repository.leagueClubs();
    const benches = repository.benches();
    const byReputation = (a: { team: TeamRow }, b: { team: TeamRow }): number =>
      b.team.reputation - a.team.reputation || a.team.id.localeCompare(b.team.id);
    const queue = clubs.filter((row) => !benches.has(row.team.id)).sort(byReputation);
    if (queue.length === 0) {
      return;
    }

    const clubById = new Map(clubs.map((row) => [row.team.id, row]));
    // Un club no vuelve a llamar al entrenador que acaba de echar: ni este
    // curso ni el verano siguiente.
    const sacked = new Set(
      [...repository.stintsOfSeason(seasonNumber), ...repository.stintsOfSeason(seasonNumber - 1)]
        .filter((row) => row.endReason === 'dismissed')
        .map((row) => `${row.teamId}|${row.coachId}`)
    );
    const coaches = repository.all();
    const reputations = aiReputations(repository.closedStints());
    const reputationOf = (coach: CoachRow): number =>
      reputations.get(coach.id)?.(coach.baseReputation) ?? coach.baseReputation;
    const open = new Map<string, { id: string }>(
      repository.openStints().map((row) => [row.coachId, row])
    );

    while (queue.length > 0) {
      const club = queue.shift() as { team: TeamRow; competition: CompetitionRow };
      if (benches.has(club.team.id)) {
        continue;
      }

      const candidates: CoachCandidate[] = coaches
        .filter((coach) => coach.id !== MANAGER_COACH_ID && !coach.retired)
        .filter((coach) => !sacked.has(`${club.team.id}|${coach.id}`))
        .filter((coach) => {
          if (coach.teamId === null) {
            return true;
          }
          const home = clubById.get(coach.teamId);
          return (
            home !== undefined &&
            coach.teamId !== club.team.id &&
            home.competition.continent === club.competition.continent
          );
        })
        .map((coach) => ({
          coachId: coach.id,
          reputation: reputationOf(coach),
          teamId: coach.teamId,
          teamReputation: coach.teamId
            ? (clubById.get(coach.teamId)?.team.reputation ?? null)
            : null
        }));

      const poach = createRng(seedFromString(`${club.team.id}|${window}:robo`)).chance(
        POACH_CHANCE
      );
      const choice = chooseReplacement({
        clubReputation: club.team.reputation,
        candidates,
        poach
      });

      let coach = choice ? coaches.find((row) => row.id === choice.coachId) : undefined;
      if (!coach) {
        // Ni un libre: sube un joven, de casa, para ese banquillo.
        const [row] = buildFreeCoaches({
          count: 1,
          firstIndex: repository.lastFreeIndex(FREE_COACH_PREFIX) + 1,
          seed: `${club.team.id}|${window}:joven`,
          nationalities: [club.team.country],
          today,
          young: true
        });
        repository.insertCoaches(row ? [row] : []);
        coach = row ? (repository.findById(row.id) ?? undefined) : undefined;
        if (!coach) {
          continue;
        }
        coaches.push(coach);
      }

      if (coach.teamId) {
        // Se lo quita a otro club, que se queda con el banquillo vacío.
        const stint = open.get(coach.id);
        if (stint) {
          repository.closeStint(stint.id, today, 'left');
        }
        benches.delete(coach.teamId);
        const from = clubById.get(coach.teamId);
        if (from) {
          queue.push(from);
          queue.sort(byReputation);
        }
      }

      repository.setTeam(coach.id, club.team.id);
      coach.teamId = club.team.id;
      benches.set(club.team.id, coach);
      const stint = openStint(
        coach.id,
        {
          id: club.team.id,
          competitionId: club.competition.id,
          tier: club.competition.tier,
          reputation: club.team.reputation
        },
        seasonNumber,
        today
      );
      repository.insertStints([stint]);
      open.set(coach.id, { id: stint.id as string });
    }
  }

  /**
   * Congela las cifras de los tramos de un curso.
   *
   * Los que siguen abiertos se cierran con el curso (`seasonEnd`) y con el
   * motivo que haya decidido el verano —despido o retirada—, o sin motivo si
   * siguen. El puesto sólo lo lleva quien estaba en el banquillo en la última
   * jornada de liga: al que echaron en enero no se le cuenta dónde acabó otro.
   */
  private freezeSeason(
    repository: CoachRepository,
    seasonNumber: number,
    reasons: ReadonlyMap<string, CoachStintEnd>,
    seasonEnd: Date,
    figures = this.figures(repository, seasonNumber)
  ): void {
    const teams = repository.teams();
    const competitions = repository.competitions();
    const leagueTeams = new Map<string, string[]>();
    const teamIdsOf = (competitionId: string): string[] => {
      let ids = leagueTeams.get(competitionId);
      if (!ids) {
        ids = repository.teamIdsInCompetition(competitionId);
        leagueTeams.set(competitionId, ids);
      }
      return ids;
    };

    const frozen = repository
      .stintsOfSeason(seasonNumber)
      .filter((stint) => !stint.closed)
      .map((stint) => {
        const end = stint.endDate ?? seasonEnd;
        const numbers = figures.stint(stint.teamId, stint.startDate, end);
        const lastRegular = figures.lastRegularGame(stint.competitionId, stint.teamId);
        const ids = teamIdsOf(stint.competitionId);
        const coveredEnd =
          lastRegular !== null &&
          stint.startDate.getTime() <= lastRegular &&
          end.getTime() > lastRegular;
        const position = coveredEnd
          ? (figures.standings(stint.competitionId, ids).find((row) => row.teamId === stint.teamId)
              ?.position ?? null)
          : null;

        return {
          id: stint.id,
          figures: {
            endDate: end,
            endReason: stint.endDate ? stint.endReason : (reasons.get(stint.coachId) ?? null),
            games: numbers.games,
            wins: numbers.wins,
            position,
            teams: ids.length,
            tier: competitions.get(stint.competitionId)?.tier ?? stint.tier,
            clubReputation: teams.get(stint.teamId)?.reputation ?? stint.clubReputation,
            titleNames: numbers.titleNames,
            points: numbers.points
          }
        };
      });

    repository.freezeStints(frozen);
  }

  // ------------------------------------------------------------------------
  // Lectura
  // ------------------------------------------------------------------------

  /** El ranking del mundo entero, ordenado, con los filtros posibles. */
  private world(): World {
    const db = this.resolveDb();
    const repository = new CoachRepository(db);
    const state = repository.gameState();
    const seasonNumber = state?.seasonNumber ?? 1;
    const today = state?.currentDate ?? new Date();
    const teams = repository.teams();
    const competitions = repository.competitions();
    const figures = this.figures(repository, seasonNumber);
    const closed = repository.closedStints();
    const reputations = aiReputations(closed);
    const managerValue = managerReputation(managerSeasonRecords(db));

    const current = groupBy(repository.stintsOfSeason(seasonNumber), (row) => row.coachId);
    const previous = groupBy(repository.stintsOfSeason(seasonNumber - 1), (row) => row.coachId);
    const titlesBefore = new Map<string, number>();
    for (const stint of closed) {
      if (stint.seasonNumber !== seasonNumber) {
        titlesBefore.set(stint.coachId, (titlesBefore.get(stint.coachId) ?? 0) + stint.titles);
      }
    }

    const entries: WorldEntry[] = [];
    for (const coach of repository.all()) {
      if (coach.retired) {
        continue;
      }
      const isManager = coach.id === MANAGER_COACH_ID;
      let currentPoints = 0;
      let games = 0;
      let wins = 0;
      let titles = titlesBefore.get(coach.id) ?? 0;
      for (const stint of current.get(coach.id) ?? []) {
        const numbers = stint.closed
          ? { points: stint.points, games: stint.games, wins: stint.wins, titles: stint.titles }
          : liveNumbers(figures, stint);
        currentPoints += numbers.points;
        games += numbers.games;
        wins += numbers.wins;
        titles += numbers.titles;
      }
      const previousPoints = (previous.get(coach.id) ?? []).reduce(
        (sum, stint) => sum + stint.points,
        0
      );

      const team = coach.teamId ? teams.get(coach.teamId) : undefined;
      const competition = team ? competitions.get(team.competitionId) : undefined;
      const reputation = isManager
        ? managerValue
        : (reputations.get(coach.id)?.(coach.baseReputation) ?? coach.baseReputation);

      entries.push({
        row: {
          rank: 0,
          coachId: coach.id,
          name: isManager ? (state?.managerName ?? fullName(coach)) : fullName(coach),
          nationality: isManager
            ? (state?.managerNationality ?? coach.nationality)
            : coach.nationality,
          age: coach.birthDate ? coachAge(coach.birthDate, today) : null,
          isManager,
          teamId: team?.id ?? null,
          teamName: team?.name ?? null,
          competitionName: competition?.name ?? null,
          reputation,
          points: rankingPoints(currentPoints, previousPoints),
          currentPoints: roundTenth(currentPoints),
          previousPoints: roundTenth(previousPoints),
          seasonGames: games,
          seasonWins: wins,
          titles
        },
        continent: competition?.continent ?? null,
        country: competition?.country ?? null,
        competitionId: competition?.id ?? null
      });
    }

    entries.sort((a, b) =>
      compareRanking(
        { points: a.row.points, reputation: a.row.reputation, coachId: a.row.coachId },
        { points: b.row.points, reputation: b.row.reputation, coachId: b.row.coachId }
      )
    );

    return { entries, filters: filtersOf(entries, competitions), seasonNumber, figures };
  }

  /** El historial de un entrenador, del curso más reciente al más antiguo. */
  private historyOf(repository: CoachRepository, coachId: string, world: World): CoachSeasonLine[] {
    const teams = repository.teams();
    const competitions = repository.competitions();
    const startYears = repository.startYears();
    const leagueSizes = new Map<string, number>();

    return repository
      .stintsOfCoach(coachId)
      .sort(
        (a, b) => b.seasonNumber - a.seasonNumber || b.startDate.getTime() - a.startDate.getTime()
      )
      .map((stint): CoachSeasonLine => {
        const current = !stint.closed && stint.seasonNumber === world.seasonNumber;
        const live = current
          ? world.figures.stint(stint.teamId, stint.startDate, stint.endDate)
          : null;
        let teamsInLeague = stint.teams;
        if (!stint.closed) {
          teamsInLeague =
            leagueSizes.get(stint.competitionId) ??
            repository.teamIdsInCompetition(stint.competitionId).length;
          leagueSizes.set(stint.competitionId, teamsInLeague);
        }
        const startYear = startYears.get(stint.seasonNumber) ?? seasonYearOf(stint.startDate);

        return {
          seasonNumber: stint.seasonNumber,
          seasonLabel: `${startYear}-${String((startYear + 1) % 100).padStart(2, '0')}`,
          teamId: stint.teamId,
          teamName: teams.get(stint.teamId)?.name ?? stint.teamId,
          competitionName: competitions.get(stint.competitionId)?.name ?? '',
          tier: stint.tier,
          position: stint.closed ? stint.position : null,
          teams: teamsInLeague,
          games: live ? live.games : stint.games,
          wins: live ? live.wins : stint.wins,
          titles: live ? live.titleNames : parseTitles(stint.titleNames),
          points: live ? live.points : stint.points,
          endReason: (stint.endReason as CoachStintEnd | null) ?? null,
          current
        };
      });
  }

  // ------------------------------------------------------------------------

  private figures(repository: CoachRepository, seasonNumber: number): SeasonFigures {
    return new SeasonFigures(
      repository.seasonsOf(seasonNumber),
      repository.competitions(),
      repository.playedGames(seasonNumber),
      repository.teams()
    );
  }

  /** Las ligas de los países que se juegan: las únicas con calendario este curso. */
  private playedLeagues(repository: CoachRepository, seasons: SeasonRepository): CompetitionRow[] {
    const countries = new Set(seasons.activeCountries());
    return [...repository.competitions().values()]
      .filter((row) => row.format === 'league' && countries.has(row.country))
      .sort((a, b) => a.id.localeCompare(b.id));
  }

  /**
   * El primer día de un curso: el 1 de septiembre de su año de arranque. Si el
   * curso todavía no tiene temporadas, se deduce de la fecha del juego.
   */
  private seasonStart(repository: CoachRepository, seasonNumber: number, fallback?: Date): Date {
    const year = repository.startYears().get(seasonNumber);
    if (year !== undefined) {
      return new Date(Date.UTC(year, 8, 1));
    }
    const reference = fallback ?? repository.gameState()?.currentDate ?? new Date();
    return new Date(Date.UTC(seasonYearOf(reference), 8, 1));
  }

  /** El día en que acaba un curso: el primero del siguiente. */
  private seasonEnd(repository: CoachRepository, seasonNumber: number, fallback?: Date): Date {
    const start = this.seasonStart(repository, seasonNumber, fallback);
    return new Date(Date.UTC(start.getUTCFullYear() + 1, 8, 1));
  }
}

// --------------------------------------------------------------------------

/** Los clubes de liga, con lo que necesita la fábrica de entrenadores. */
function factoryClubs(repository: CoachRepository): CoachFactoryClub[] {
  return repository.leagueClubs().map(({ team, competition }) => ({
    id: team.id,
    country: team.country,
    reputation: team.reputation,
    competitionId: competition.id,
    tier: competition.tier
  }));
}

/** Los países con liga, en orden: las banderas de la bolsa. */
function worldCountries(competitions: Map<string, CompetitionRow>): string[] {
  return [
    ...new Set(
      [...competitions.values()].filter((row) => row.format === 'league').map((row) => row.country)
    )
  ].sort();
}

/**
 * La reputación de cada entrenador de la IA, como función de su base: la
 * historia sale de sus tramos cerrados con partidos (un curso en una liga que no
 * se juega no es oficio), y la base la pone quien pregunta.
 */
function aiReputations(closed: readonly CoachSeasonRow[]): Map<string, (base: number) => number> {
  const records = new Map<string, CareerSeasonRecord[]>();
  for (const stint of closed) {
    if (stint.games === 0) {
      continue;
    }
    const list = records.get(stint.coachId) ?? [];
    list.push({
      position: stint.position,
      teams: stint.teams,
      tier: stint.tier,
      clubReputation: stint.clubReputation,
      titles: stint.titles,
      dismissed: stint.endReason === 'dismissed'
    });
    records.set(stint.coachId, list);
  }
  return new Map(
    [...records.entries()].map(([coachId, list]) => [
      coachId,
      (base: number) => coachReputation(base, list)
    ])
  );
}

/** Dónde le toca acabar a cada club por reputación: 1 el de más nombre de la liga. */
function expectedPositions(
  teamIds: readonly string[],
  teams: Map<string, TeamRow>
): Map<string, number> {
  return new Map(
    [...teamIds]
      .sort(
        (a, b) =>
          (teams.get(b)?.reputation ?? 0) - (teams.get(a)?.reputation ?? 0) || a.localeCompare(b)
      )
      .map((teamId, index) => [teamId, index + 1])
  );
}

function liveNumbers(
  figures: SeasonFigures,
  stint: CoachSeasonRow
): { points: number; games: number; wins: number; titles: number } {
  const numbers = figures.stint(stint.teamId, stint.startDate, stint.endDate);
  return {
    points: numbers.points,
    games: numbers.games,
    wins: numbers.wins,
    titles: numbers.titleNames.length
  };
}

function inScope(entry: WorldEntry, scope: string, id: string | null): boolean {
  if (scope === 'world' || id === null) {
    return true;
  }
  switch (scope) {
    case 'continent':
      return entry.continent === id;
    case 'country':
      return entry.country === id;
    case 'competition':
      return entry.competitionId === id;
    default:
      return true;
  }
}

/** Lo que se puede elegir en el filtro: sólo lo que tiene algún entrenador. */
function filtersOf(
  entries: readonly WorldEntry[],
  competitions: Map<string, CompetitionRow>
): CoachRankingPage['filters'] {
  const continents = new Map<string, string>();
  const countries = new Map<string, string>();
  const leagues = new Map<string, string>();
  for (const entry of entries) {
    if (entry.continent) {
      continents.set(entry.continent, CONTINENT_NAMES[entry.continent] ?? entry.continent);
    }
    if (entry.country) {
      countries.set(entry.country, countryName(entry.country));
    }
    if (entry.competitionId) {
      leagues.set(entry.competitionId, competitions.get(entry.competitionId)?.name ?? '');
    }
  }
  const options = (map: Map<string, string>): CoachRankingFilterOption[] =>
    [...map.entries()]
      .map(([id, label]) => ({ id, label }))
      .sort((a, b) => a.label.localeCompare(b.label, 'es'));

  return {
    continents: options(continents),
    countries: options(countries),
    competitions: options(leagues)
  };
}

function groupBy<T>(rows: readonly T[], key: (row: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const list = groups.get(key(row)) ?? [];
    list.push(row);
    groups.set(key(row), list);
  }
  return groups;
}

function fullName(coach: CoachRow): string {
  return `${coach.firstName} ${coach.lastName}`.trim();
}

function parseTitles(json: string): string[] {
  try {
    const parsed = JSON.parse(json) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((row): row is string => typeof row === 'string')
      : [];
  } catch {
    return [];
  }
}

/** El año en que arranca el curso de una fecha: de septiembre a agosto. */
function seasonYearOf(date: Date): number {
  return date.getUTCMonth() >= 8 ? date.getUTCFullYear() : date.getUTCFullYear() - 1;
}

/** «2025-10»: la ventana del carrusel es el mes, como la de las ofertas al usuario. */
function monthKey(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

function roundTenth(value: number): number {
  return Math.round(value * 10) / 10;
}
