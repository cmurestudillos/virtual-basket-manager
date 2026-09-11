import type { SettingsApi } from '@shared/contracts/settings.contract';
import type { SavesApi } from '@shared/contracts/saves.contract';
import type { TeamsApi } from '@shared/contracts/teams.contract';
import type { PlayersApi } from '@shared/contracts/players.contract';
import type { GameStateApi } from '@shared/contracts/game-state.contract';
import type { SeasonApi } from '@shared/contracts/season.contract';
import type { MatchApi } from '@shared/contracts/match.contract';
import type { RotationApi } from '@shared/contracts/rotation.contract';
import type { TacticsApi } from '@shared/contracts/tactics.contract';
import type { StatsApi } from '@shared/contracts/stats.contract';

export interface VbmApi {
  settings: SettingsApi;
  saves: SavesApi;
  teams: TeamsApi;
  players: PlayersApi;
  gameState: GameStateApi;
  season: SeasonApi;
  rotation: RotationApi;
  tactics: TacticsApi;
  stats: StatsApi;
  match: MatchApi;
}

declare global {
  interface Window {
    api: VbmApi;
  }
}

export {};
