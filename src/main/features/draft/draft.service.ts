import { randomUUID } from 'node:crypto';
import type { DraftPickView, DraftProspectView, DraftView } from '@shared/contracts/draft.contract';
import { marketValueCents } from '@shared/domain/market';
import {
  DRAFT_CLASS_SIZE,
  DRAFT_ROUNDS,
  draftOrder,
  generateDraftProspect,
  overallPick,
  rookieContractYears,
  rookieWageCents,
  salaryCapCents
} from '@shared/domain/nba';
import { randomName } from '@shared/domain/names';
import { MAX_ROSTER } from '@shared/domain/youth';
import { computeStandings } from '@shared/domain/standings';
import { createRng, seedFromString } from '@shared/engine/basketball/rng';
import type { SaveDatabase } from '../../database/save-database';
import type {
  CompetitionRow,
  DraftPickRow,
  NewPlayerRow,
  PlayerRow,
  SeasonRow
} from '../../database/schema/save';
import { CareerRepository } from '../career/career.repository';
import { MarketRepository } from '../market/market.repository';
import { toPlayerSummary } from '../players/players.mapper';
import { scoutPlayer, scoutingErrorFor } from '../players/scouting';
import { SeasonRepository } from '../season/season.repository';
import { StaffService } from '../staff/staff.service';
import { DraftRepository } from './draft.repository';

export class NotYourPickError extends Error {
  constructor() {
    super('No te toca elegir');
    this.name = 'NotYourPickError';
  }
}

export class ProspectNotAvailableError extends Error {
  constructor() {
    super('Ese jugador no está disponible en el draft');
    this.name = 'ProspectNotAvailableError';
  }
}

export class RosterFullForDraftError extends Error {
  constructor() {
    super(
      `La plantilla ya tiene ${MAX_ROSTER} jugadores: libera a alguien o renuncia a la elección`
    );
    this.name = 'RosterFullForDraftError';
  }
}

/**
 * El draft de la liga de formato NBA.
 *
 * Se prepara solo al acabar la temporada de esa liga —la clase de prospectos y
 * el orden con su lotería— y se va resolviendo elección a elección. Todo queda
 * escrito en `draft_picks`, así que se puede dejar a medias con el usuario en el
 * reloj y volver otro día. Lo que no se haya elegido al cambiar de temporada lo
 * elige la IA.
 */
export class DraftService {
  /** Ver el porqué del resolutor en `SeasonService`. */
  constructor(private readonly resolveDb: () => SaveDatabase) {}

  /** Prepara el draft de las ligas NBA cuya temporada ya ha acabado. */
  ensure(): void {
    const db = this.resolveDb();
    const repository = new DraftRepository(db);
    const seasons = new SeasonRepository(db);
    const seasonNumber = seasons.gameState().seasonNumber;
    const active = new Set(seasons.activeCountries());

    for (const competition of repository.nbaCompetitions()) {
      if (!active.has(competition.country)) {
        continue;
      }
      const season = seasons.findSeason(competition.id, seasonNumber);
      if (season?.stage !== 'finished') {
        continue;
      }
      if (repository.picks(competition.id, seasonNumber).length > 0) {
        continue;
      }
      this.prepare(repository, seasons, competition, season);
    }
  }

  get(): DraftView | null {
    const db = this.resolveDb();
    this.ensure();
    const competition = this.activeCompetition();
    if (!competition) {
      return null;
    }
    const seasons = new SeasonRepository(db);
    const seasonNumber = seasons.gameState().seasonNumber;
    const repository = new DraftRepository(db);
    const current = repository.picks(competition.id, seasonNumber);
    // Mientras no acaba la temporada se enseña el draft anterior, si lo hubo.
    const shownSeason = current.length > 0 ? seasonNumber : seasonNumber - 1;
    const picks = current.length > 0 ? current : repository.picks(competition.id, shownSeason);
    return this.toView(
      competition,
      current.length > 0 ? seasonNumber : shownSeason,
      picks,
      current.length === 0
    );
  }

  /** La IA elige hasta que le toque al usuario o se acabe el draft. */
  simulateToUser(): DraftView | null {
    this.runPicks({ stopAtUser: true });
    return this.get();
  }

  /** Termina el draft entero, también las elecciones del usuario. */
  simulateAll(): DraftView | null {
    this.runPicks({ stopAtUser: false });
    return this.get();
  }

  pick(playerId: string): DraftView | null {
    const db = this.resolveDb();
    const repository = new DraftRepository(db);
    const next = this.nextPick();
    const userTeamId = this.userTeamId();
    if (!next || next.pick.teamId !== userTeamId) {
      throw new NotYourPickError();
    }
    const player = repository.findPlayer(playerId);
    if (!player || player.teamId || player.draftClass !== next.pick.seasonNumber) {
      throw new ProspectNotAvailableError();
    }
    if (new MarketRepository(db).countRoster(next.pick.teamId) >= MAX_ROSTER) {
      throw new RosterFullForDraftError();
    }
    this.sign(next.competition, next.season, next.pick, player);
    return this.get();
  }

  pass(): DraftView | null {
    const next = this.nextPick();
    if (!next || next.pick.teamId !== this.userTeamId()) {
      throw new NotYourPickError();
    }
    new DraftRepository(this.resolveDb()).resolvePick(next.pick.id, null, true);
    return this.get();
  }

  /**
   * Lo que haya quedado sin elegir al cambiar de temporada: lo elige la IA, y
   * los prospectos que nadie quiso pasan a ser agentes libres.
   */
  complete(seasonNumber: number): void {
    this.ensure();
    this.runPicks({ stopAtUser: false });
    new DraftRepository(this.resolveDb()).closeClass(seasonNumber);
  }

  // --------------------------------------------------------------------------

  private activeCompetition(): CompetitionRow | null {
    const db = this.resolveDb();
    const active = new Set(new SeasonRepository(db).activeCountries());
    return new DraftRepository(db).nbaCompetitions().find((row) => active.has(row.country)) ?? null;
  }

  /** El club del usuario, si tiene banquillo. */
  private userTeamId(): string | null {
    const db = this.resolveDb();
    const managed = new SeasonRepository(db).gameState().managedTeamId;
    if (!managed || new CareerRepository(db).isUnemployed()) {
      return null;
    }
    return managed;
  }

  private prepare(
    repository: DraftRepository,
    seasons: SeasonRepository,
    competition: CompetitionRow,
    season: SeasonRow
  ): void {
    const rng = createRng(seedFromString(`draft-${season.id}`));

    // La clase: prospectos sin equipo marcados con la temporada del draft.
    const rows: NewPlayerRow[] = Array.from({ length: DRAFT_CLASS_SIZE }, (_, index) =>
      prospectRow(generateDraftProspect(index + 1, rng), rng, season)
    );
    repository.insertPlayers(rows);

    // El orden: los de fuera de playoffs a la lotería, del peor al mejor.
    const teamIds = seasons.teamIdsInCompetition(competition.id);
    const standings = computeStandings(
      teamIds,
      seasons
        .listRegularGames(season.id)
        .filter((game) => game.homeScore !== null && game.awayScore !== null)
        .map((game) => ({
          homeTeamId: game.homeTeamId,
          awayTeamId: game.awayTeamId,
          homeScore: game.homeScore as number,
          awayScore: game.awayScore as number
        }))
    );
    const worstFirst = [...standings].reverse().map((row) => row.teamId);
    const inPlayoffs = new Set(
      seasons
        .listPlayoffGames(season.id)
        .filter((game) => game.round >= 1)
        .flatMap((game) => [game.homeTeamId, game.awayTeamId])
    );
    const order = draftOrder(
      worstFirst.filter((teamId) => !inPlayoffs.has(teamId)),
      worstFirst.filter((teamId) => inPlayoffs.has(teamId)),
      rng
    );

    const picks: DraftPickRow[] = [];
    [order.firstRound, order.secondRound].slice(0, DRAFT_ROUNDS).forEach((round, roundIndex) => {
      round.forEach((teamId, index) => {
        const pick = overallPick(roundIndex + 1, index + 1, teamIds.length);
        picks.push({
          id: `${season.id}-draft-${pick}`,
          competitionId: competition.id,
          seasonNumber: season.seasonNumber,
          round: roundIndex + 1,
          pick,
          teamId,
          playerId: null,
          lotteryWinner: roundIndex === 0 && order.lotteryWinners.includes(teamId),
          passed: false
        });
      });
    });
    repository.insertPicks(picks);
  }

  /** La siguiente elección sin resolver del draft abierto. */
  private nextPick(): {
    competition: CompetitionRow;
    season: SeasonRow;
    pick: DraftPickRow;
  } | null {
    const db = this.resolveDb();
    const competition = this.activeCompetition();
    if (!competition) {
      return null;
    }
    const seasons = new SeasonRepository(db);
    const seasonNumber = seasons.gameState().seasonNumber;
    const season = seasons.findSeason(competition.id, seasonNumber);
    const pick = new DraftRepository(db)
      .picks(competition.id, seasonNumber)
      .find((row) => !row.playerId && !row.passed);
    return season && pick ? { competition, season, pick } : null;
  }

  private runPicks(options: { stopAtUser: boolean }): void {
    const db = this.resolveDb();
    const userTeamId = this.userTeamId();

    for (let guard = 0; guard < 200; guard += 1) {
      const next = this.nextPick();
      if (!next) {
        return;
      }
      if (options.stopAtUser && next.pick.teamId === userTeamId) {
        return;
      }

      const repository = new DraftRepository(db);
      const prospects = repository.prospects(next.pick.seasonNumber);
      if (prospects.length === 0) {
        repository.resolvePick(next.pick.id, null, true);
        continue;
      }

      // La IA elige por lo que el jugador puede llegar a ser, con un poco de
      // criterio propio de cada club.
      const today = new SeasonRepository(db).gameState().currentDate;
      const noise = createRng(seedFromString(`${next.pick.id}-criterio`));
      const chosen = prospects
        .map((row) => {
          const summary = toPlayerSummary(row, today);
          return { row, score: row.potential * 0.65 + summary.overall * 0.35 + noise.int(-3, 3) };
        })
        .sort((a, b) => b.score - a.score || a.row.id.localeCompare(b.row.id))[0]!.row;

      const market = new MarketRepository(db);
      if (market.countRoster(next.pick.teamId) >= MAX_ROSTER) {
        if (next.pick.teamId === userTeamId) {
          // Al usuario no se le echa a nadie: con la plantilla llena, se renuncia.
          repository.resolvePick(next.pick.id, null, true);
          continue;
        }
        const weakest = market
          .listRoster(next.pick.teamId)
          .map((row) => ({ row, overall: toPlayerSummary(row, today).overall }))
          .sort((a, b) => a.overall - b.overall)[0];
        if (weakest) {
          market.release(weakest.row.id);
        }
      }
      this.sign(next.competition, next.season, next.pick, chosen);
    }
  }

  /** Firma al elegido con su contrato de novato. */
  private sign(
    competition: CompetitionRow,
    season: SeasonRow,
    pick: DraftPickRow,
    player: PlayerRow
  ): void {
    const db = this.resolveDb();
    const market = new MarketRepository(db);
    const repository = new DraftRepository(db);
    const today = new SeasonRepository(db).gameState().currentDate;
    const summary = toPlayerSummary(player, today);
    const cap = this.salaryCap(competition.id);

    market.transfer({
      playerId: player.id,
      fromTeamId: null,
      toTeamId: pick.teamId,
      feeCents: 0,
      wageCents: rookieWageCents(pick.pick, cap),
      contractUntil: new Date(
        Date.UTC(season.startYear + 1 + rookieContractYears(pick.pick), 5, 30)
      ),
      valueCents: marketValueCents({
        overall: summary.overall,
        potential: player.potential,
        age: summary.age
      })
    });
    repository.clearDraftClass(player.id);
    repository.resolvePick(pick.id, player.id, false);
  }

  /** El tope de la liga: la nómina media de sus equipos. */
  private salaryCap(competitionId: string): number {
    const db = this.resolveDb();
    const seasons = new SeasonRepository(db);
    const market = new MarketRepository(db);
    const teamIds = seasons.teamIdsInCompetition(competitionId);
    const total = teamIds.reduce((sum, teamId) => sum + market.seasonWagesCents(teamId), 0);
    return salaryCapCents(teamIds.length > 0 ? total / teamIds.length : 0);
  }

  private toView(
    competition: CompetitionRow,
    seasonNumber: number,
    picks: readonly DraftPickRow[],
    waiting: boolean
  ): DraftView {
    const db = this.resolveDb();
    const seasons = new SeasonRepository(db);
    const names = seasons.teamNames();
    const userTeamId = this.userTeamId();
    const today = seasons.gameState().currentDate;
    const repository = new DraftRepository(db);

    const pickViews: DraftPickView[] = picks.map((row) => {
      const player = row.playerId ? repository.findPlayer(row.playerId) : null;
      return {
        pick: row.pick,
        round: row.round,
        teamId: row.teamId,
        teamName: names.get(row.teamId) ?? row.teamId,
        isUser: row.teamId === userTeamId,
        lotteryWinner: row.lotteryWinner,
        playerId: row.playerId,
        playerName: player ? `${player.firstName} ${player.lastName}` : null,
        nationality: player?.nationality ?? null,
        position: player ? (player.position as DraftPickView['position']) : null,
        passed: row.passed
      };
    });

    const onTheClock = waiting
      ? null
      : (pickViews.find((row) => !row.playerId && !row.passed) ?? null);
    const scout = userTeamId ? new StaffService(this.resolveDb).levels(userTeamId).scout : 1;
    const error = scoutingErrorFor(scout, false);

    const prospects: DraftProspectView[] = waiting
      ? []
      : repository
          .prospects(seasonNumber)
          .map((row) => {
            const summary = scoutPlayer(toPlayerSummary(row, today), error);
            return {
              playerId: row.id,
              name: `${row.firstName} ${row.lastName}`,
              nationality: row.nationality,
              position: summary.position,
              age: summary.age,
              heightCm: row.heightCm,
              overall: summary.overall,
              potential: summary.potential,
              uncertainty: summary.uncertainty
            };
          })
          .sort((a, b) => b.potential + b.overall - (a.potential + a.overall));

    return {
      competitionId: competition.id,
      competitionName: competition.name,
      seasonNumber,
      status: waiting ? 'waiting' : onTheClock ? 'open' : 'done',
      onTheClock,
      userOnTheClock: onTheClock?.isUser ?? false,
      userInLeague: userTeamId
        ? seasons.teamIdsInCompetition(competition.id).includes(userTeamId)
        : false,
      rosterFull: userTeamId
        ? new MarketRepository(db).countRoster(userTeamId) >= MAX_ROSTER
        : false,
      picks: pickViews,
      prospects
    };
  }
}

/** Un prospecto convertido en ficha, sin equipo y apuntado a su clase. */
function prospectRow(
  prospect: ReturnType<typeof generateDraftProspect>,
  rng: ReturnType<typeof createRng>,
  season: SeasonRow
): NewPlayerRow {
  const { firstName, lastName } = randomName(rng);
  const referenceYear = season.startYear + 1;
  return {
    id: randomUUID(),
    teamId: null,
    firstName,
    lastName,
    nationality: prospect.nationality,
    birthDate: new Date(Date.UTC(referenceYear - prospect.age, rng.int(0, 11), rng.int(1, 28))),
    position: prospect.position,
    secondaryPosition: prospect.secondaryPosition,
    heightCm: prospect.heightCm,
    weightKg: Math.round((prospect.heightCm - 100) * 0.9),
    wingspanCm: prospect.heightCm + rng.int(0, 10),
    photo: null,
    close: prospect.attributes.close,
    midRange: prospect.attributes.midRange,
    threePoint: prospect.attributes.threePoint,
    freeThrow: prospect.attributes.freeThrow,
    finishing: prospect.attributes.finishing,
    passing: prospect.attributes.passing,
    handling: prospect.attributes.handling,
    driving: prospect.attributes.driving,
    perimeterDefense: prospect.attributes.perimeterDefense,
    interiorDefense: prospect.attributes.interiorDefense,
    steal: prospect.attributes.steal,
    block: prospect.attributes.block,
    offensiveRebound: prospect.attributes.offensiveRebound,
    defensiveRebound: prospect.attributes.defensiveRebound,
    speed: prospect.attributes.speed,
    strength: prospect.attributes.strength,
    jumping: prospect.attributes.jumping,
    stamina: prospect.attributes.stamina,
    basketballIq: prospect.attributes.basketballIQ,
    consistency: prospect.attributes.consistency,
    aggression: prospect.attributes.aggression,
    potential: prospect.potential,
    condition: 100,
    morale: 70,
    injuryDaysLeft: 0,
    injuryName: null,
    trainingFocus: null,
    isYouth: false,
    wageCents: 0,
    contractUntil: null,
    valueCents: 0,
    draftClass: season.seasonNumber
  };
}
