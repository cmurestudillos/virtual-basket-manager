import { eq } from 'drizzle-orm';
import type { ManagedTeamState } from '@shared/contracts/game-state.contract';
import { requireActiveSaveDatabase } from '../../database/resolve-save-database';
import { gameStateTable, teamsTable } from '../../database/schema/save';

/**
 * Estado global de la partida cargada: quién dirige, a quién, en qué fecha del
 * juego y en qué temporada. Es lo primero que consulta la interfaz al entrar y
 * lo que alimenta la cabecera de todas las pantallas.
 */
export class InvalidNationalityError extends Error {
  constructor(code: string) {
    super(`${code} no es una nacionalidad válida`);
    this.name = 'InvalidNationalityError';
  }
}

export class GameStateService {
  /**
   * La nacionalidad del entrenador. Es cosa del usuario, no del mundo: se
   * puede corregir en cualquier momento, y las partidas de antes de que
   * existiera la tomaron del país del club.
   */
  setManagerNationality(code: string): ManagedTeamState | null {
    const normalized = code.trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(normalized)) {
      throw new InvalidNationalityError(code);
    }
    requireActiveSaveDatabase()
      .update(gameStateTable)
      .set({ managerNationality: normalized })
      .run();
    return this.get();
  }

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
      managerNationality: state.managerNationality,
      currentDate: state.currentDate.getTime(),
      seasonNumber: state.seasonNumber
    };
  }
}
