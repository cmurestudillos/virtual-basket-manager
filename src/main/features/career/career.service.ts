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
  type CareerSeasonRecord
} from '@shared/domain/career';
import { computeStandings } from '@shared/domain/standings';
import type { SaveDatabase } from '../../database/save-database';
import type { CareerSpellRow } from '../../database/schema/save';
import { BoardService } from '../club/board.service';
import { HistoryRepository } from '../history/history.repository';
import { CareerRepository } from './career.repository';

export class NotInCareerModeError extends Error {
  constructor() {
    super('Esta partida no se juega en modo carrera');
    this.name = 'NotInCareerModeError';
  }
}

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
      offers: open === null ? this.buildOffers(db, repository, reputation, state.seasonNumber) : []
    };
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
    if (repository.openSpell()) {
      throw new NotInCareerModeError();
    }

    const records = this.seasonRecords(db, repository);
    const reputation = managerReputation(records);
    const offers = this.buildOffers(db, repository, reputation, state.seasonNumber);
    if (!offers.some((offer) => offer.teamId === teamId)) {
      throw new OfferNotAvailableError(teamId);
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
  private buildOffers(
    db: SaveDatabase,
    repository: CareerRepository,
    reputation: number,
    seasonNumber: number
  ): CareerOffer[] {
    const spells = repository.spells();
    const last = spells[spells.length - 1];
    const lastTeam = last ? repository.findTeam(last.teamId) : null;
    const country = lastTeam ? repository.findCompetition(lastTeam.competitionId)?.country : null;
    if (!country) {
      return [];
    }

    const history = new HistoryRepository(db);
    const candidates = repository
      .clubsInCountry(country)
      .filter((row) => row.team.id !== last?.teamId)
      .filter((row) => clubWouldHire(row.team.reputation, reputation))
      .sort((a, b) => b.team.reputation - a.team.reputation)
      .slice(0, offerCountFor(reputation));

    return candidates.map((row) => {
      const season = repository.seasonOf(row.competition.id, seasonNumber);
      const standing = season
        ? this.positionOf(history, season.id, row.team.id)
        : { position: null, teams: 0 };
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
    offers: []
  };
}
