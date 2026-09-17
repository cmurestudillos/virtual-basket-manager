import type { MatchScouting } from '@shared/contracts/match.contract';
import { analystRevealsRival } from '@shared/domain/staff';
import {
  DEFENSIVE_SYSTEM_LABELS,
  OFFENSIVE_SYSTEM_LABELS,
  type DefensiveSystem,
  type OffensiveSystem
} from '@shared/domain/tactics';
import type { SaveDatabase } from '../../database/save-database';
import { StaffService } from '../staff/staff.service';
import { MatchRepository } from './match.repository';

/**
 * Lo que el analista del usuario sabe de otro equipo: su pizarra.
 *
 * Nació dentro del partido (la previa del rival) y salió aquí cuando la ficha
 * de cualquier club tuvo que enseñar lo mismo: si cada pantalla decidiera por
 * su cuenta cuándo se ve la pizarra ajena, en una se vería con un aprendiz y en
 * la otra no.
 */

/** Si el analista del club del usuario llega para contar la pizarra de otro. */
export function analystReportsRivals(db: SaveDatabase, managedTeamId: string | null): boolean {
  if (!managedTeamId) {
    return false;
  }
  return analystRevealsRival(new StaffService(() => db).levels(managedTeamId).analyst);
}

/**
 * La pizarra de un rival contada por el analista: sistemas, ritmo, intensidad
 * y a quién van a buscar. `null` sin analista —o con uno de aprendiz— y si el
 * equipo no tiene pizarra guardada.
 */
export function scoutRivalTactics(
  db: SaveDatabase,
  managedTeamId: string | null,
  rivalId: string
): MatchScouting | null {
  if (!analystReportsRivals(db, managedTeamId)) {
    return null;
  }
  return describeTactics(db, rivalId);
}

/** La pizarra de un equipo en palabras, sin mirar quién la pide. */
export function describeTactics(db: SaveDatabase, teamId: string): MatchScouting | null {
  const repository = new MatchRepository(db);
  const tactics = repository.teamTactics(teamId);
  if (!tactics) {
    return null;
  }

  return {
    teamId,
    teamName: repository.teamName(teamId),
    offensiveSystem: OFFENSIVE_SYSTEM_LABELS[tactics.offensiveSystem as OffensiveSystem],
    defensiveSystem: DEFENSIVE_SYSTEM_LABELS[tactics.defensiveSystem as DefensiveSystem],
    pace: tactics.pace,
    defensiveIntensity: tactics.defensiveIntensity,
    focusPlayerName: tactics.focusPlayerId ? repository.playerName(tactics.focusPlayerId) : null
  };
}
