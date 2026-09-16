import { sql } from 'drizzle-orm';
import type {
  HistoryCompetitionResult,
  HistorySeasonEntry,
  HistoryView,
  RecordEntry,
  TrophyEntry
} from '@shared/contracts/history.contract';
import { continentalRoundName } from '@shared/domain/continental';
import { CUP_TEAMS, cupRoundName } from '@shared/domain/cup';
import { buildPlayoffFormat } from '@shared/domain/playoffs';
import { computeStandings } from '@shared/domain/standings';
import type { SaveDatabase } from '../../database/save-database';
import {
  gamePlayerStatsTable,
  type CompetitionRow,
  type SeasonRow
} from '../../database/schema/save';
import { HistoryRepository, type RawRecord } from './history.repository';

/** Lo que se va apuntando de cada título mientras se recorren las temporadas. */
interface WonTrophy {
  competition: CompetitionRow;
  seasons: number[];
  years: string[];
}

/**
 * El historial de la partida: por dónde ha pasado el club y qué ha ganado.
 *
 * Se calcula al leerlo, no se guarda. Todo lo que hace falta ya está en la base
 * —el campeón de cada temporada lo apunta la propia temporada, y el puesto sale
 * de los partidos, que no se borran— así que una tabla de historial sólo
 * añadiría un segundo sitio donde apuntar lo mismo, y el día que los dos no
 * coincidieran habría que decidir cuál miente.
 */
export class HistoryService {
  /** Ver el porqué del resolutor en {@link SeasonService}. */
  constructor(private readonly resolveDb: () => SaveDatabase) {}

  get(): HistoryView {
    const repository = new HistoryRepository(this.resolveDb());
    const teamId = repository.managedTeamId();
    if (!teamId) {
      return { teamName: '', seasons: [], trophies: [], totalTrophies: 0, records: [] };
    }

    const competitions = repository.competitions();
    const names = repository.teamNames();

    // Las temporadas se agrupan por curso: en un mismo año el club juega su
    // liga, quizá la Copa y quizá Europa, y todo eso es una sola fila.
    const byNumber = new Map<number, SeasonRow[]>();
    for (const season of repository.seasons()) {
      const list = byNumber.get(season.seasonNumber) ?? [];
      list.push(season);
      byNumber.set(season.seasonNumber, list);
    }

    const seasons: HistorySeasonEntry[] = [];
    const trophies = new Map<string, WonTrophy>();

    for (const [seasonNumber, group] of [...byNumber].sort((a, b) => b[0] - a[0])) {
      const entry = this.buildSeason(
        repository,
        competitions,
        names,
        seasonNumber,
        group,
        teamId,
        trophies
      );
      if (entry) {
        seasons.push(entry);
      }
    }

    const trophyList: TrophyEntry[] = [...trophies.values()]
      .map((won) => ({
        competitionId: won.competition.id,
        competitionName: won.competition.name,
        format: won.competition.format,
        seasons: won.seasons,
        years: won.years
      }))
      // Primero lo que más se ha ganado; a igualdad, por nombre, que es estable.
      .sort(
        (a, b) =>
          b.seasons.length - a.seasons.length || a.competitionName.localeCompare(b.competitionName)
      );

    return {
      teamName: repository.teamName(teamId),
      seasons,
      trophies: trophyList,
      totalTrophies: trophyList.reduce((sum, trophy) => sum + trophy.seasons.length, 0),
      records: this.records(repository, teamId)
    };
  }

  /** Una temporada del club: dónde acabó en su liga y qué hizo en lo demás. */
  private buildSeason(
    repository: HistoryRepository,
    competitions: Map<string, CompetitionRow>,
    names: Map<string, string>,
    seasonNumber: number,
    group: readonly SeasonRow[],
    teamId: string,
    trophies: Map<string, WonTrophy>
  ): HistorySeasonEntry | null {
    let league: { season: SeasonRow; competition: CompetitionRow } | null = null;
    const others: HistoryCompetitionResult[] = [];

    for (const season of group) {
      const competition = competitions.get(season.competitionId);
      if (!competition) {
        continue;
      }

      const lastRound = repository.lastRoundOf(season.id, teamId);
      if (lastRound === null) {
        // El club no jugó esta competición: es la liga de otro país, o la Copa
        // de una categoría que no es la suya.
        continue;
      }

      const champion = season.championTeamId === teamId;
      if (champion) {
        const won = trophies.get(competition.id) ?? { competition, seasons: [], years: [] };
        won.seasons.push(seasonNumber);
        won.years.push(seasonYears(season));
        trophies.set(competition.id, won);
      }

      if (competition.format === 'league') {
        league = { season, competition };
        continue;
      }

      others.push({
        competitionName: competition.name,
        format: competition.format,
        outcome: champion ? 'Campeón' : knockoutOutcome(competition, lastRound),
        champion
      });
    }

    if (!league) {
      return null;
    }

    const { season, competition } = league;
    const record = this.leagueRecord(repository, season, teamId);
    const playoffs = this.playoffOutcome(repository, season, competition, teamId);
    if (playoffs) {
      others.unshift(playoffs);
    }

    return {
      seasonNumber,
      years: seasonYears(season),
      competitionId: competition.id,
      competitionName: competition.name,
      tier: competition.tier,
      position: record.position,
      teams: record.teams,
      won: record.won,
      lost: record.lost,
      championTeamName: season.championTeamId ? (names.get(season.championTeamId) ?? null) : null,
      others
    };
  }

  /** Puesto y balance del club en la liga regular de esa temporada. */
  private leagueRecord(
    repository: HistoryRepository,
    season: SeasonRow,
    teamId: string
  ): { position: number | null; teams: number; won: number; lost: number } {
    const teamIds = repository.teamIdsInSeason(season.id);
    const played = repository.playedRegularGames(season.id).map((game) => ({
      homeTeamId: game.homeTeamId,
      awayTeamId: game.awayTeamId,
      homeScore: game.homeScore as number,
      awayScore: game.awayScore as number
    }));

    if (played.length === 0) {
      return { position: null, teams: teamIds.length, won: 0, lost: 0 };
    }

    const standings = computeStandings(teamIds, played);
    const own = standings.find((row) => row.teamId === teamId);
    return {
      position: own?.position ?? null,
      teams: standings.length,
      won: own?.won ?? 0,
      lost: own?.lost ?? 0
    };
  }

  /** Hasta dónde llegó en los playoffs de su liga, si es que los jugó. */
  private playoffOutcome(
    repository: HistoryRepository,
    season: SeasonRow,
    competition: CompetitionRow,
    teamId: string
  ): HistoryCompetitionResult | null {
    if (competition.playoffTeams < 2) {
      return null;
    }

    const rounds = repository.playoffRoundsOf(season.id, teamId);
    if (rounds === null) {
      return null;
    }

    const champion = season.championTeamId === teamId;
    const format = buildPlayoffFormat(competition.playoffTeams, competition.playoffSeriesLength);
    return {
      competitionName: 'Playoffs',
      format: 'playoffs',
      outcome: champion ? 'Campeón' : (format[rounds - 1]?.name ?? 'Playoffs'),
      champion
    };
  }

  /**
   * Las marcas de la partida.
   *
   * Salen de la tabla del acta, que es la que más crece, así que cada una es
   * una consulta con su orden y su tope: traerse las filas a memoria para
   * ordenarlas aquí costaría más que todo el resto del historial junto.
   */
  private records(repository: HistoryRepository, teamId: string): RecordEntry[] {
    const points = sql<number>`(${gamePlayerStatsTable.twoPointMade} * 2 + ${gamePlayerStatsTable.threePointMade} * 3 + ${gamePlayerStatsTable.freeThrowMade})`;
    const rebounds = sql<number>`(${gamePlayerStatsTable.offensiveRebounds} + ${gamePlayerStatsTable.defensiveRebounds})`;

    const marks = [
      { label: 'Más puntos en un partido', expression: points },
      { label: 'Más rebotes en un partido', expression: rebounds },
      {
        label: 'Más asistencias en un partido',
        expression: sql<number>`${gamePlayerStatsTable.assists}`
      },
      {
        label: 'Más triples en un partido',
        expression: sql<number>`${gamePlayerStatsTable.threePointMade}`
      }
    ];

    const records: RecordEntry[] = [];
    for (const mark of marks) {
      const best = repository.bestBy(mark.expression)[0];
      if (!best || best.value <= 0) {
        continue;
      }
      records.push(toRecord(mark.label, best, teamId));
    }
    return records;
  }
}

/** «2025-26», que es como se nombra una temporada. */
function seasonYears(season: SeasonRow): string {
  return yearsLabel(season.startYear);
}

function yearsLabel(startYear: number): string {
  return `${startYear}-${String((startYear + 1) % 100).padStart(2, '0')}`;
}

/** El nombre de la ronda hasta la que llegó en una eliminatoria. */
function knockoutOutcome(competition: CompetitionRow, lastRound: number): string {
  if (competition.format === 'cup') {
    return cupRoundName(CUP_TEAMS / Math.pow(2, lastRound - 1));
  }
  return continentalRoundName(lastRound);
}

function toRecord(label: string, raw: RawRecord, managedTeamId: string): RecordEntry {
  return {
    label,
    playerName: raw.playerName,
    teamName: raw.teamName,
    value: raw.value,
    context: `Jornada ${raw.round} · ${yearsLabel(raw.startYear)}`,
    isManaged: raw.teamId === managedTeamId
  };
}
