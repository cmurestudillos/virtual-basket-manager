import type { CareerSeasonRecord } from '@shared/domain/career';
import { computeStandings } from '@shared/domain/standings';
import type { SaveDatabase } from '../../database/save-database';
import type { CareerSpellRow } from '../../database/schema/save';
import { HistoryRepository } from '../history/history.repository';
import { CareerRepository } from './career.repository';

/**
 * Las temporadas dirigidas por el usuario, que es lo que valora el dominio.
 *
 * Vive fuera de {@link CareerService} porque la lee también el ranking de
 * entrenadores: la reputación del usuario es la misma en su ficha, en la
 * cabecera y en la tabla, juegue en carrera o en modo mánager.
 *
 * Sin etapas guardadas —una partida de antes del modo carrera— se da por hecho
 * que siempre dirigió al club de hoy, que es justo lo que pasaba.
 */
export function managerSeasonRecords(db: SaveDatabase): CareerSeasonRecord[] {
  const repository = new CareerRepository(db);
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
    const standing = positionOf(history, season.id, teamId);
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
export function positionOf(
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

/** Si una temporada cae dentro de una etapa. */
export function withinSpell(spell: CareerSpellRow, seasonNumber: number): boolean {
  return seasonNumber >= spell.startSeason && seasonNumber <= (spell.endSeason ?? Infinity);
}

/** Qué club dirigía el entrenador en una temporada dada. */
export function teamManagedIn(
  spells: readonly CareerSpellRow[],
  seasonNumber: number,
  fallback: string | null
): string | null {
  if (spells.length === 0) {
    return fallback;
  }
  return spells.find((spell) => withinSpell(spell, seasonNumber))?.teamId ?? null;
}
