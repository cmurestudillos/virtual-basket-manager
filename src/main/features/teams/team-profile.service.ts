import { teamIdRequestSchema } from '@shared/contracts/rotation.contract';
import type { TrophyEntry } from '@shared/contracts/history.contract';
import type { StandingEntry } from '@shared/contracts/season.contract';
import type {
  TeamProfile,
  TeamProfileForm,
  TeamProfileGame,
  TeamProfileLeader,
  TeamProfilePlayer,
  TeamProfileTactics
} from '@shared/contracts/teams.contract';
import type { PlayerSeasonStats } from '@shared/contracts/stats.contract';
import { BOARD_OBJECTIVE_LABELS, objectiveForReputation } from '@shared/domain/board';
import {
  addBoxScores,
  efficiencyRating,
  emptyPlayerBoxScore,
  totalRebounds
} from '@shared/domain/box-score';
import { competitionKind } from '@shared/domain/competition-kind';
import { contractYearsLeft } from '@shared/domain/market';
import { POSITIONS } from '@shared/domain/positions';
import { LINEUP_SIZE } from '@shared/domain/rotation';
import { perGame } from '@shared/domain/season-stats';
import { NO_SCOUT_ERROR } from '@shared/domain/staff';
import type { SaveDatabase } from '../../database/save-database';
import type { CompetitionRow, GameRow } from '../../database/schema/save';
// Entrenadores de la IA (fase 5).
import { CoachService } from '../coaches/coaches.service';
import { HistoryRepository } from '../history/history.repository';
import { buildEngineTeam } from '../match/engine-input';
import { analystReportsRivals, describeTactics } from '../match/rival-scouting';
import { toPlayerSummary, withoutMorale } from '../players/players.mapper';
import { scoutPlayer, scoutingErrorFor } from '../players/scouting';
import { SeasonService } from '../season/season.service';
import { StaffService } from '../staff/staff.service';
import { StatsRepository } from '../stats/stats.repository';
import { StatsService } from '../stats/stats.service';
import { TeamsRepository, type TeamGameWithCompetition } from './teams.repository';

/** Cuántos jugadores cuentan para la media del equipo: los de la rotación. */
const TEAM_OVERALL_PLAYERS = 8;
/** Cuántos resultados lleva la racha. */
const FORM_GAMES = 5;

export class NationalTeamProfileError extends Error {
  constructor(teamId: string) {
    super(`${teamId} es una selección: la ficha es de clubes`);
    this.name = 'NationalTeamProfileError';
  }
}

/**
 * La ficha de un club, la de cualquiera, vista desde el club del usuario.
 *
 * Todo sale de lo que ya hay guardado —la plantilla, los partidos, las actas,
 * el campeón de cada temporada—, pero no todo se enseña igual: la visibilidad es
 * la que decidió el usuario. Siempre, lo que sabe cualquiera que siga la liga
 * (pabellón, resultados, estadísticas, sueldos y contratos, lesionados); con el
 * margen del ojeador, la media, los atributos y el potencial; con un analista
 * competente, la pizarra y el quinteto; y nunca, la caja, las nóminas ni la
 * moral. El club propio se ve entero, sin niebla.
 */
export class TeamProfileService {
  /** Ver el porqué del resolutor en `SeasonService`. */
  constructor(private readonly resolveDb: () => SaveDatabase) {}

  get(teamId: string): TeamProfile | null {
    const validated = teamIdRequestSchema.parse({ teamId });
    const db = this.resolveDb();
    const repository = new TeamsRepository(db);
    const found = repository.findWithCompetition(validated.teamId);
    if (!found) {
      return null;
    }
    const { team, competition } = found;
    if (team.nationalOf) {
      throw new NationalTeamProfileError(team.id);
    }

    const managedTeamId = repository.managedTeamId();
    const isManaged = team.id === managedTeamId;
    const { today, seasonNumber } = repository.calendar();

    const scoutLevel = managedTeamId ? new StaffService(() => db).levels(managedTeamId).scout : 0;
    const error = scoutingErrorFor(scoutLevel, isManaged);
    const squad = this.squad(repository, team.id, today, error, isManaged);

    const names = repository.teamNames();
    const games = repository
      .listSeasonGames(team.id, seasonNumber)
      .map((row) => toProfileGame(row, names, managedTeamId));
    const leagueGames = games.filter(
      (game) => game.competitionId === competition.id && game.played
    );
    const { standing, leagueTeams } = this.standing(competition, team.id, managedTeamId);
    const playerStats = new StatsService(this.resolveDb).teamSeason(team.id, competition.id);
    const objective = objectiveForReputation(team.reputation, competition.tier);
    const trophies = trophiesOf(new HistoryRepository(db), team.id);

    return {
      teamId: team.id,
      name: team.name,
      shortName: team.shortName,
      city: team.city,
      country: team.country,
      pavilionName: team.pavilionName,
      pavilionCapacity: team.pavilionCapacity,
      reputation: team.reputation,
      competitionId: competition.id,
      competitionName: competition.name,
      tier: competition.tier,
      isManaged,
      // El de la IA, o el usuario si es su club.
      coach: new CoachService(this.resolveDb).coachOf(team.id),
      // Sin ojeador no se sabe ni la media, igual que en la ficha del jugador.
      overall: error >= NO_SCOUT_ERROR ? null : teamOverall(squad.map((player) => player.overall)),
      uncertainty: Math.round(error),
      objective: { id: objective, label: BOARD_OBJECTIVE_LABELS[objective] },
      standing,
      leagueTeams,
      season: this.seasonAverages(
        db,
        repository,
        competition.id,
        seasonNumber,
        team.id,
        leagueGames
      ),
      form: formOf(games, team.id),
      games,
      headToHead:
        managedTeamId && !isManaged
          ? headToHead(new HistoryRepository(db), games, team.id, managedTeamId)
          : null,
      trophies,
      totalTrophies: trophies.reduce((sum, trophy) => sum + trophy.seasons.length, 0),
      leaders: leadersOf(playerStats),
      squad,
      playerStats,
      report: this.report(db, team.id, today, squad, isManaged, managedTeamId)
    };
  }

  // ------------------------------------------------------------------------

  /**
   * La plantilla como la ve el usuario: con el margen de su ojeador y, si no es
   * la suya, sin la moral. Sueldo y años de contrato van a la vista, como en el
   * mercado. Por puesto y, dentro del puesto, de mejor a peor.
   */
  private squad(
    repository: TeamsRepository,
    teamId: string,
    today: Date,
    error: number,
    isManaged: boolean
  ): TeamProfilePlayer[] {
    return repository
      .listRoster(teamId)
      .map((row) => {
        const seen = scoutPlayer(toPlayerSummary(row, today), error);
        return {
          ...(isManaged ? seen : withoutMorale(seen)),
          contractYearsLeft: contractYearsLeft(row.contractUntil, today)
        };
      })
      .sort(
        (a, b) =>
          POSITIONS.indexOf(a.position) - POSITIONS.indexOf(b.position) || b.overall - a.overall
      );
  }

  /**
   * Su fila en la clasificación de su liga. Sin club dirigido no hay temporada
   * que leer, y una liga que no se juega este curso no tiene tabla: en los dos
   * casos, sin fila.
   */
  private standing(
    competition: CompetitionRow,
    teamId: string,
    managedTeamId: string | null
  ): { standing: StandingEntry | null; leagueTeams: number } {
    if (!managedTeamId || competition.format !== 'league') {
      return { standing: null, leagueTeams: 0 };
    }
    // Sin la liga pedida, la temporada devuelve la del usuario: por eso se
    // comprueba que el club esté en la tabla que llega.
    const rows = new SeasonService(this.resolveDb).getStandings(competition.id);
    const standing = rows.find((row) => row.teamId === teamId) ?? null;
    return { standing, leagueTeams: standing ? rows.length : 0 };
  }

  /** Medias por partido en su liga: el marcador sale de los partidos y lo demás, de las actas. */
  private seasonAverages(
    db: SaveDatabase,
    repository: TeamsRepository,
    competitionId: string,
    seasonNumber: number,
    teamId: string,
    leagueGames: readonly TeamProfileGame[]
  ): TeamProfile['season'] {
    const seasonId = repository.seasonIdOf(competitionId, seasonNumber);
    if (!seasonId || leagueGames.length === 0) {
      return null;
    }

    let scored = 0;
    let conceded = 0;
    for (const game of leagueGames) {
      const home = game.homeTeamId === teamId;
      scored += (home ? game.homeScore : game.awayScore) ?? 0;
      conceded += (home ? game.awayScore : game.homeScore) ?? 0;
    }

    const lines = new StatsRepository(db).listSeasonLines(seasonId, teamId);
    const box = lines.reduce((sum, line) => addBoxScores(sum, line), emptyPlayerBoxScore(teamId));
    const boxGames = new Set(lines.map((line) => line.gameId)).size;
    const games = leagueGames.length;

    return {
      games,
      points: perGame(scored, games),
      pointsAgainst: perGame(conceded, games),
      rebounds: perGame(totalRebounds(box), boxGames),
      assists: perGame(box.assists, boxGames),
      efficiency: perGame(efficiencyRating(box), boxGames)
    };
  }

  /**
   * La pizarra y el cinco. Los del club propio, siempre; los de otro, sólo si
   * el analista del usuario llega (la misma regla que la previa del partido).
   */
  private report(
    db: SaveDatabase,
    teamId: string,
    today: Date,
    squad: readonly TeamProfilePlayer[],
    isManaged: boolean,
    managedTeamId: string | null
  ): TeamProfileTactics | null {
    if (!isManaged && !analystReportsRivals(db, managedTeamId)) {
      return null;
    }
    const tactics = describeTactics(db, teamId);
    if (!tactics) {
      return null;
    }

    // El cinco sale de donde lo saca el motor, como en la previa: sin
    // lesionados ni los que están con su selección.
    const engineTeam = buildEngineTeam(db, teamId, today);
    const ids = [
      ...engineTeam.starters,
      ...engineTeam.players
        .map((player) => player.id)
        .filter((id) => !engineTeam.starters.includes(id))
    ].slice(0, LINEUP_SIZE);
    const byId = new Map(squad.map((player) => [player.id, player]));

    return {
      tactics,
      usualFive: ids
        .map((id) => byId.get(id))
        .filter((player): player is TeamProfilePlayer => player !== undefined)
        .map((player) => ({
          playerId: player.id,
          playerName: `${player.firstName} ${player.lastName}`,
          nationality: player.nationality,
          position: player.position,
          overall: player.overall,
          uncertainty: player.uncertainty
        }))
    };
  }
}

/**
 * La media de un equipo: la de los ocho mejores de su plantilla, que son los
 * que juegan. Con la plantilla vista por el ojeador, la media también lleva su
 * niebla. `null` sin jugadores.
 */
export function teamOverall(overalls: readonly number[]): number | null {
  const best = [...overalls].sort((a, b) => b - a).slice(0, TEAM_OVERALL_PLAYERS);
  if (best.length === 0) {
    return null;
  }
  return Math.round(best.reduce((sum, value) => sum + value, 0) / best.length);
}

function toProfileGame(
  row: TeamGameWithCompetition,
  names: ReadonlyMap<string, string>,
  managedTeamId: string | null
): TeamProfileGame {
  const { game, competition } = row;
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
    overtimes: game.overtimes,
    played: isPlayed(game),
    involvesManaged:
      managedTeamId !== null &&
      (game.homeTeamId === managedTeamId || game.awayTeamId === managedTeamId),
    seriesId: game.seriesId,
    competitionId: competition.id,
    competitionName: competition.name,
    kind: competitionKind({
      format: competition.format,
      seriesId: game.seriesId,
      teamId: game.homeTeamId
    })
  };
}

function isPlayed(game: Pick<GameRow, 'homeScore' | 'awayScore'>): boolean {
  return game.homeScore !== null && game.awayScore !== null;
}

/** Los últimos resultados, del más antiguo al más reciente, vistos desde el club. */
function formOf(games: readonly TeamProfileGame[], teamId: string): TeamProfileForm[] {
  return games
    .filter((game) => game.played)
    .slice(-FORM_GAMES)
    .map((game) => {
      const home = game.homeTeamId === teamId;
      const own = (home ? game.homeScore : game.awayScore) ?? 0;
      const rival = (home ? game.awayScore : game.homeScore) ?? 0;
      return {
        gameId: game.gameId,
        won: own > rival,
        score: [own, rival],
        rivalTeamId: home ? game.awayTeamId : game.homeTeamId,
        rivalTeamName: home ? game.awayTeamName : game.homeTeamName,
        home
      };
    });
}

/**
 * Contra el club del usuario: los partidos de este curso (jugados y por jugar)
 * y el balance de todos los que se han jugado nunca, en cualquier competición.
 */
function headToHead(
  history: HistoryRepository,
  games: readonly TeamProfileGame[],
  teamId: string,
  managedTeamId: string
): NonNullable<TeamProfile['headToHead']> {
  let managedWins = 0;
  let teamWins = 0;
  for (const { game } of history.gamesBetween(teamId, managedTeamId)) {
    if (!isPlayed(game)) {
      continue;
    }
    const winner =
      (game.homeScore ?? 0) > (game.awayScore ?? 0) ? game.homeTeamId : game.awayTeamId;
    if (winner === managedTeamId) {
      managedWins += 1;
    } else {
      teamWins += 1;
    }
  }

  return {
    games: games.filter((game) => game.involvesManaged),
    played: managedWins + teamWins,
    managedWins,
    teamWins
  };
}

/** El palmarés del club en la partida, agrupado por competición, lo más ganado primero. */
function trophiesOf(history: HistoryRepository, teamId: string): TrophyEntry[] {
  const byCompetition = new Map<string, TrophyEntry>();
  for (const { competition, season } of history.titlesOf(teamId)) {
    const entry = byCompetition.get(competition.id) ?? {
      competitionId: competition.id,
      competitionName: competition.name,
      format: competition.format,
      seasons: [],
      years: []
    };
    entry.seasons.push(season.seasonNumber);
    entry.years.push(yearsLabel(season.startYear));
    byCompetition.set(competition.id, entry);
  }

  return [...byCompetition.values()].sort(
    (a, b) =>
      b.seasons.length - a.seasons.length || a.competitionName.localeCompare(b.competitionName)
  );
}

/** «2025-26», que es como se nombra una temporada. */
function yearsLabel(startYear: number): string {
  return `${startYear}-${String((startYear + 1) % 100).padStart(2, '0')}`;
}

const LEADER_FIELDS: readonly {
  category: TeamProfileLeader['category'];
  label: string;
  value: (row: PlayerSeasonStats) => number;
}[] = [
  { category: 'points', label: 'Puntos', value: (row) => row.pointsPerGame },
  { category: 'rebounds', label: 'Rebotes', value: (row) => row.reboundsPerGame },
  { category: 'assists', label: 'Asistencias', value: (row) => row.assistsPerGame },
  { category: 'efficiency', label: 'Valoración', value: (row) => row.efficiencyPerGame }
];

/** El mejor del club en puntos, rebotes, asistencias y valoración por partido. */
function leadersOf(stats: readonly PlayerSeasonStats[]): TeamProfileLeader[] {
  const played = stats.filter((row) => row.games > 0);
  return LEADER_FIELDS.flatMap((field) => {
    const best = played.reduce<PlayerSeasonStats | null>(
      (top, row) => (top === null || field.value(row) > field.value(top) ? row : top),
      null
    );
    return best
      ? [
          {
            category: field.category,
            label: field.label,
            playerId: best.playerId,
            playerName: best.playerName,
            nationality: best.nationality,
            value: field.value(best),
            games: best.games
          }
        ]
      : [];
  });
}
