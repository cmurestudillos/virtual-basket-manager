import type { SettingsApi } from '@shared/contracts/settings.contract';
import type { SavesApi } from '@shared/contracts/saves.contract';
import type { TeamsApi } from '@shared/contracts/teams.contract';
import type { PlayersApi } from '@shared/contracts/players.contract';
import type { GameStateApi } from '@shared/contracts/game-state.contract';

export interface VbmApi {
  settings: SettingsApi;
  saves: SavesApi;
  teams: TeamsApi;
  players: PlayersApi;
  gameState: GameStateApi;
}

declare global {
  interface Window {
    api: VbmApi;
  }
}

export {};
