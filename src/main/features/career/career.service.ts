import { randomUUID } from 'node:crypto';
import type { CareerOffer, CareerSpell, CareerStatus } from '@shared/contracts/career.contract';
import {
  BOARD_OBJECTIVE_LABELS,
  objectiveForReputation,
  type BoardObjective
} from '@shared/domain/board';
import {
  clubWouldHire,
  managerReputation,
  managerReputationLabel,
  offerCountFor,
  tempts,
  vacancyChance,
  type CareerSeasonRecord
} from '@shared/domain/career';
import { createRng, seedFromString } from '@shared/engine/basketball/rng';
import { computeStandings } from '@shared/domain/standings';
import type { SaveDatabase } from '../../database/save-database';
import type { CareerSpellRow } from '../../database/schema/save';
import { BoardService } from '../club/board.service';
import { HistoryRepository } from '../history/history.repository';
import { SeasonService } from '../season/season.service';
import { CareerRepository } from './career.repository';

export class NotInCareerModeError extends Error {
  constructor() {
    super('Esta partida no se juega en modo carrera');
    this.name = 'NotInCareerModeError';
  }
}

export class NotUnemployedError extends Error {
  constructor() {
    super('Tienes banquillo: no hay nada que esperar');
    this.name = 'NotUnemployedError';
  }
}

export class NotEmployedError extends Error {
  constructor() {
    super('No diriges a ningún club: no hay de qué dimitir');
    this.name = 'NotEmployedError';
  }
}

/** Días máximos que se deja correr el reloj en una espera, por si el mes no cambiara nunca. */
const MAX_WAIT_DAYS = 62;

export class OfferNotAvailableError extends Error {
  constructor(teamId: string) {
    super(`El club ${teamId} no te ha ofrecido nada`);
    this.name = 'OfferNotAvailableError';
  }
}

/**
 * La carrera del entrenador.
 *
 * En modo mánager el despido acaba la partida. En carrera te deja sin equipo, y
 * de lo que hayas hecho hasta entonces depende quién te llame: por eso este
 * servicio no guarda una «reputación» en ninguna columna, la calcula del
 * historial cada vez. La única cosa que sí se guarda son las **etapas** —qué
 * club dirigiste y entre qué años—, porque eso no se puede deducir de nada.
 *
 * El despido se recoge de forma perezosa, al preguntar por el estado: así el
 * consejo no tiene que saber que existe un modo carrera, y sigue decidiendo el
 * despido en un solo sitio.
 */
export class CareerService {
  /** Ver el porqué del resolutor en {@link SeasonService}. */
  constructor(private readonly resolveDb: () => SaveDatabase) {}

  getStatus(): CareerStatus {
    const db = this.resolveDb();
    const repository = new CareerRepository(db);
    const state = repository.gameState();

    if (!state.careerMode) {
      return apagada(state.managerName);
    }

    // Si el consejo le ha destituido, aquí es donde la carrera se entera y
    // cierra la etapa. Hacerlo al leer, y no al despedir, deja al consejo sin
    // saber nada de carreras.
    this.closeSpellIfDismissed(repository, state.seasonNumber);

    const open = repository.openSpell();
    const spells = this.describeSpells(repository);
    const records = this.seasonRecords(db, repository);
    const reputation = managerReputation(records);
    const titles = records.reduce((sum, record) => sum + record.titles, 0);

    return {
      careerMode: true,
      managerName: state.managerName,
      reputation,
      reputationLabel: managerReputationLabel(reputation),
      unemployed: open === null,
      currentTeamName: open ? (repository.findTeam(open.teamId)?.name ?? null) : null,
      spells,
      seasonsManaged: records.length,
      titles,
      offers: this.currentOffers(db, repository, reputation),
      offersWhileEmployed: open !== null,
      canResign: open !== null,
      canWait: open === null,
      currentDate: state.currentDate.getTime()
    };
  }

  /**
   * Deja el banquillo por su pie.
   *
   * No es un despido y no resta como tal: la etapa se cierra como «se marchó».
   * Lo que sí trae es quedarse sin equipo, con lo que haya abierto ese mes.
   */
  resign(): CareerStatus {
    const repository = new CareerRepository(this.resolveDb());
    const state = repository.gameState();
    if (!state.careerMode) {
      throw new NotInCareerModeError();
    }
    const open = repository.openSpell();
    if (!open) {
      throw new NotEmployedError();
    }

    repository.closeSpell(open.id, state.seasonNumber, 'left');
    return this.getStatus();
  }

  /**
   * Un mes en el paro.
   *
   * El reloj corre como espectador —todos los partidos los juega la IA, el
   * verano llega y la temporada siguiente arranca— hasta que cambia el mes, que
   * es cuando se abren otros banquillos. Esperar tiene sentido precisamente
   * porque lo que llega el mes que viene no es lo que hay hoy.
   */
  wait(): CareerStatus {
    const db = this.resolveDb();
    const repository = new CareerRepository(db);
    const state = repository.gameState();
    if (!state.careerMode) {
      throw new NotInCareerModeError();
    }
    this.closeSpellIfDismissed(repository, state.seasonNumber);
    if (repository.openSpell()) {
      throw new NotUnemployedError();
    }

    const season = new SeasonService(() => db);
    const startMonth = monthKey(state.currentDate);

    for (let day = 0; day < MAX_WAIT_DAYS; day += 1) {
      const result = season.advanceDay({ spectator: true });
      if (result.status === 'seasonOver') {
        // Con la temporada acabada, el verano: arranca la siguiente y con ella
        // cambia el mes, así que la espera termina ahí.
        season.startNextSeason({ spectator: true });
      }
      if (monthKey(repository.gameState().currentDate) !== startMonth) {
        break;
      }
    }

    return this.getStatus();
  }

  /**
   * Coge el banquillo que te ofrecen, y lo coges **tal y como está**: si es
   * enero, heredas lo que lleve hecho el equipo ese año. Es lo que hace un
   * entrenador que entra a mitad de temporada.
   */
  accept(teamId: string): CareerStatus {
    const db = this.resolveDb();
    const repository = new CareerRepository(db);
    const state = repository.gameState();

    if (!state.careerMode) {
      throw new NotInCareerModeError();
    }

    this.closeSpellIfDismissed(repository, state.seasonNumber);

    const records = this.seasonRecords(db, repository);
    const reputation = managerReputation(records);
    const offers = this.currentOffers(db, repository, reputation);
    if (!offers.some((offer) => offer.teamId === teamId)) {
      throw new OfferNotAvailableError(teamId);
    }

    // Teniendo equipo, aceptar es marcharse: la etapa se cierra por voluntad
    // propia antes de abrir la siguiente.
    const open = repository.openSpell();
    if (open) {
      repository.closeSpell(open.id, state.seasonNumber, 'left');
    }

    // El consejo del club nuevo arranca de cero: si este club ya te echó en su
    // día, su ficha seguiría marcada como destituido y nacería muerta.
    repository.clearBoard(teamId);
    repository.setManagedTeam(teamId);
    repository.insertSpell({
      id: randomUUID(),
      teamId,
      startSeason: state.seasonNumber,
      endSeason: null,
      endReason: null
    });

    // Y pone su objetivo, que sale de lo que es el club y de su categoría.
    const team = repository.findTeam(teamId);
    const competition = team ? repository.findCompetition(team.competitionId) : null;
    if (competition) {
      const teams = repository
        .clubsInCountry(competition.country)
        .filter((row) => row.competition.id === competition.id).length;
      new BoardService(() => db).ensureForSeason(state.seasonNumber, teams, competition.tier);
    }

    return this.getStatus();
  }

  // ------------------------------------------------------------------------

  /** Cierra la etapa en curso si el consejo del club ha destituido al entrenador. */
  private closeSpellIfDismissed(repository: CareerRepository, seasonNumber: number): void {
    const open = repository.openSpell();
    if (!open) {
      return;
    }
    if (new BoardService(this.resolveDb).isDismissed()) {
      repository.closeSpell(open.id, seasonNumber, 'dismissed');
    }
  }

  /** Las etapas con su nombre y los títulos que se ganaron en cada una. */
  private describeSpells(repository: CareerRepository): CareerSpell[] {
    const names = repository.teamNames();
    const champions = repository.champions();

    return repository.spells().map((spell) => ({
      teamId: spell.teamId,
      teamName: names.get(spell.teamId) ?? spell.teamId,
      startSeason: spell.startSeason,
      endSeason: spell.endSeason,
      endReason: spell.endReason,
      titles: champions.filter(
        (row) => row.championTeamId === spell.teamId && withinSpell(spell, row.seasonNumber)
      ).length
    }));
  }

  /**
   * Una ficha por temporada dirigida, que es lo que valora el dominio.
   *
   * Sin etapas guardadas —una partida de antes del modo carrera— se da por
   * hecho que siempre dirigió al club de hoy, que es justo lo que pasaba.
   */
  private seasonRecords(db: SaveDatabase, repository: CareerRepository): CareerSeasonRecord[] {
    const history = new HistoryRepository(db);
    const spells = repository.spells();
    const state = repository.gameState();
    const champions = repository.champions();
    const records: CareerSeasonRecord[] = [];

    for (const season of history.seasons()) {
      const competition = repository.findCompetition(season.competitionId);
      if (!competition || competition.format !== 'league') {
        continue;
      }

      const teamId = teamManagedIn(spells, season.seasonNumber, state.managedTeamId);
      if (!teamId) {
        continue;
      }
      const lastRound = history.lastRoundOf(season.id, teamId);
      if (lastRound === null) {
        continue;
      }

      const team = repository.findTeam(teamId);
      const standing = this.positionOf(history, season.id, teamId);
      const spell = spells.find(
        (row) => withinSpell(row, season.seasonNumber) && row.teamId === teamId
      );

      records.push({
        position: standing.position,
        teams: standing.teams,
        tier: competition.tier,
        clubReputation: team?.reputation ?? 50,
        titles: champions.filter(
          (row) => row.seasonNumber === season.seasonNumber && row.championTeamId === teamId
        ).length,
        dismissed: spell?.endReason === 'dismissed' && spell.endSeason === season.seasonNumber
      });
    }

    return records;
  }

  /** Puesto de un club en una temporada, recalculado de sus partidos. */
  private positionOf(
    history: HistoryRepository,
    seasonId: string,
    teamId: string
  ): { position: number | null; teams: number } {
    const teamIds = history.teamIdsInSeason(seasonId);
    const played = history.playedRegularGames(seasonId).map((game) => ({
      homeTeamId: game.homeTeamId,
      awayTeamId: game.awayTeamId,
      homeScore: game.homeScore as number,
      awayScore: game.awayScore as number
    }));

    if (played.length === 0) {
      return { position: null, teams: teamIds.length };
    }

    const standings = computeStandings(teamIds, played);
    return {
      position: standings.find((row) => row.teamId === teamId)?.position ?? null,
      teams: standings.length
    };
  }

  /**
   * Los clubes que te quieren.
   *
   * Salen de las ligas que se están jugando —las del país— porque son las
   * únicas que tienen calendario este año, y se ordenan por lo que son: primero
   * el club más grande que esté dispuesto, que es la oferta que de verdad
   * tienta. Nunca aparece el que acaba de echarte.
   */
  /**
   * Las ofertas que hay ahora mismo, según estés colocado o no.
   *
   * Sin banquillo, las de los clubes con el suyo abierto este mes. Con él,
   * ninguna durante la temporada —nadie se va a mitad de curso por un club
   * parecido— y, acabada, sólo las de clubes claramente más grandes.
   */
  private currentOffers(
    db: SaveDatabase,
    repository: CareerRepository,
    reputation: number
  ): CareerOffer[] {
    const state = repository.gameState();
    const open = repository.openSpell();

    if (!open) {
      return this.buildOffers(db, repository, reputation, {
        window: `${state.seasonNumber}:${monthKey(state.currentDate)}`,
        employedAt: null
      });
    }

    const team = repository.findTeam(open.teamId);
    const league = team ? repository.seasonOf(team.competitionId, state.seasonNumber) : null;
    if (!team || league?.stage !== 'finished') {
      return [];
    }
    return this.buildOffers(db, repository, reputation, {
      window: `${state.seasonNumber}:verano`,
      employedAt: team.reputation
    });
  }

  private buildOffers(
    db: SaveDatabase,
    repository: CareerRepository,
    reputation: number,
    options: { window: string; employedAt: number | null }
  ): CareerOffer[] {
    const seasonNumber = repository.gameState().seasonNumber;
    const spells = repository.spells();
    const last = spells[spells.length - 1];
    const lastTeam = last ? repository.findTeam(last.teamId) : null;
    const country = lastTeam ? repository.findCompetition(lastTeam.competitionId)?.country : null;
    if (!country) {
      return [];
    }

    const history = new HistoryRepository(db);
    const standingOf = (competitionId: string, teamId: string) => {
      const season = repository.seasonOf(competitionId, seasonNumber);
      return season ? this.positionOf(history, season.id, teamId) : { position: null, teams: 0 };
    };

    const eligible = repository
      .clubsInCountry(country)
      .filter((row) => row.team.id !== last?.teamId)
      .filter((row) => clubWouldHire(row.team.reputation, reputation))
      .filter(
        (row) => options.employedAt === null || tempts(row.team.reputation, options.employedAt)
      );

    // Quién tiene el banquillo abierto en esta ventana. Sale de una tirada
    // fija por club y ventana: mirar dos veces el mismo mes da lo mismo, y el
    // mes siguiente, otra cosa.
    const open = eligible.filter((row) => {
      const standing = standingOf(row.competition.id, row.team.id);
      const roll = createRng(seedFromString(`${row.team.id}|${options.window}`));
      return roll.chance(vacancyChance(standing.position, standing.teams));
    });

    let chosen = open;
    // Recién destituido o en el paro, alguien llama siempre: el club que más se
    // parece a lo que vales. Esperar es para buscar algo mejor, no la única
    // salida. Con equipo no hay tal garantía: si nadie tienta, nadie llama.
    if (chosen.length === 0 && options.employedAt === null && eligible.length > 0) {
      chosen = [
        [...eligible].sort(
          (a, b) =>
            Math.abs(a.team.reputation - reputation) - Math.abs(b.team.reputation - reputation)
        )[0]!
      ];
    }

    const candidates = [...chosen]
      .sort((a, b) => b.team.reputation - a.team.reputation)
      .slice(0, offerCountFor(reputation));

    return candidates.map((row) => {
      const standing = standingOf(row.competition.id, row.team.id);
      const objective = objectiveForReputation(row.team.reputation, row.competition.tier);

      return {
        teamId: row.team.id,
        teamName: row.team.name,
        competitionName: row.competition.name,
        tier: row.competition.tier,
        reputation: row.team.reputation,
        position: standing.position,
        teams: standing.teams,
        objectiveLabel: BOARD_OBJECTIVE_LABELS[objective as BoardObjective],
        stepLabel: stepLabel(row.team.reputation, lastTeam?.reputation ?? row.team.reputation)
      };
    });
  }
}

/** «2025-10»: la ventana del mercado de entrenadores es el mes. */
function monthKey(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** Si una temporada cae dentro de una etapa. */
function withinSpell(spell: CareerSpellRow, seasonNumber: number): boolean {
  return seasonNumber >= spell.startSeason && seasonNumber <= (spell.endSeason ?? Infinity);
}

/** Qué club dirigía el entrenador en una temporada dada. */
function teamManagedIn(
  spells: readonly CareerSpellRow[],
  seasonNumber: number,
  fallback: string | null
): string | null {
  if (spells.length === 0) {
    return fallback;
  }
  return spells.find((spell) => withinSpell(spell, seasonNumber))?.teamId ?? null;
}

/** «Un paso arriba», «un club más pequeño»: de un vistazo, adónde vas. */
function stepLabel(offered: number, previous: number): string {
  const gap = offered - previous;
  if (gap >= 12) return 'Un salto hacia arriba';
  if (gap >= 4) return 'Un club algo mayor';
  if (gap <= -12) return 'Un paso atrás';
  if (gap <= -4) return 'Un club algo menor';
  return 'Un club parecido';
}

/** El modo mánager no tiene carrera: se responde apagada en vez de fallar. */
function apagada(managerName: string): CareerStatus {
  return {
    careerMode: false,
    managerName,
    reputation: 0,
    reputationLabel: '',
    unemployed: false,
    currentTeamName: null,
    spells: [],
    seasonsManaged: 0,
    titles: 0,
    offers: [],
    offersWhileEmployed: false,
    canResign: false,
    canWait: false,
    currentDate: 0
  };
}
