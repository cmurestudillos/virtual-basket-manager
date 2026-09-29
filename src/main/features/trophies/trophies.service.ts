import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { TrophyEntry } from '@shared/contracts/history.contract';
import { MANAGER_COACH_ID } from '@shared/contracts/coaches.contract';
import type {
  ManagerCabinet,
  PendingCelebration,
  SeasonAwardEntry,
  SeasonGala
} from '@shared/contracts/trophies.contract';
import type { Position } from '@shared/domain/positions';
import {
  computeSeasonAwards,
  type AwardLine,
  type SeasonAwardType
} from '@shared/domain/season-awards';
import type { StandingRow } from '@shared/domain/standings';
import {
  CELEBRATION_ORDER,
  trophyKindOf,
  type CelebrationKind,
  type TrophyKind
} from '@shared/domain/trophies';
import { ageAt } from '../players/players.mapper';
import type { SaveDatabase } from '../../database/save-database';
import type {
  CelebrationRow,
  CompetitionRow,
  SeasonAwardRow,
  SeasonRow,
  TeamRow
} from '../../database/schema/save';
import { HistoryService } from '../history/history.service';
import { NationalRepository } from '../national/national.repository';
import { WORLD_CUP_COMPETITION_ID } from '../national/national-squad';
import { TrophyRepository } from './trophies.repository';

const idSchema = z.string().min(1);

/** Lo que el calendario sabe de una liga el día que termina. */
export interface LeagueClosing {
  /** Clasificación final de la fase regular. */
  standings: readonly StandingRow[];
  /** Ronda de la final si hubo cuadro; `null` en una liga sin playoffs. */
  finalRound: number | null;
  championTeamId: string | null;
  /** El club del usuario si es su liga y tiene banquillo: a él se le enseña la gala. */
  galaFor: string | null;
}

/**
 * Trofeos, pantallas de campeón y premios (2026-09-29).
 *
 * El calendario llama aquí en tres momentos, y en los tres es idempotente
 * (índices únicos): cuando alguien levanta un título, cuando una liga termina
 * (premios de todas las ligas y gala de la tuya) y cuando se sube de
 * categoría. Lo demás es leer: las pantallas pendientes, las galas y la
 * vitrina del mánager.
 *
 * Una celebración es **sólo** del club o la selección que dirige el usuario;
 * quién lo sea lo decide quien llama, que es quien sabe si hay banquillo.
 */
export class TrophyService {
  /** Ver el porqué del resolutor en `SeasonService`. */
  constructor(private readonly resolveDb: () => SaveDatabase) {}

  // --- Lo que apunta el calendario ---------------------------------------------

  /** Un título del usuario: la pantalla de campeón queda pendiente. */
  celebrateTitle(seasonId: string, teamId: string, happenedOn: Date): void {
    const repository = new TrophyRepository(this.resolveDb());
    const season = repository.findSeason(seasonId);
    const competition = season ? repository.findCompetition(season.competitionId) : null;
    const team = repository.findTeam(teamId);
    if (!season || !competition || !team) {
      return;
    }
    const trophyKind = trophyKindOf(competition);
    if (!trophyKind) {
      return;
    }
    this.record(repository, {
      kind: 'title',
      trophyKind,
      season,
      competitionId: competition.id,
      competitionName: competition.name,
      team,
      happenedOn
    });
  }

  /** Un ascenso del usuario: la placa, con la división a la que sube. */
  celebratePromotion(
    lowerSeasonId: string,
    teamId: string,
    upper: Pick<CompetitionRow, 'id' | 'name'>,
    happenedOn: Date
  ): void {
    const repository = new TrophyRepository(this.resolveDb());
    const season = repository.findSeason(lowerSeasonId);
    const team = repository.findTeam(teamId);
    if (!season || !team) {
      return;
    }
    this.record(repository, {
      kind: 'promotion',
      trophyKind: 'promotion',
      season,
      competitionId: upper.id,
      competitionName: upper.name,
      team,
      happenedOn
    });
  }

  /**
   * Los premios de una liga que acaba de terminar, y la gala si es la del
   * usuario.
   *
   * Aquí y no al empezar la temporada siguiente a propósito: en septiembre ya
   * se han retirado jugadores, vencido contratos y movido banquillos, y el
   * premiado podría no estar donde estaba. Esto corre el día que acaba la
   * liga, con todo el mundo en su sitio.
   */
  closeLeague(seasonId: string, closing: LeagueClosing): void {
    const repository = new TrophyRepository(this.resolveDb());
    const season = repository.findSeason(seasonId);
    const competition = season ? repository.findCompetition(season.competitionId) : null;
    if (!season || !competition) {
      return;
    }
    const today = repository.gameState().currentDate;

    if (!repository.hasAwards(season.id)) {
      this.award(repository, season, competition, closing, today);
    }

    if (closing.galaFor) {
      const team = repository.findTeam(closing.galaFor);
      if (team) {
        this.record(repository, {
          kind: 'season_gala',
          trophyKind: 'award',
          season,
          competitionId: competition.id,
          competitionName: competition.name,
          team,
          happenedOn: today
        });
      }
    }
  }

  // --- Lo que lee la interfaz --------------------------------------------------

  /** Las pantallas por enseñar: por día, y dentro del día, título, ascenso y gala. */
  listPending(): PendingCelebration[] {
    const repository = new TrophyRepository(this.resolveDb());
    const rows = repository.pendingCelebrations();
    const seasons = new Map(
      repository.seasonsByIds(rows.map((row) => row.seasonId)).map((row) => [row.id, row])
    );
    const teams = repository.teams();

    return [...rows]
      .sort(
        (a, b) =>
          a.happenedOn.getTime() - b.happenedOn.getTime() ||
          CELEBRATION_ORDER[a.kind as CelebrationKind] -
            CELEBRATION_ORDER[b.kind as CelebrationKind] ||
          a.createdAt.getTime() - b.createdAt.getTime()
      )
      .map((row) => toPending(row, seasons.get(row.seasonId), teams.get(row.teamId)));
  }

  markSeen(celebrationId: string): void {
    const id = idSchema.parse(celebrationId);
    const repository = new TrophyRepository(this.resolveDb());
    repository.markSeen(id, new Date());
  }

  /** Los premios de una temporada de liga, o `null` si no se entregaron. */
  getGala(seasonId: string): SeasonGala | null {
    const id = idSchema.parse(seasonId);
    const repository = new TrophyRepository(this.resolveDb());
    const managed = repository.gameState().managedTeamId;
    return this.galasOf([id], () => managed)[0] ?? null;
  }

  /**
   * Las galas de varias temporadas, de la más reciente a la más antigua.
   * `managedIn` dice qué club dirigía el usuario cada curso, para marcar lo suyo.
   */
  galasOf(
    seasonIds: readonly string[],
    managedIn: (seasonNumber: number) => string | null
  ): SeasonGala[] {
    const repository = new TrophyRepository(this.resolveDb());
    const awards = repository.awardsOf(seasonIds);
    const bySeason = new Map<string, SeasonAwardRow[]>();
    for (const row of awards) {
      bySeason.set(row.seasonId, [...(bySeason.get(row.seasonId) ?? []), row]);
    }

    return repository
      .seasonsByIds([...bySeason.keys()])
      .sort((a, b) => b.seasonNumber - a.seasonNumber)
      .map((season) => {
        const competition = repository.findCompetition(season.competitionId);
        const managed = managedIn(season.seasonNumber);
        return {
          seasonId: season.id,
          competitionId: season.competitionId,
          competitionName: competition?.name ?? season.competitionId,
          seasonNumber: season.seasonNumber,
          years: yearsLabel(season.startYear),
          awards: sortAwards(bySeason.get(season.id) ?? []).map((row) => toAward(row, managed))
        };
      });
  }

  /**
   * La vitrina del mánager: los títulos de sus clubes (los mismos del
   * historial, que ya sabe a quién dirigía cada año), sus Mundiales con la
   * selección y sus ascensos.
   */
  getManagerCabinet(): ManagerCabinet {
    const history = new HistoryService(this.resolveDb).get();
    const national = new NationalRepository(this.resolveDb());
    const spells = national.spells();
    const worldCups = national
      .seasonsOf(WORLD_CUP_COMPETITION_ID)
      .filter((season) =>
        spells.some(
          (spell) =>
            season.championTeamId === spell.teamId &&
            season.seasonNumber >= spell.startSeason &&
            season.seasonNumber <= (spell.endSeason ?? Infinity)
        )
      )
      .sort((a, b) => b.seasonNumber - a.seasonNumber);

    const trophies: TrophyEntry[] = [...history.trophies];
    if (worldCups.length > 0) {
      const competition = national
        .listCompetitions()
        .find((row) => row.id === WORLD_CUP_COMPETITION_ID);
      trophies.push({
        competitionId: WORLD_CUP_COMPETITION_ID,
        competitionName: competition?.name ?? 'Mundial',
        format: competition?.format ?? 'national-tournament',
        trophyKind: 'world_cup',
        seasons: worldCups.map((season) => season.seasonNumber),
        years: worldCups.map((season) => yearsLabel(season.startYear))
      });
    }
    trophies.sort(
      (a, b) =>
        b.seasons.length - a.seasons.length || a.competitionName.localeCompare(b.competitionName)
    );

    return {
      trophies,
      totalTrophies: trophies.reduce((sum, trophy) => sum + trophy.seasons.length, 0),
      promotions: history.promotions
    };
  }

  // --- Por dentro ----------------------------------------------------------------

  private record(
    repository: TrophyRepository,
    entry: {
      kind: CelebrationKind;
      trophyKind: TrophyKind;
      season: SeasonRow;
      competitionId: string;
      competitionName: string;
      team: TeamRow;
      happenedOn: Date;
    }
  ): void {
    repository.insertCelebration({
      id: randomUUID(),
      kind: entry.kind,
      trophyKind: entry.trophyKind,
      seasonId: entry.season.id,
      competitionId: entry.competitionId,
      teamId: entry.team.id,
      teamName: entry.team.name,
      competitionName: entry.competitionName,
      happenedOn: entry.happenedOn,
      createdAt: new Date(),
      seenOn: null
    });
  }

  /** Calcula y guarda los premios de una liga, con los nombres congelados. */
  private award(
    repository: TrophyRepository,
    season: SeasonRow,
    competition: CompetitionRow,
    closing: LeagueClosing,
    today: Date
  ): void {
    const regularLines = repository.regularLines(season.id).map(toAwardLine);
    const finalsLines =
      closing.finalRound !== null && closing.championTeamId
        ? repository.roundLines(season.id, closing.finalRound).map(toAwardLine)
        : [];
    const playerIds = [...new Set([...regularLines, ...finalsLines].map((line) => line.playerId))];
    const players = repository.playersByIds(playerIds);
    const teams = repository.teams();
    const benches = repository.benches();
    const state = repository.gameState();

    const winners = computeSeasonAwards({
      regularLines,
      players: new Map(
        [...players.values()].map((player) => [
          player.id,
          { position: player.position as Position, age: ageAt(player.birthDate, today) }
        ])
      ),
      standings: closing.standings,
      expectedPositions: expectedPositions(
        closing.standings.map((row) => row.teamId),
        teams
      ),
      coaches: new Map(
        closing.standings
          .map((row) => [row.teamId, benches.get(row.teamId)?.id] as const)
          .filter((entry): entry is readonly [string, string] => entry[1] !== undefined)
      ),
      finals:
        closing.championTeamId && finalsLines.length > 0
          ? { championTeamId: closing.championTeamId, lines: finalsLines }
          : null
    });

    const createdAt = new Date();
    repository.insertAwards(
      winners.map((winner) => {
        const player = winner.playerId ? players.get(winner.playerId) : undefined;
        const coach = winner.coachId ? repository.findCoach(winner.coachId) : null;
        const isManager = coach?.id === MANAGER_COACH_ID;
        return {
          id: randomUUID(),
          seasonId: season.id,
          competitionId: competition.id,
          type: winner.type,
          playerId: winner.playerId,
          playerName: player ? `${player.firstName} ${player.lastName}` : null,
          coachId: winner.coachId,
          coachName: coach
            ? isManager
              ? state.managerName
              : `${coach.firstName} ${coach.lastName}`
            : null,
          nationality: player
            ? player.nationality
            : coach
              ? isManager
                ? state.managerNationality
                : coach.nationality
              : null,
          teamId: winner.teamId,
          teamName: teams.get(winner.teamId)?.name ?? winner.teamId,
          value: winner.value,
          slot: winner.slot,
          position: winner.position,
          createdAt
        };
      })
    );
  }
}

/**
 * El puesto que se esperaba de cada club por su reputación: el mismo criterio
 * con el que el consejo de la IA juzga a sus entrenadores.
 */
function expectedPositions(
  teamIds: readonly string[],
  teams: ReadonlyMap<string, TeamRow>
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

function toAwardLine(row: {
  gameId: string;
  teamId: string;
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
}): AwardLine {
  return {
    gameId: row.gameId,
    teamId: row.teamId,
    playerId: row.playerId,
    secondsPlayed: row.secondsPlayed,
    twoPointMade: row.twoPointMade,
    twoPointAttempted: row.twoPointAttempted,
    threePointMade: row.threePointMade,
    threePointAttempted: row.threePointAttempted,
    freeThrowMade: row.freeThrowMade,
    freeThrowAttempted: row.freeThrowAttempted,
    offensiveRebounds: row.offensiveRebounds,
    defensiveRebounds: row.defensiveRebounds,
    assists: row.assists,
    steals: row.steals,
    blocks: row.blocks,
    turnovers: row.turnovers,
    fouls: row.fouls,
    foulsDrawn: row.foulsDrawn,
    plusMinus: row.plusMinus
  };
}

/** En el orden de la gala: los individuales primero y el quinteto al final. */
const AWARD_ORDER: Record<SeasonAwardType, number> = {
  mvp: 0,
  finals_mvp: 1,
  top_scorer: 2,
  top_rebounder: 3,
  top_assister: 4,
  best_defender: 5,
  best_young: 6,
  coach_of_year: 7,
  all_league: 8
};

function sortAwards(rows: readonly SeasonAwardRow[]): SeasonAwardRow[] {
  return [...rows].sort(
    (a, b) =>
      (AWARD_ORDER[a.type as SeasonAwardType] ?? 99) -
        (AWARD_ORDER[b.type as SeasonAwardType] ?? 99) || a.slot - b.slot
  );
}

function toAward(row: SeasonAwardRow, managedTeamId: string | null): SeasonAwardEntry {
  return {
    type: row.type as SeasonAwardType,
    playerId: row.playerId,
    playerName: row.playerName,
    coachId: row.coachId,
    coachName: row.coachName,
    coachIsManager: row.coachId === MANAGER_COACH_ID,
    nationality: row.nationality,
    teamId: row.teamId,
    teamName: row.teamName,
    value: row.value,
    slot: row.slot,
    position: (row.position as Position | null) ?? null,
    isManaged: managedTeamId !== null && row.teamId === managedTeamId
  };
}

function toPending(
  row: CelebrationRow,
  season: SeasonRow | undefined,
  team: TeamRow | undefined
): PendingCelebration {
  return {
    id: row.id,
    kind: row.kind as CelebrationKind,
    trophyKind: row.trophyKind as TrophyKind,
    seasonId: row.seasonId,
    competitionId: row.competitionId,
    competitionName: row.competitionName,
    teamId: row.teamId,
    teamName: row.teamName,
    nationOf: team?.nationalOf ?? null,
    years: season ? yearsLabel(season.startYear) : ''
  };
}

/** «2025-26», que es como se nombra una temporada. */
function yearsLabel(startYear: number): string {
  return `${startYear}-${String((startYear + 1) % 100).padStart(2, '0')}`;
}
