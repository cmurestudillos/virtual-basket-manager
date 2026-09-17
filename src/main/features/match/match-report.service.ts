import { eq, inArray } from 'drizzle-orm';
import type {
  MatchPreview,
  MatchPreviewAverages,
  MatchPreviewPlayer,
  MatchPreviewTeam,
  RoundMvp,
  RoundResultEntry,
  RoundResults
} from '@shared/contracts/match.contract';
import {
  addBoxScores,
  efficiencyRating,
  emptyPlayerBoxScore,
  points,
  totalRebounds,
  type PlayerBoxScore
} from '@shared/domain/box-score';
import { LINEUP_SIZE } from '@shared/domain/rotation';
import { accumulateSeason, perGame } from '@shared/domain/season-stats';
import type { SaveDatabase } from '../../database/save-database';
import { playersTable, teamsTable, type GameRow, type PlayerRow } from '../../database/schema/save';
import { toPlayerSummary } from '../players/players.mapper';
import { SeasonRepository } from '../season/season.repository';
import { SeasonService } from '../season/season.service';
import { StatsRepository } from '../stats/stats.repository';
import { buildEngineTeam } from './engine-input';
import { MatchRepository } from './match.repository';
import { GameNotFoundError, roundLabel } from './match.service';

/**
 * Lo que rodea al partido: la previa de antes y la jornada de después.
 *
 * Va aparte del servicio del partido porque no juega nada: sólo lee. La previa
 * enseña a qué se enfrenta uno —el cinco que va a salir, cómo llega cada equipo
 * y a quién hay que parar— y la jornada, cómo ha quedado todo lo demás cuando
 * suena la última bocina.
 */
export class MatchReportService {
  /** Ver el porqué del resolutor en `SeasonService`. */
  constructor(private readonly resolveDb: () => SaveDatabase) {}

  preview(gameId: string): MatchPreview {
    const db = this.resolveDb();
    const repository = new MatchRepository(db);
    const game = repository.findGame(gameId);
    if (!game) {
      throw new GameNotFoundError(gameId);
    }

    const home = db.select().from(teamsTable).where(eq(teamsTable.id, game.homeTeamId)).get();
    const lines = new StatsRepository(db).listSeasonLines(game.seasonId);
    const today = repository.currentDate();

    return {
      gameId: game.id,
      competitionName: repository.competitionForGame(game.id)?.name ?? '',
      roundLabel: roundLabel(repository, game),
      pavilionName: home?.pavilionName ?? '',
      pavilionCapacity: home?.pavilionCapacity ?? 0,
      neutralVenue: game.neutralVenue,
      home: previewTeam(db, game.homeTeamId, lines, today),
      away: previewTeam(db, game.awayTeamId, lines, today)
    };
  }

  /**
   * Los partidos de la jornada de este partido.
   *
   * En liga es la jornada entera; en una eliminatoria, la Copa o Europa, los
   * partidos de la competición que caen ese mismo día. El mejor de la jornada
   * sale de las actas guardadas: la valoración más alta de todos ellos.
   */
  roundResults(gameId: string): RoundResults {
    const db = this.resolveDb();
    const repository = new MatchRepository(db);
    const game = repository.findGame(gameId);
    if (!game) {
      throw new GameNotFoundError(gameId);
    }

    const competition = repository.competitionForGame(game.id);
    const seasonRepository = new SeasonRepository(db);
    const games = sameRound(seasonRepository, game);
    const isLeagueRound = competition?.format === 'league' && !game.seriesId;
    const positions = isLeagueRound
      ? standingsPositions(this.resolveDb, competition.id)
      : new Map<string, number>();
    const userTeam = repository.userTeamFor(game);

    const entries: RoundResultEntry[] = games.map((row) => ({
      gameId: row.id,
      homeTeamId: row.homeTeamId,
      homeTeamName: repository.teamName(row.homeTeamId),
      awayTeamId: row.awayTeamId,
      awayTeamName: repository.teamName(row.awayTeamId),
      homeScore: row.homeScore,
      awayScore: row.awayScore,
      homePosition: positions.get(row.homeTeamId) ?? null,
      awayPosition: positions.get(row.awayTeamId) ?? null,
      played: row.homeScore !== null,
      involvesManaged:
        userTeam !== null && (row.homeTeamId === userTeam || row.awayTeamId === userTeam)
    }));

    return {
      competitionName: competition?.name ?? '',
      roundLabel: roundLabel(repository, game),
      games: entries,
      pending: entries.filter((entry) => !entry.played).length,
      resting: isLeagueRound
        ? restingTeams(seasonRepository, game.seasonId, games).map((teamId) => ({
            teamId,
            teamName: repository.teamName(teamId),
            position: positions.get(teamId) ?? null
          }))
        : [],
      mvp: roundMvp(db, repository, games)
    };
  }
}

/**
 * Los equipos de la liga que no juegan en esa jornada: en una liga impar,
 * el que descansa. Los equipos salen del calendario de la temporada y no de la
 * competición, que con los ascensos ya puede tener a otros.
 */
function restingTeams(
  repository: SeasonRepository,
  seasonId: string,
  roundGames: readonly GameRow[]
): string[] {
  const playing = new Set(roundGames.flatMap((row) => [row.homeTeamId, row.awayTeamId]));
  const teams = new Set(
    repository.listRegularGames(seasonId).flatMap((row) => [row.homeTeamId, row.awayTeamId])
  );
  return [...teams].filter((teamId) => !playing.has(teamId)).sort();
}

function previewTeam(
  db: SaveDatabase,
  teamId: string,
  seasonLines: readonly (PlayerBoxScore & { gameId: string; teamId: string })[],
  today: Date
): MatchPreviewTeam {
  const team = db.select().from(teamsTable).where(eq(teamsTable.id, teamId)).get();
  // El cinco se saca de donde lo saca el motor: así la previa no promete un
  // titular que luego no sale, porque está lesionado o con su selección.
  const engineTeam = buildEngineTeam(db, teamId, today);
  const starterIds = [
    ...engineTeam.starters,
    ...engineTeam.players
      .map((player) => player.id)
      .filter((id) => !engineTeam.starters.includes(id))
  ].slice(0, LINEUP_SIZE);

  const lines = seasonLines.filter((line) => line.teamId === teamId);
  const totals = accumulateSeason(lines).filter((entry) => entry.games > 0);
  const rows = playerRows(db, [...starterIds, ...totals.map((entry) => entry.playerId)]);
  const toPlayer = (playerId: string): MatchPreviewPlayer | null => {
    const row = rows.get(playerId);
    if (!row) return null;
    const summary = toPlayerSummary(row, today);
    return {
      playerId,
      playerName: `${row.firstName} ${row.lastName}`,
      nationality: row.nationality,
      position: summary.position,
      overall: summary.overall
    };
  };

  const starters = starterIds
    .map(toPlayer)
    .filter((player): player is MatchPreviewPlayer => player !== null);

  const leader = [...totals].sort(
    (a, b) => efficiencyRating(b.box) / b.games - efficiencyRating(a.box) / a.games
  )[0];
  const leaderPlayer = leader ? toPlayer(leader.playerId) : null;
  const keyPlayer = leaderPlayer
    ? { ...leaderPlayer, averages: averagesOf(leader!.box, leader!.games) }
    : bestByOverall(starters);

  const teamGames = new Set(lines.map((line) => line.gameId)).size;
  const teamBox = lines.reduce((sum, line) => addBoxScores(sum, line), emptyPlayerBoxScore(teamId));

  return {
    teamId,
    teamName: team?.name ?? teamId,
    nationOf: team?.nationalOf ?? null,
    starters,
    averages: teamGames > 0 ? averagesOf(teamBox, teamGames) : null,
    keyPlayer
  };
}

function bestByOverall(starters: readonly MatchPreviewPlayer[]): MatchPreviewTeam['keyPlayer'] {
  const best = [...starters].sort((a, b) => b.overall - a.overall)[0];
  return best ? { ...best, averages: null } : null;
}

function averagesOf(box: PlayerBoxScore, games: number): MatchPreviewAverages {
  return {
    games,
    points: perGame(points(box), games),
    rebounds: perGame(totalRebounds(box), games),
    assists: perGame(box.assists, games),
    steals: perGame(box.steals, games),
    efficiency: perGame(efficiencyRating(box), games)
  };
}

function playerRows(db: SaveDatabase, playerIds: readonly string[]): Map<string, PlayerRow> {
  const unique = [...new Set(playerIds)];
  if (unique.length === 0) {
    return new Map();
  }
  return new Map(
    db
      .select()
      .from(playersTable)
      .where(inArray(playersTable.id, unique))
      .all()
      .map((row) => [row.id, row])
  );
}

/** Los partidos que forman la jornada de uno dado. */
function sameRound(repository: SeasonRepository, game: GameRow): GameRow[] {
  if (!game.seriesId) {
    // En liga, y en Copa o Europa, la ronda es la jornada aunque no caiga
    // toda el mismo día.
    return repository
      .listGamesInRound(game.seasonId, game.round)
      .filter((row) => row.seriesId === null);
  }
  const day = game.scheduledOn.getTime();
  return repository
    .listGames(game.seasonId)
    .filter((row) => row.seriesId !== null && row.scheduledOn.getTime() === day);
}

function standingsPositions(
  resolveDb: () => SaveDatabase,
  competitionId: string
): Map<string, number> {
  try {
    const standings = new SeasonService(resolveDb).getStandings(competitionId);
    return new Map(standings.map((row) => [row.teamId, row.position]));
  } catch {
    // Una liga que ya no se juega (la de un país que se dejó de simular) no
    // tiene tabla: la jornada se enseña igual, sin posiciones.
    return new Map();
  }
}

function roundMvp(
  db: SaveDatabase,
  repository: MatchRepository,
  games: readonly GameRow[]
): RoundMvp | null {
  let best: { line: PlayerBoxScore & { teamId: string }; efficiency: number } | null = null;
  for (const game of games) {
    if (game.homeScore === null) continue;
    for (const line of repository.listBoxScores(game.id)) {
      const efficiency = efficiencyRating(line);
      if (!best || efficiency > best.efficiency) {
        best = { line, efficiency };
      }
    }
  }
  if (!best) {
    return null;
  }

  const row = playerRows(db, [best.line.playerId]).get(best.line.playerId);
  return {
    playerId: best.line.playerId,
    playerName: row ? `${row.firstName} ${row.lastName}` : best.line.playerId,
    nationality: row?.nationality ?? '',
    teamId: best.line.teamId,
    teamName: repository.teamName(best.line.teamId),
    points: points(best.line),
    rebounds: totalRebounds(best.line),
    assists: best.line.assists,
    steals: best.line.steals,
    blocks: best.line.blocks,
    efficiency: best.efficiency
  };
}
