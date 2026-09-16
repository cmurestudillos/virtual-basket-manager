import { randomUUID } from 'node:crypto';
import type {
  CallupCandidate,
  CallupResult,
  MyNationalTeam,
  NationEntry,
  NationalCallupView,
  NationalCompetitionView,
  NationalOverview,
  NationalWindowInfo,
  SaveCallupRequest
} from '@shared/contracts/national.contract';
import { MIN_CALLUP, saveCallupRequestSchema } from '@shared/contracts/national.contract';
import type { FixtureEntry, StandingEntry } from '@shared/contracts/season.contract';
import { clubWouldHire } from '@shared/domain/career';
import {
  FEDERATION_VERDICT_LABELS,
  NATIONAL_OBJECTIVE_LABELS,
  NATIONAL_OUTCOME_LABELS,
  NATIONAL_SQUAD_SIZE,
  NATIONAL_WINDOWS,
  NATIONAL_WINDOW_LABELS,
  MIN_NATIONAL_POOL,
  QUALIFIER_GROUP_SIZE,
  WORLD_CUP_FINAL,
  WORLD_CUP_QUARTERFINAL,
  callupDate,
  drawQualifierGroups,
  drawWorldCupGroups,
  federationVerdict,
  groupName,
  hostFor,
  nationName,
  nationReputation,
  nationStrength,
  nationalTeamId,
  nationalVacancyChance,
  objectiveForRank,
  outcomeFor,
  pickSquad,
  qualifierDate,
  releasedForWindow,
  windowOfMatchday,
  worldCupDate,
  worldCupEntrants,
  worldCupQuarterfinals,
  worldCupRoundName,
  type NationalOutcome,
  type NationalWindow,
  type SquadCandidate
} from '@shared/domain/national-teams';
import { buildAutomaticRotation } from '@shared/domain/rotation';
import { generateRoundRobin, generateSingleRoundRobin } from '@shared/domain/schedule';
import { computeStandings } from '@shared/domain/standings';
import { createRng, seedFromString } from '@shared/engine/basketball/rng';
import type { SaveDatabase } from '../../database/save-database';
import type {
  CompetitionRow,
  GameRow,
  NewGameRow,
  PlayerRow,
  SeasonRow
} from '../../database/schema/save';
import { MatchService } from '../match/match.service';
import { toPlayerSummary } from '../players/players.mapper';
import {
  NATIONAL_TEAMS_COMPETITION_ID,
  QUALIFIERS_COMPETITION_ID,
  WORLD_CUP_COMPETITION_ID,
  windowForDate
} from './national-squad';
import { NationalRepository } from './national.repository';

const DAY_MS = 24 * 60 * 60 * 1000;
/** Tope de días que se simulan al cerrar el verano, por si algo no acabara. */
const MAX_SUMMER_DAYS = 400;

export class NotNationalTeamError extends Error {
  constructor(teamId: string) {
    super(`${teamId} no es una selección`);
    this.name = 'NotNationalTeamError';
  }
}

/** Un banquillo de selección libre, visto desde la carrera. */
export interface NationalVacancy {
  teamId: string;
  name: string;
  reputation: number;
  rank: number;
  objectiveLabel: string;
}

/**
 * Las selecciones: la clasificación, el Mundial y la selección del usuario.
 *
 * El curso de selecciones se crea con el de clubes y se mueve con el mismo
 * reloj: {@link advance} se llama cada vez que la temporada se pone al día y
 * es idempotente, igual que el resto de competiciones. Lo único que corre por
 * su cuenta es {@link completeSeason}: si el usuario no tiene partidos de
 * selección pendientes, el verano no le hace esperar y los partidos que falten
 * se juegan de golpe al empezar la temporada siguiente.
 */
export class NationalService {
  /** Ver el porqué del resolutor en `SeasonService`. */
  constructor(private readonly resolveDb: () => SaveDatabase) {}

  // --- El curso ---------------------------------------------------------------

  /** Crea lo que falte del curso: competiciones, selecciones y clasificación. */
  ensureSeason(seasonNumber: number, startYear: number): void {
    const repository = new NationalRepository(this.resolveDb());
    if (repository.findSeasonOf(QUALIFIERS_COMPETITION_ID, seasonNumber)) {
      return;
    }

    this.ensureCompetitions(repository);
    const ranked = this.refreshTeams(repository);

    const qualifiers: SeasonRow = {
      id: randomUUID(),
      competitionId: QUALIFIERS_COMPETITION_ID,
      seasonNumber,
      startYear,
      currentRound: 1,
      stage: 'regular',
      championTeamId: null
    };
    repository.insertSeason(qualifiers);

    const host = hostFor(
      ranked.map((row) => row.teamId),
      seasonNumber
    );
    const pool = ranked.map((row) => row.teamId).filter((teamId) => teamId !== host);
    if (pool.length < QUALIFIER_GROUP_SIZE * 2) {
      // Con tan pocas selecciones no hay ni clasificación ni Mundial.
      repository.setStage(qualifiers.id, 'finished');
      return;
    }

    const groups = drawQualifierGroups(
      pool,
      createRng(seedFromString(`clasificacion-${seasonNumber}`))
    );
    repository.insertGroups(
      groups.flatMap((teamIds, index) =>
        teamIds.map((teamId, pot) => ({
          id: `${qualifiers.id}-${groupName(index)}-${teamId}`,
          seasonId: qualifiers.id,
          groupName: groupName(index),
          teamId,
          pot: pot + 1
        }))
      )
    );
    repository.insertGames(
      groups.flatMap((teamIds) =>
        generateRoundRobin(teamIds, 2).flatMap((pairings, index) =>
          pairings.map((pairing): NewGameRow => ({
            id: randomUUID(),
            seasonId: qualifiers.id,
            round: index + 1,
            scheduledOn: qualifierDate(startYear, index + 1),
            homeTeamId: pairing.homeTeamId,
            awayTeamId: pairing.awayTeamId,
            neutralVenue: false
          }))
        )
      )
    );
  }

  /**
   * Pone al día lo que depende de la fecha: convocatorias, el paso de la
   * clasificación al Mundial, el cuadro y el campeón.
   */
  advance(today: Date): void {
    const repository = new NationalRepository(this.resolveDb());
    const seasonNumber = repository.gameState().seasonNumber;
    const qualifiers = repository.findSeasonOf(QUALIFIERS_COMPETITION_ID, seasonNumber);
    if (!qualifiers) {
      return;
    }

    this.ensureCallups(repository, qualifiers, today);
    this.advanceQualifiers(repository, qualifiers);

    const worldCup = repository.findSeasonOf(WORLD_CUP_COMPETITION_ID, seasonNumber);
    if (worldCup) {
      this.advanceWorldCup(repository, worldCup);
    }
  }

  /** Las temporadas de selecciones de un curso, para el reloj. */
  seasonIds(seasonNumber: number): string[] {
    const repository = new NationalRepository(this.resolveDb());
    return [QUALIFIERS_COMPETITION_ID, WORLD_CUP_COMPETITION_ID]
      .map((competitionId) => repository.findSeasonOf(competitionId, seasonNumber))
      .filter((row): row is SeasonRow => row !== null)
      .map((row) => row.id);
  }

  /** La selección que dirige el usuario. */
  userTeamId(): string | null {
    return new NationalRepository(this.resolveDb()).openSpell()?.teamId ?? null;
  }

  /**
   * Si al usuario le quedan partidos de selección este curso. Mientras los
   * tenga, la temporada no se cierra: el Mundial se juega, no se simula.
   */
  userHasPendingGames(seasonNumber: number): boolean {
    const teamId = this.userTeamId();
    if (!teamId) {
      return false;
    }
    const repository = new NationalRepository(this.resolveDb());
    return this.seasonIds(seasonNumber).some((seasonId) =>
      repository.listGames(seasonId).some((game) => !isPlayed(game) && involves(game, teamId))
    );
  }

  /**
   * Juega lo que quede del curso de selecciones, día a día y con la IA. Es lo
   * que hace el cambio de temporada cuando el usuario no tiene nada que jugar
   * en verano.
   */
  completeSeason(seasonNumber: number): void {
    const db = this.resolveDb();
    const match = new MatchService(this.resolveDb);

    for (let guard = 0; guard < MAX_SUMMER_DAYS; guard += 1) {
      const repository = new NationalRepository(db);
      const pending = this.seasonIds(seasonNumber)
        .flatMap((seasonId) => repository.listGames(seasonId))
        .filter((game) => !isPlayed(game))
        .sort(
          (a, b) => a.scheduledOn.getTime() - b.scheduledOn.getTime() || a.id.localeCompare(b.id)
        );
      const first = pending[0];
      if (!first) {
        break;
      }

      const day = first.scheduledOn;
      this.advance(day);
      for (const game of pending.filter((row) => row.scheduledOn.getTime() === day.getTime())) {
        match.simulateAiGame(db, game, day);
      }
      this.advance(day);
    }
  }

  // --- Lo que ve el usuario ---------------------------------------------------

  getOverview(): NationalOverview {
    const repository = new NationalRepository(this.resolveDb());
    const state = repository.gameState();
    const seasonNumber = state.seasonNumber;
    const qualifiers = repository.findSeasonOf(QUALIFIERS_COMPETITION_ID, seasonNumber);
    const worldCup = repository.findSeasonOf(WORLD_CUP_COMPETITION_ID, seasonNumber);
    const userTeamId = repository.openSpell()?.teamId ?? null;
    const names = repository.teamNames();

    return {
      seasonNumber,
      myTeam: userTeamId ? this.myTeam(repository, userTeamId, seasonNumber) : null,
      nextWindow: qualifiers ? nextWindow(qualifiers.startYear, state.currentDate) : null,
      qualifiers: qualifiers ? this.competitionView(repository, qualifiers, userTeamId) : null,
      worldCup: worldCup ? this.competitionView(repository, worldCup, userTeamId) : null,
      champions: repository
        .seasonsOf(WORLD_CUP_COMPETITION_ID)
        .filter((row) => row.championTeamId)
        .map((row) => ({
          seasonNumber: row.seasonNumber,
          startYear: row.startYear,
          teamName: names.get(row.championTeamId as string) ?? (row.championTeamId as string)
        }))
        .reverse(),
      nations: this.rankedNations(repository)
    };
  }

  /** La lista de la ventana que toca, con todos los convocables. */
  getCallup(): NationalCallupView | null {
    const repository = new NationalRepository(this.resolveDb());
    const teamId = repository.openSpell()?.teamId ?? null;
    const state = repository.gameState();
    const qualifiers = repository.findSeasonOf(QUALIFIERS_COMPETITION_ID, state.seasonNumber);
    const team = teamId ? repository.findTeam(teamId) : null;
    if (!team?.nationalOf || !qualifiers) {
      return null;
    }

    const today = state.currentDate;
    const window = windowForDate(qualifiers.startYear, today);
    const selected = new Set(
      repository
        .callups(state.seasonNumber, window)
        .filter((row) => row.teamId === team.id)
        .map((row) => row.playerId)
    );
    const clubs = repository.clubLeagues();
    const continental = repository.continentalClubIds(state.seasonNumber);

    const candidates: CallupCandidate[] = repository
      .seniorPlayers()
      .filter((row) => row.nationality === team.nationalOf)
      .map((row) => {
        const summary = toPlayerSummary(row, today);
        const club = row.teamId ? clubs.get(row.teamId) : undefined;
        return {
          playerId: row.id,
          name: `${row.firstName} ${row.lastName}`,
          position: summary.position,
          age: summary.age,
          overall: summary.overall,
          condition: row.condition,
          injuryDaysLeft: row.injuryDaysLeft,
          clubName: club?.name ?? null,
          released: releasedForWindow(window, {
            leagueCountry: club?.country ?? null,
            playsContinental: row.teamId ? continental.has(row.teamId) : false
          }),
          selected: selected.has(row.id)
        };
      })
      // Arriba los convocados; después, los que se pueden llamar; al final, los
      // que esta ventana no vienen.
      .sort(
        (a, b) =>
          Number(b.selected) - Number(a.selected) ||
          Number(b.released && b.injuryDaysLeft === 0) -
            Number(a.released && a.injuryDaysLeft === 0) ||
          b.overall - a.overall
      );

    const { editable, reason } = this.callupStatus(
      repository,
      qualifiers,
      team.id,
      window,
      today,
      selected.size
    );

    return {
      teamId: team.id,
      teamName: team.name,
      window,
      windowLabel: NATIONAL_WINDOW_LABELS[window],
      seasonNumber: state.seasonNumber,
      editable,
      reason,
      squadSize: NATIONAL_SQUAD_SIZE,
      minSquad: MIN_CALLUP,
      candidates
    };
  }

  /** Cambia la lista de la ventana, si todavía se puede. */
  saveCallup(request: SaveCallupRequest): CallupResult {
    const parsed = saveCallupRequestSchema.safeParse(request);
    if (!parsed.success) {
      return {
        ok: false,
        reason: `La lista tiene que tener entre ${MIN_CALLUP} y ${NATIONAL_SQUAD_SIZE} jugadores`,
        view: null
      };
    }

    const view = this.getCallup();
    if (!view) {
      return { ok: false, reason: 'No diriges ninguna selección', view: null };
    }
    if (!view.editable) {
      return { ok: false, reason: view.reason, view };
    }

    const ids = [...new Set(parsed.data.playerIds)];
    const byId = new Map(view.candidates.map((row) => [row.playerId, row]));
    for (const playerId of ids) {
      const candidate = byId.get(playerId);
      if (!candidate) {
        return { ok: false, reason: 'Sólo se convoca a jugadores del país', view };
      }
      if (!candidate.released) {
        return {
          ok: false,
          reason: `El club de ${candidate.name} no lo suelta en esta ventana`,
          view
        };
      }
      if (candidate.injuryDaysLeft > 0) {
        return { ok: false, reason: `${candidate.name} está lesionado`, view };
      }
    }
    if (ids.length < MIN_CALLUP) {
      return { ok: false, reason: `Hacen falta al menos ${MIN_CALLUP} jugadores`, view };
    }

    const db = this.resolveDb();
    const repository = new NationalRepository(db);
    repository.replaceCallups(view.teamId, view.seasonNumber, view.window, ids);
    this.rebuildRotation(repository, view.teamId, repository.playersByIds(ids));

    return { ok: true, reason: null, view: this.getCallup() };
  }

  // --- La carrera -------------------------------------------------------------

  /** Selecciones sin seleccionador que aceptarían a un entrenador de esa reputación. */
  vacancies(managerReputation: number): NationalVacancy[] {
    const repository = new NationalRepository(this.resolveDb());
    const state = repository.gameState();
    const market = this.marketSeason(repository, state.seasonNumber, state.currentDate);
    if (market === null) {
      return [];
    }

    const current = repository.openSpell()?.teamId ?? null;
    const ranked = this.rankedNations(repository);

    return ranked
      .filter((nation) => nation.teamId !== current)
      .filter((nation) => clubWouldHire(nation.reputation, managerReputation))
      .filter((nation) => {
        const outcome = this.outcomeOf(repository, market, nation.teamId) ?? 'notQualified';
        const verdict = federationVerdict(objectiveForRank(nation.rank), outcome);
        const roll = createRng(seedFromString(`${nation.teamId}|federacion|${market}`));
        return roll.chance(nationalVacancyChance(verdict));
      })
      .slice(0, 3)
      .map((nation) => ({
        teamId: nation.teamId,
        name: nation.name,
        reputation: nation.reputation,
        rank: nation.rank,
        objectiveLabel: NATIONAL_OBJECTIVE_LABELS[objectiveForRank(nation.rank)]
      }));
  }

  /**
   * El usuario pasa a dirigir una selección. Si la coge con el Mundial del
   * curso ya jugado, su etapa empieza en el siguiente: no se le juzga por un
   * verano que no dirigió.
   */
  takeTeam(teamId: string): void {
    const repository = new NationalRepository(this.resolveDb());
    const team = repository.findTeam(teamId);
    if (!team?.nationalOf) {
      throw new NotNationalTeamError(teamId);
    }
    const seasonNumber = repository.gameState().seasonNumber;
    const open = repository.openSpell();
    if (open) {
      repository.closeSpell(open.id, seasonNumber, 'left');
    }

    const worldCup = repository.findSeasonOf(WORLD_CUP_COMPETITION_ID, seasonNumber);
    repository.insertSpell({
      id: randomUUID(),
      teamId,
      startSeason: worldCup?.stage === 'finished' ? seasonNumber + 1 : seasonNumber,
      endSeason: null,
      endReason: null
    });
  }

  /** Deja la selección por voluntad propia. */
  leaveTeam(): boolean {
    const repository = new NationalRepository(this.resolveDb());
    const open = repository.openSpell();
    if (!open) {
      return false;
    }
    repository.closeSpell(open.id, repository.gameState().seasonNumber, 'left');
    return true;
  }

  /** Las etapas del usuario como seleccionador, con sus títulos. */
  spells(): {
    teamId: string;
    teamName: string;
    startSeason: number;
    endSeason: number | null;
    endReason: string | null;
    titles: number;
  }[] {
    const repository = new NationalRepository(this.resolveDb());
    const names = repository.teamNames();
    const champions = repository.seasonsOf(WORLD_CUP_COMPETITION_ID);

    return repository.spells().map((spell) => ({
      teamId: spell.teamId,
      teamName: names.get(spell.teamId) ?? spell.teamId,
      startSeason: spell.startSeason,
      endSeason: spell.endSeason,
      endReason: spell.endReason,
      titles: champions.filter(
        (row) =>
          row.championTeamId === spell.teamId &&
          row.seasonNumber >= spell.startSeason &&
          row.seasonNumber <= (spell.endSeason ?? Infinity)
      ).length
    }));
  }

  // --- Por dentro -------------------------------------------------------------

  private ensureCompetitions(repository: NationalRepository): void {
    const existing = new Set(repository.listCompetitions().map((row) => row.id));
    // El reglamento sigue al del resto de la partida: si Ajustes lo puso todo
    // en NBA, las selecciones también.
    const leagues = repository.listCompetitions().filter((row) => row.format === 'league');
    const rulesetId =
      leagues.length > 0 && leagues.every((row) => row.rulesetId === 'nba') ? 'nba' : 'fiba';

    const rows: CompetitionRow[] = [
      competition(NATIONAL_TEAMS_COMPETITION_ID, 'Selecciones', 'SEL', 'national', rulesetId),
      competition(
        QUALIFIERS_COMPETITION_ID,
        'Clasificación para el Mundial',
        'CLM',
        'national-qualifiers',
        rulesetId
      ),
      competition(WORLD_CUP_COMPETITION_ID, 'Mundial', 'MUN', 'national-tournament', rulesetId)
    ];
    for (const row of rows) {
      if (!existing.has(row.id)) {
        repository.insertCompetition(row);
      }
    }
  }

  /**
   * Crea las selecciones que falten y les pone la reputación del curso.
   * Devuelve las que tienen jugadores suficientes, de la más fuerte a la más
   * floja.
   */
  private refreshTeams(repository: NationalRepository): { teamId: string; strength: number }[] {
    const today = repository.gameState().currentDate;
    const byNationality = new Map<string, number[]>();
    for (const row of repository.seniorPlayers()) {
      const overalls = byNationality.get(row.nationality) ?? [];
      overalls.push(toPlayerSummary(row, today).overall);
      byNationality.set(row.nationality, overalls);
    }

    const existing = new Set(repository.nationalTeams().map((row) => row.id));
    const ranked: { teamId: string; strength: number }[] = [];

    for (const [code, overalls] of byNationality) {
      if (overalls.length < MIN_NATIONAL_POOL) {
        continue;
      }
      const teamId = nationalTeamId(code);
      const strength = nationStrength(overalls);
      const reputation = nationReputation(strength);
      if (existing.has(teamId)) {
        repository.setReputation(teamId, reputation);
      } else {
        repository.insertTeam({
          id: teamId,
          name: nationName(code),
          shortName: code,
          city: nationName(code),
          country: code,
          competitionId: NATIONAL_TEAMS_COMPETITION_ID,
          crest: null,
          pavilionName: `Pabellón Nacional de ${nationName(code)}`,
          pavilionCapacity: 15000,
          reputation,
          budgetCents: 0,
          seasonTicketHolders: 0,
          youthLevel: 0,
          nationalOf: code
        });
      }
      ranked.push({ teamId, strength });
    }

    return ranked.sort((a, b) => b.strength - a.strength || a.teamId.localeCompare(b.teamId));
  }

  private rankedNations(repository: NationalRepository): NationEntry[] {
    return repository
      .nationalTeams()
      .sort((a, b) => b.reputation - a.reputation || a.id.localeCompare(b.id))
      .map((team, index) => ({
        code: team.nationalOf as string,
        teamId: team.id,
        name: team.name,
        rank: index + 1,
        reputation: team.reputation
      }));
  }

  /** El anfitrión del Mundial del curso: la selección que no está en ningún grupo. */
  private hostOf(repository: NationalRepository, qualifiers: SeasonRow): string | null {
    const grouped = new Set(repository.groupsOf(qualifiers.id).map((row) => row.teamId));
    const host = hostFor(
      repository.nationalTeams().map((row) => row.id),
      qualifiers.seasonNumber
    );
    return host && !grouped.has(host) ? host : null;
  }

  /** Da la lista de cada selección al llegar el día de cada ventana. */
  private ensureCallups(repository: NationalRepository, qualifiers: SeasonRow, today: Date): void {
    for (const window of NATIONAL_WINDOWS) {
      if (today.getTime() < callupDate(qualifiers.startYear, window).getTime()) {
        continue;
      }
      if (repository.callups(qualifiers.seasonNumber, window).length > 0) {
        continue;
      }
      this.callUpWindow(repository, qualifiers, window, today);
    }
  }

  private callUpWindow(
    repository: NationalRepository,
    qualifiers: SeasonRow,
    window: NationalWindow,
    today: Date
  ): void {
    const participants = new Set(repository.groupsOf(qualifiers.id).map((row) => row.teamId));
    const host = this.hostOf(repository, qualifiers);
    if (window === 'summer' && host) {
      participants.add(host);
    }
    if (participants.size === 0) {
      return;
    }

    const clubs = repository.clubLeagues();
    const continental = repository.continentalClubIds(qualifiers.seasonNumber);
    const firstGame =
      window === 'summer'
        ? qualifierDate(qualifiers.startYear, 5)
        : qualifierDate(qualifiers.startYear, window === 'november' ? 1 : 3);
    const daysToGame = Math.max(0, Math.round((firstGame.getTime() - today.getTime()) / DAY_MS));

    const byNationality = new Map<string, PlayerRow[]>();
    for (const row of repository.seniorPlayers()) {
      const list = byNationality.get(row.nationality) ?? [];
      list.push(row);
      byNationality.set(row.nationality, list);
    }

    for (const team of repository.nationalTeams()) {
      if (!participants.has(team.id)) {
        continue;
      }
      const pool = byNationality.get(team.nationalOf as string) ?? [];
      const toCandidate = (row: PlayerRow): SquadCandidate => {
        const summary = toPlayerSummary(row, today);
        return { id: row.id, position: summary.position, overall: summary.overall };
      };
      const released = pool.filter((row) => {
        const club = row.teamId ? clubs.get(row.teamId) : undefined;
        return releasedForWindow(window, {
          leagueCountry: club?.country ?? null,
          playsContinental: row.teamId ? continental.has(row.teamId) : false
        });
      });
      const fit = (rows: PlayerRow[]) => rows.filter((row) => row.injuryDaysLeft <= daysToGame);

      // Primero, los que el club suelta y llegan sanos. Si no llegan a una
      // lista corta —un país con todo en Europa—, se tira de los demás: una
      // selección no deja de presentarse.
      let squad = pickSquad(fit(released).map(toCandidate));
      if (squad.length < MIN_CALLUP) {
        squad = pickSquad(fit(pool).map(toCandidate));
      }
      if (squad.length < MIN_CALLUP) {
        squad = pickSquad(pool.map(toCandidate));
      }

      repository.replaceCallups(team.id, qualifiers.seasonNumber, window, squad);
      this.rebuildRotation(
        repository,
        team.id,
        pool.filter((row) => squad.includes(row.id))
      );
    }
  }

  /** La rotación automática de una selección, con sus convocados. */
  private rebuildRotation(
    repository: NationalRepository,
    teamId: string,
    players: readonly PlayerRow[]
  ): void {
    const today = repository.gameState().currentDate;
    const entries = buildAutomaticRotation(
      players.map((row) => {
        const summary = toPlayerSummary(row, today);
        return {
          id: row.id,
          position: summary.position,
          secondaryPosition: summary.secondaryPosition,
          attributes: summary.attributes
        };
      })
    );
    repository.replaceRotation(
      teamId,
      entries.map((entry) => ({
        id: `${teamId}-rot-${entry.depth}`,
        teamId,
        playerId: entry.playerId,
        depth: entry.depth,
        slotPosition: entry.slotPosition,
        targetMinutes: entry.targetMinutes
      }))
    );
  }

  private advanceQualifiers(repository: NationalRepository, qualifiers: SeasonRow): void {
    if (qualifiers.stage === 'finished') {
      return;
    }
    const games = repository.listGames(qualifiers.id);
    if (games.length === 0 || !games.every(isPlayed)) {
      return;
    }

    repository.setStage(qualifiers.id, 'finished');

    const standings = this.groupStandings(repository, qualifiers, games).map((group) =>
      group.rows.map((row) => row.teamId)
    );
    const host = this.hostOf(repository, qualifiers);
    const reputations = new Map(repository.nationalTeams().map((row) => [row.id, row.reputation]));
    const entrants = worldCupEntrants(host, standings).sort(
      (a, b) => (reputations.get(b) ?? 0) - (reputations.get(a) ?? 0) || a.localeCompare(b)
    );
    this.createWorldCup(repository, qualifiers, host, entrants);
  }

  private createWorldCup(
    repository: NationalRepository,
    qualifiers: SeasonRow,
    host: string | null,
    rankedEntrants: readonly string[]
  ): void {
    const worldCup: SeasonRow = {
      id: randomUUID(),
      competitionId: WORLD_CUP_COMPETITION_ID,
      seasonNumber: qualifiers.seasonNumber,
      startYear: qualifiers.startYear,
      currentRound: 1,
      stage: 'regular',
      championTeamId: null
    };
    repository.insertSeason(worldCup);

    const groups = drawWorldCupGroups(
      rankedEntrants,
      createRng(seedFromString(`mundial-${qualifiers.seasonNumber}`))
    );
    repository.insertGroups(
      groups.flatMap((teamIds, index) =>
        teamIds.map((teamId, pot) => ({
          id: `${worldCup.id}-${groupName(index)}-${teamId}`,
          seasonId: worldCup.id,
          groupName: groupName(index),
          teamId,
          pot: pot + 1
        }))
      )
    );
    repository.insertGames(
      groups.flatMap((teamIds) =>
        generateSingleRoundRobin(teamIds).flatMap((pairings, index) =>
          pairings.map((pairing) =>
            worldCupGame(
              worldCup,
              index + 1,
              pairing.homeTeamId,
              pairing.awayTeamId,
              host,
              randomUUID()
            )
          )
        )
      )
    );
  }

  private advanceWorldCup(repository: NationalRepository, worldCup: SeasonRow): void {
    if (worldCup.stage === 'finished') {
      return;
    }
    const games = repository.listGames(worldCup.id);
    const groupGames = games.filter((game) => game.round < WORLD_CUP_QUARTERFINAL);
    if (groupGames.length === 0 || !groupGames.every(isPlayed)) {
      return;
    }

    const qualifiers = repository.findSeasonOf(QUALIFIERS_COMPETITION_ID, worldCup.seasonNumber);
    const host = qualifiers ? this.hostOf(repository, qualifiers) : null;
    const knockout = games.filter((game) => game.round >= WORLD_CUP_QUARTERFINAL);

    if (knockout.length === 0) {
      const standings = this.groupStandings(repository, worldCup, groupGames).map((group) =>
        group.rows.map((row) => row.teamId)
      );
      repository.insertGames(
        worldCupQuarterfinals(standings).map((pairing, index) =>
          worldCupGame(
            worldCup,
            WORLD_CUP_QUARTERFINAL,
            pairing.higherSeedTeamId,
            pairing.lowerSeedTeamId,
            host,
            `${worldCup.id}-k${WORLD_CUP_QUARTERFINAL}-${index}`
          )
        )
      );
      repository.setStage(worldCup.id, 'playoffs');
      return;
    }

    const round = knockout.reduce((max, game) => Math.max(max, game.round), WORLD_CUP_QUARTERFINAL);
    const inRound = knockout
      .filter((game) => game.round === round)
      .sort((a, b) => a.id.localeCompare(b.id));
    if (!inRound.every(isPlayed)) {
      return;
    }

    const winners = inRound.map(winnerOf);
    if (round >= WORLD_CUP_FINAL) {
      const champion = winners[0];
      if (champion) {
        repository.setChampion(worldCup.id, champion);
      }
      repository.setStage(worldCup.id, 'finished');
      this.federationReview(repository, worldCup.seasonNumber);
      return;
    }

    const next: NewGameRow[] = [];
    for (let index = 0; index + 1 < winners.length; index += 2) {
      next.push(
        worldCupGame(
          worldCup,
          round + 1,
          winners[index] as string,
          winners[index + 1] as string,
          host,
          `${worldCup.id}-k${round + 1}-${index / 2}`
        )
      );
    }
    repository.insertGames(next);
  }

  /**
   * Lo que decide la federación del usuario al acabar el Mundial. Con el
   * despido apagado en la partida, opina pero no echa.
   */
  private federationReview(repository: NationalRepository, seasonNumber: number): void {
    const spell = repository.openSpell();
    const state = repository.gameState();
    if (!spell || spell.startSeason > seasonNumber || !state.dismissalEnabled) {
      return;
    }
    const nation = this.rankedNations(repository).find((row) => row.teamId === spell.teamId);
    const outcome = this.outcomeOf(repository, seasonNumber, spell.teamId);
    if (!nation || !outcome) {
      return;
    }
    if (federationVerdict(objectiveForRank(nation.rank), outcome) === 'dismissed') {
      repository.closeSpell(spell.id, seasonNumber, 'dismissed');
    }
  }

  /** Hasta dónde llegó una selección en un curso; `null` mientras no se sepa. */
  private outcomeOf(
    repository: NationalRepository,
    seasonNumber: number,
    teamId: string
  ): NationalOutcome | null {
    const qualifiers = repository.findSeasonOf(QUALIFIERS_COMPETITION_ID, seasonNumber);
    const worldCup = repository.findSeasonOf(WORLD_CUP_COMPETITION_ID, seasonNumber);
    if (!qualifiers || qualifiers.stage !== 'finished') {
      return null;
    }
    if (!worldCup) {
      return 'notQualified';
    }
    const inWorldCup = repository.groupsOf(worldCup.id).some((row) => row.teamId === teamId);
    if (!inWorldCup) {
      return 'notQualified';
    }
    if (worldCup.stage !== 'finished') {
      return null;
    }
    const lastRound = repository
      .listGames(worldCup.id)
      .filter((game) => involves(game, teamId) && isPlayed(game))
      .reduce<number | null>((max, game) => Math.max(max ?? 0, game.round), null);
    return outcomeFor(lastRound, worldCup.championTeamId === teamId);
  }

  /**
   * El curso cuyo verano ha abierto el mercado de seleccionadores: el que
   * acaba de terminar su Mundial, hasta que llega la lista de noviembre del
   * siguiente.
   */
  private marketSeason(
    repository: NationalRepository,
    seasonNumber: number,
    today: Date
  ): number | null {
    if (repository.findSeasonOf(WORLD_CUP_COMPETITION_ID, seasonNumber)?.stage === 'finished') {
      return seasonNumber;
    }
    const previous = repository.findSeasonOf(WORLD_CUP_COMPETITION_ID, seasonNumber - 1);
    if (previous?.stage !== 'finished') {
      return null;
    }
    const qualifiers = repository.findSeasonOf(QUALIFIERS_COMPETITION_ID, seasonNumber);
    if (qualifiers && today.getTime() >= callupDate(qualifiers.startYear, 'november').getTime()) {
      return null;
    }
    return seasonNumber - 1;
  }

  /** La clasificación de cada grupo, en orden de grupo. */
  private groupStandings(
    repository: NationalRepository,
    season: SeasonRow,
    games: readonly GameRow[]
  ): { name: string; rows: ReturnType<typeof computeStandings> }[] {
    const groups = new Map<string, string[]>();
    for (const row of repository.groupsOf(season.id)) {
      const members = groups.get(row.groupName) ?? [];
      members.push(row.teamId);
      groups.set(row.groupName, members);
    }

    return [...groups.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([name, teamIds]) => {
        const members = new Set(teamIds);
        const played = games
          .filter(
            (game) => isPlayed(game) && members.has(game.homeTeamId) && members.has(game.awayTeamId)
          )
          .map((game) => ({
            homeTeamId: game.homeTeamId,
            awayTeamId: game.awayTeamId,
            homeScore: game.homeScore as number,
            awayScore: game.awayScore as number
          }));
        return { name, rows: computeStandings([...teamIds].sort(), played) };
      });
  }

  private competitionView(
    repository: NationalRepository,
    season: SeasonRow,
    userTeamId: string | null
  ): NationalCompetitionView {
    const names = repository.teamNames();
    const games = repository.listGames(season.id);
    const isQualifiers = season.competitionId === QUALIFIERS_COMPETITION_ID;
    const qualifiers = isQualifiers
      ? season
      : repository.findSeasonOf(QUALIFIERS_COMPETITION_ID, season.seasonNumber);
    const host = qualifiers ? this.hostOf(repository, qualifiers) : null;
    const groupGames = games.filter((game) => isQualifiers || game.round < WORLD_CUP_QUARTERFINAL);
    // En la clasificación pasan los tres primeros; en el Mundial, los dos.
    const passing = isQualifiers ? 3 : 2;

    const groups = repository.groupsOf(season.id);
    const standings = this.groupStandings(repository, season, groupGames);

    return {
      competitionId: season.competitionId,
      name: repository.findCompetition(season.competitionId)?.name ?? season.competitionId,
      seasonNumber: season.seasonNumber,
      stage: season.stage as NationalCompetitionView['stage'],
      hostName: host ? (names.get(host) ?? host) : null,
      groups: standings.map((group) => {
        const members = new Set(
          groups.filter((row) => row.groupName === group.name).map((row) => row.teamId)
        );
        return {
          name: `Grupo ${group.name}`,
          standings: group.rows.map((row): StandingEntry => ({
            ...row,
            teamName: names.get(row.teamId) ?? row.teamId,
            isManaged: row.teamId === userTeamId,
            zone: row.position <= passing ? 'playoffs' : null
          })),
          fixtures: toFixtures(
            groupGames.filter((game) => members.has(game.homeTeamId)),
            names,
            userTeamId
          )
        };
      }),
      knockout: [WORLD_CUP_QUARTERFINAL, WORLD_CUP_QUARTERFINAL + 1, WORLD_CUP_FINAL]
        .map((round) => ({
          round,
          name: worldCupRoundName(round),
          games: toFixtures(
            games
              .filter((game) => !isQualifiers && game.round === round)
              .sort((a, b) => a.id.localeCompare(b.id)),
            names,
            userTeamId
          )
        }))
        .filter((round) => round.games.length > 0),
      championTeamName: season.championTeamId
        ? (names.get(season.championTeamId) ?? season.championTeamId)
        : null
    };
  }

  private myTeam(
    repository: NationalRepository,
    teamId: string,
    seasonNumber: number
  ): MyNationalTeam | null {
    const team = repository.findTeam(teamId);
    const nation = this.rankedNations(repository).find((row) => row.teamId === teamId);
    if (!team?.nationalOf || !nation) {
      return null;
    }
    const objective = objectiveForRank(nation.rank);
    const outcome = this.outcomeOf(repository, seasonNumber, teamId);
    const worldCup = repository.findSeasonOf(WORLD_CUP_COMPETITION_ID, seasonNumber);
    const names = repository.teamNames();
    const next = this.seasonIds(seasonNumber)
      .flatMap((seasonId) => repository.listGames(seasonId))
      .filter((game) => !isPlayed(game) && involves(game, teamId))
      .sort((a, b) => a.scheduledOn.getTime() - b.scheduledOn.getTime())[0];

    return {
      teamId,
      code: team.nationalOf,
      name: team.name,
      rank: nation.rank,
      objectiveLabel: NATIONAL_OBJECTIVE_LABELS[objective],
      outcomeLabel: outcome ? NATIONAL_OUTCOME_LABELS[outcome] : null,
      verdictLabel:
        outcome && (worldCup?.stage === 'finished' || outcome === 'notQualified')
          ? FEDERATION_VERDICT_LABELS[federationVerdict(objective, outcome)]
          : null,
      nextGame: next ? (toFixtures([next], names, teamId)[0] ?? null) : null
    };
  }

  /** Si la lista de la ventana se puede cambiar todavía. */
  private callupStatus(
    repository: NationalRepository,
    qualifiers: SeasonRow,
    teamId: string,
    window: NationalWindow,
    today: Date,
    selected: number
  ): { editable: boolean; reason: string | null } {
    if (selected === 0) {
      const date = callupDate(qualifiers.startYear, window);
      return today.getTime() < date.getTime()
        ? { editable: false, reason: `La lista de esta ventana se da el ${formatDay(date)}` }
        : { editable: false, reason: 'Tu selección no juega en esta ventana' };
    }

    const next = this.seasonIds(qualifiers.seasonNumber)
      .flatMap((seasonId) => repository.listGames(seasonId))
      .filter((game) => !isPlayed(game) && involves(game, teamId))
      .filter((game) => gameWindow(game, qualifiers) === window)
      .sort((a, b) => a.scheduledOn.getTime() - b.scheduledOn.getTime())[0];
    if (!next) {
      return { editable: false, reason: 'No quedan partidos en esta ventana' };
    }
    if (sameDay(next.scheduledOn, today) || next.scheduledOn.getTime() < today.getTime()) {
      return { editable: false, reason: 'Hoy hay partido: la lista ya está dada' };
    }
    return { editable: true, reason: null };
  }
}

function competition(
  id: string,
  name: string,
  shortName: string,
  format: string,
  rulesetId: string
): CompetitionRow {
  return {
    id,
    name,
    shortName,
    country: 'FIBA',
    continent: 'WORLD',
    rulesetId,
    tier: 1,
    format,
    playoffTeams: 0,
    playoffSeriesLength: 1
  };
}

/** Un partido del Mundial: en sede neutral, salvo los del anfitrión, que juega en casa. */
function worldCupGame(
  worldCup: SeasonRow,
  round: number,
  first: string,
  second: string,
  host: string | null,
  id: string
): NewGameRow {
  const hostPlays = host !== null && (first === host || second === host);
  const [home, away] = hostPlays && second === host ? [second, first] : [first, second];
  return {
    id,
    seasonId: worldCup.id,
    round,
    scheduledOn: worldCupDate(worldCup.startYear, round),
    homeTeamId: home,
    awayTeamId: away,
    neutralVenue: !hostPlays
  };
}

/** La ventana a la que pertenece un partido de selecciones. */
function gameWindow(game: GameRow, qualifiers: SeasonRow): NationalWindow {
  return game.seasonId === qualifiers.id ? windowOfMatchday(game.round) : 'summer';
}

/** La próxima ventana con partidos, para el panel. */
function nextWindow(startYear: number, today: Date): NationalWindowInfo | null {
  for (const window of NATIONAL_WINDOWS) {
    const firstGame = qualifierDate(
      startYear,
      window === 'november' ? 1 : window === 'february' ? 3 : 5
    );
    if (firstGame.getTime() >= today.getTime()) {
      return {
        label: NATIONAL_WINDOW_LABELS[window],
        callupDate: callupDate(startYear, window).getTime(),
        firstGameDate: firstGame.getTime()
      };
    }
  }
  return null;
}

function toFixtures(
  games: readonly GameRow[],
  names: ReadonlyMap<string, string>,
  userTeamId: string | null
): FixtureEntry[] {
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
    involvesManaged: involves(game, userTeamId),
    seriesId: game.seriesId,
    seriesGame: game.seriesGame
  }));
}

function winnerOf(game: GameRow): string {
  return (game.homeScore as number) > (game.awayScore as number)
    ? game.homeTeamId
    : game.awayTeamId;
}

function involves(game: GameRow, teamId: string | null): boolean {
  return teamId !== null && (game.homeTeamId === teamId || game.awayTeamId === teamId);
}

function isPlayed(game: GameRow): boolean {
  return game.homeScore !== null && game.awayScore !== null;
}

function sameDay(a: Date, b: Date): boolean {
  return Math.floor(a.getTime() / DAY_MS) === Math.floor(b.getTime() / DAY_MS);
}

function formatDay(date: Date): string {
  return date.toLocaleDateString('es-ES', { day: 'numeric', month: 'long', timeZone: 'UTC' });
}
