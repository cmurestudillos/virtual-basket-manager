import type { SettingsApi } from '@shared/contracts/settings.contract';
import type { SavesApi } from '@shared/contracts/saves.contract';
import type { TeamsApi } from '@shared/contracts/teams.contract';
import type { PlayersApi } from '@shared/contracts/players.contract';
import type { GameStateApi } from '@shared/contracts/game-state.contract';
import type { SeasonApi } from '@shared/contracts/season.contract';
// Calendario mensual (fase 5).
import type { CalendarApi } from '@shared/contracts/calendar.contract';
// Entrenadores y ranking (fase 5).
import type { CoachesApi } from '@shared/contracts/coaches.contract';
import type { MatchApi } from '@shared/contracts/match.contract';
import type { RotationApi } from '@shared/contracts/rotation.contract';
import type { TacticsApi } from '@shared/contracts/tactics.contract';
import type { StatsApi } from '@shared/contracts/stats.contract';
import type { TrainingApi } from '@shared/contracts/training.contract';
import type { ClubApi } from '@shared/contracts/club.contract';
import type { StaffApi } from '@shared/contracts/staff.contract';
import type { YouthApi } from '@shared/contracts/youth.contract';
import type { MarketApi } from '@shared/contracts/market.contract';
import type { HistoryApi } from '@shared/contracts/history.contract';
import type { CareerApi } from '@shared/contracts/career.contract';
import type { NationalApi } from '@shared/contracts/national.contract';
import type { DraftApi } from '@shared/contracts/draft.contract';
import type { InboxApi } from '@shared/contracts/inbox.contract';
import type { WorldEditorApi } from '@shared/contracts/world-editor.contract';
import type { UpdatesApi } from '@shared/contracts/updates.contract';

export interface VbmApi {
  settings: SettingsApi;
  saves: SavesApi;
  teams: TeamsApi;
  players: PlayersApi;
  gameState: GameStateApi;
  season: SeasonApi;
  calendar: CalendarApi;
  coaches: CoachesApi;
  rotation: RotationApi;
  tactics: TacticsApi;
  stats: StatsApi;
  training: TrainingApi;
  club: ClubApi;
  staff: StaffApi;
  youth: YouthApi;
  market: MarketApi;
  match: MatchApi;
  history: HistoryApi;
  career: CareerApi;
  national: NationalApi;
  draft: DraftApi;
  inbox: InboxApi;
  editor: WorldEditorApi;
  updates: UpdatesApi;
}

declare global {
  interface Window {
    api: VbmApi;
  }
}

export {};
