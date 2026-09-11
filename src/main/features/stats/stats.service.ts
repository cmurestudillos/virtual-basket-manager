import {
  leadersRequestSchema,
  type LeaderBoard,
  type PlayerSeasonStats
} from '@shared/contracts/stats.contract';
import { teamIdRequestSchema } from '@shared/contracts/rotation.contract';
import {
  efficiencyRating,
  percentage,
  points,
  totalRebounds,
  type PlayerBoxScore
} from '@shared/domain/box-score';
import {
  LEADER_CATEGORY_LABELS,
  accumulateSeason,
  categoryAverage,
  minimumGamesForLeaders,
  perGame,
  rankLeaders,
  type SeasonTotals
} from '@shared/domain/season-stats';
import type { SaveDatabase } from '../../database/save-database';
import { SeasonService } from '../season/season.service';
import { StatsRepository, type PlayerCard } from './stats.repository';

/**
 * Estadísticas de temporada.
 *
 * No hay ninguna tabla de medias: se suman las actas y se divide al leer. Con
 * una liga de 18 equipos son unas siete mil filas por temporada, que se recorren
 * en un suspiro, y a cambio no existe la clase de error más aburrida de este
 * tipo de juegos — la media que se quedó vieja porque alguien olvidó
 * actualizarla al guardar un partido.
 */
export class StatsService {
  private readonly seasonService: SeasonService;

  /** Ver el porqué del resolutor en {@link SeasonService}. */
  constructor(private readonly resolveDb: () => SaveDatabase) {
    this.seasonService = new SeasonService(resolveDb);
  }

  /** Medias de una plantilla, ordenadas por valoración, como en una ficha de equipo. */
  teamSeason(teamId: string): PlayerSeasonStats[] {
    const validated = teamIdRequestSchema.parse({ teamId });
    const repository = new StatsRepository(this.resolveDb());
    const seasonId = this.seasonService.getCurrent().id;

    const lines = repository.listSeasonLines(seasonId, validated.teamId);
    return this.toStats(repository, accumulateSeason(lines)).sort(
      (a, b) => b.efficiencyPerGame - a.efficiencyPerGame || b.minutesPerGame - a.minutesPerGame
    );
  }

  leaders(category: string, limit?: number): LeaderBoard {
    const validated = leadersRequestSchema.parse({ category, limit });
    const repository = new StatsRepository(this.resolveDb());
    const seasonId = this.seasonService.getCurrent().id;

    // El mínimo se mide contra el equipo que más ha jugado: con jornadas
    // aplazadas no todos llevan los mismos partidos, y el listón de la liga es
    // uno solo para todos.
    const played = repository.gamesPlayedByTeam(seasonId);
    const teamGames = Math.max(0, ...played.values());
    const minimumGames = minimumGamesForLeaders(teamGames);

    const totals = accumulateSeason(repository.listSeasonLines(seasonId));
    const ranked = rankLeaders(totals, validated.category, {
      minimumGames,
      limit: validated.limit
    });
    const stats = new Map(this.toStats(repository, ranked).map((entry) => [entry.playerId, entry]));

    return {
      category: validated.category,
      label: LEADER_CATEGORY_LABELS[validated.category],
      minimumGames,
      entries: ranked.map((totalsEntry, index) => ({
        rank: index + 1,
        value: categoryAverage(totalsEntry, validated.category),
        player: stats.get(totalsEntry.playerId) as PlayerSeasonStats
      }))
    };
  }

  // ------------------------------------------------------------------------

  private toStats(
    repository: StatsRepository,
    totals: readonly SeasonTotals[]
  ): PlayerSeasonStats[] {
    const cards = repository.playerCards();
    const teamNames = repository.teamNames();

    return totals.map((entry) => toPlayerSeasonStats(entry, cards.get(entry.playerId), teamNames));
  }
}

function toPlayerSeasonStats(
  totals: SeasonTotals,
  card: PlayerCard | undefined,
  teamNames: ReadonlyMap<string, string>
): PlayerSeasonStats {
  const box: PlayerBoxScore = totals.box;
  const teamId = card?.teamId ?? '';

  return {
    playerId: totals.playerId,
    playerName: card?.name ?? totals.playerId,
    teamId,
    teamName: teamNames.get(teamId) ?? '—',
    position: card?.position ?? 'SF',
    games: totals.games,
    minutesPerGame: perGame(box.secondsPlayed / 60, totals.games),
    pointsPerGame: perGame(points(box), totals.games),
    reboundsPerGame: perGame(totalRebounds(box), totals.games),
    assistsPerGame: perGame(box.assists, totals.games),
    stealsPerGame: perGame(box.steals, totals.games),
    blocksPerGame: perGame(box.blocks, totals.games),
    turnoversPerGame: perGame(box.turnovers, totals.games),
    efficiencyPerGame: perGame(efficiencyRating(box), totals.games),
    points: points(box),
    rebounds: totalRebounds(box),
    assists: box.assists,
    steals: box.steals,
    blocks: box.blocks,
    turnovers: box.turnovers,
    fouls: box.fouls,
    plusMinus: box.plusMinus,
    twoPointMade: box.twoPointMade,
    twoPointAttempted: box.twoPointAttempted,
    threePointMade: box.threePointMade,
    threePointAttempted: box.threePointAttempted,
    freeThrowMade: box.freeThrowMade,
    freeThrowAttempted: box.freeThrowAttempted,
    twoPointPercentage: percentage(box.twoPointMade, box.twoPointAttempted),
    threePointPercentage: percentage(box.threePointMade, box.threePointAttempted),
    freeThrowPercentage: percentage(box.freeThrowMade, box.freeThrowAttempted)
  };
}
