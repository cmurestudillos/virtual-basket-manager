import type { PromotionEntry } from '@shared/contracts/history.contract';
import { PROMOTION_SLOTS, RELEGATION_SLOTS } from '@shared/domain/promotion';
import { computeStandings } from '@shared/domain/standings';
import type { CompetitionRow, SeasonRow } from '../../database/schema/save';
import type { HistoryRepository } from './history.repository';

/**
 * Los ascensos de un club en la partida (trofeos, 2026-09-29).
 *
 * No se guardan: salen de las clasificaciones, igual que el palmarés sale de
 * los campeones. Un ascenso es acabar una división **terminada** en puesto de
 * subir, con otra por encima en su país ese mismo curso y fuera de la liga
 * americana, que es cerrada. Es la misma cuenta que `divisionSwap` hace en
 * septiembre, sólo que se sabe desde el día que acaba la liga —cuando sale la
 * pantalla del ascenso— y vale igual para partidas viejas.
 *
 * `teamOf` dice qué club se mira cada curso: el propio en el historial (que en
 * carrera cambia) o uno fijo en la ficha de cualquier club.
 */
export function promotionsOf(
  repository: HistoryRepository,
  teamOf: (seasonNumber: number) => string | null
): PromotionEntry[] {
  const competitions = repository.competitions();
  const seasons = repository.seasons();
  const promotions: PromotionEntry[] = [];

  for (const season of seasons) {
    const competition = competitions.get(season.competitionId);
    const teamId = teamOf(season.seasonNumber);
    if (
      !teamId ||
      !competition ||
      competition.format !== 'league' ||
      competition.tier <= 1 ||
      season.stage !== 'finished'
    ) {
      continue;
    }

    const upper = upperLeague(seasons, competitions, competition, season.seasonNumber);
    if (!upper || upper.competition.nbaFormat || competition.nbaFormat) {
      continue;
    }

    const lowerTeams = repository.teamIdsInSeason(season.id);
    if (!lowerTeams.includes(teamId)) {
      continue;
    }
    const standings = computeStandings(
      lowerTeams,
      repository.playedRegularGames(season.id).map((game) => ({
        homeTeamId: game.homeTeamId,
        awayTeamId: game.awayTeamId,
        homeScore: game.homeScore as number,
        awayScore: game.awayScore as number
      }))
    );
    const slots = Math.min(
      PROMOTION_SLOTS,
      RELEGATION_SLOTS,
      repository.teamIdsInSeason(upper.season.id).length,
      lowerTeams.length
    );
    const position = standings.find((row) => row.teamId === teamId)?.position ?? Infinity;
    if (position <= slots) {
      promotions.push({
        seasonNumber: season.seasonNumber,
        years: `${season.startYear}-${String((season.startYear + 1) % 100).padStart(2, '0')}`,
        fromCompetitionName: competition.name,
        toCompetitionName: upper.competition.name
      });
    }
  }

  return promotions.sort((a, b) => b.seasonNumber - a.seasonNumber);
}

/** La división de encima en el mismo país y el mismo curso, si se jugó. */
function upperLeague(
  seasons: readonly SeasonRow[],
  competitions: ReadonlyMap<string, CompetitionRow>,
  competition: CompetitionRow,
  seasonNumber: number
): { season: SeasonRow; competition: CompetitionRow } | null {
  for (const season of seasons) {
    const candidate = competitions.get(season.competitionId);
    if (
      season.seasonNumber === seasonNumber &&
      candidate &&
      candidate.format === 'league' &&
      candidate.country === competition.country &&
      candidate.tier === competition.tier - 1
    ) {
      return { season, competition: candidate };
    }
  }
  return null;
}
