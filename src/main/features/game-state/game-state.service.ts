import { eq } from 'drizzle-orm';
import type { ManagedTeamState } from '@shared/contracts/game-state.contract';
import { requireActiveSaveDatabase } from '../../database/resolve-save-database';
import { gameStateTable, teamsTable } from '../../database/schema/save';

/**
 * Estado global de la partida cargada: quién dirige, a quién, en qué fecha del
 * juego y en qué temporada. Es lo primero que consulta la interfaz al entrar y
 * lo que alimenta la cabecera de todas las pantallas.
 */
export class GameStateService {
  get(): ManagedTeamState | null {
    const db = requireActiveSaveDatabase();
    const state = db.select().from(gameStateTable).get();
    if (!state?.managedTeamId) {
      return null;
    }

    const team = db.select().from(teamsTable).where(eq(teamsTable.id, state.managedTeamId)).get();
    if (!team) {
      return null;
    }

    return {
      teamId: team.id,
      teamName: team.name,
      managerName: state.managerName,
      currentDate: state.currentDate.getTime(),
      seasonNumber: state.seasonNumber
    };
  }
}
