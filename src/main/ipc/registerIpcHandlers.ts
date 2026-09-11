import { registerSettingsIpcHandlers } from '../features/settings/settings.ipc-handler';
import { registerSavesIpcHandlers } from '../features/saves/saves.ipc-handler';
import { registerTeamsIpcHandlers } from '../features/teams/teams.ipc-handler';
import { registerPlayersIpcHandlers } from '../features/players/players.ipc-handler';
import { registerGameStateIpcHandlers } from '../features/game-state/game-state.ipc-handler';
import { registerSeasonIpcHandlers } from '../features/season/season.ipc-handler';
import { registerRotationIpcHandlers } from '../features/rotation/rotation.ipc-handler';
import { registerTacticsIpcHandlers } from '../features/tactics/tactics.ipc-handler';
import { registerStatsIpcHandlers } from '../features/stats/stats.ipc-handler';
import { registerMatchIpcHandlers } from '../features/match/match.ipc-handler';

/**
 * Único punto donde se cablean los handlers IPC de cada feature. Una línea por
 * feature; esta agregación no lleva lógica de negocio.
 */
export function registerIpcHandlers(): void {
  registerSettingsIpcHandlers();
  registerSavesIpcHandlers();
  registerTeamsIpcHandlers();
  registerPlayersIpcHandlers();
  registerGameStateIpcHandlers();
  registerSeasonIpcHandlers();
  registerRotationIpcHandlers();
  registerTacticsIpcHandlers();
  registerStatsIpcHandlers();
  registerMatchIpcHandlers();
}
