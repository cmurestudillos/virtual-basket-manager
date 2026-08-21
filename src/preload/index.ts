import { contextBridge, ipcRenderer } from 'electron';
import { IPC_CHANNELS } from '@shared/ipc-channels';
import type { SettingsApi, SettingsKey } from '@shared/contracts/settings.contract';
import type { CreateSaveRequest, SavesApi, SaveSummary } from '@shared/contracts/saves.contract';
import type { CatalogTeam, TeamSummary, TeamsApi } from '@shared/contracts/teams.contract';
import type { PlayerSummary, PlayersApi } from '@shared/contracts/players.contract';
import type { GameStateApi, ManagedTeamState } from '@shared/contracts/game-state.contract';
import type {
  AdvanceResult,
  FixtureEntry,
  SeasonApi,
  SeasonSummary,
  StandingEntry
} from '@shared/contracts/season.contract';
import type { MatchApi, MatchState } from '@shared/contracts/match.contract';

/**
 * Puente entre renderer y proceso principal.
 *
 * Es deliberadamente tonto: sólo reenvía por el canal correspondiente. Cero
 * lógica aquí — toda la validación vive en los servicios del proceso principal,
 * porque este fichero corre con `contextIsolation` pero sigue estando del lado
 * en el que el usuario podría llegar a inyectar algo.
 */

const settings: SettingsApi = {
  get: (key: SettingsKey) => ipcRenderer.invoke(IPC_CHANNELS.settingsGet, key),
  set: (key: SettingsKey, value: string) => ipcRenderer.invoke(IPC_CHANNELS.settingsSet, key, value)
};

const saves: SavesApi = {
  list: () => ipcRenderer.invoke(IPC_CHANNELS.savesList) as Promise<SaveSummary[]>,
  create: (request: CreateSaveRequest) =>
    ipcRenderer.invoke(IPC_CHANNELS.savesCreate, request) as Promise<SaveSummary>,
  load: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.savesLoad, id) as Promise<SaveSummary>,
  delete: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.savesDelete, id) as Promise<void>
};

const teams: TeamsApi = {
  list: () => ipcRenderer.invoke(IPC_CHANNELS.teamsList) as Promise<TeamSummary[]>,
  get: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.teamsGet, id) as Promise<TeamSummary | null>,
  listCatalog: () => ipcRenderer.invoke(IPC_CHANNELS.teamsListCatalog) as Promise<CatalogTeam[]>
};

const players: PlayersApi = {
  listByTeam: (teamId: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.playersListByTeam, teamId) as Promise<PlayerSummary[]>,
  get: (id: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.playersGet, id) as Promise<PlayerSummary | null>
};

const gameState: GameStateApi = {
  get: () => ipcRenderer.invoke(IPC_CHANNELS.gameStateGet) as Promise<ManagedTeamState | null>
};

const season: SeasonApi = {
  getCurrent: () => ipcRenderer.invoke(IPC_CHANNELS.seasonGetCurrent) as Promise<SeasonSummary>,
  getStandings: () =>
    ipcRenderer.invoke(IPC_CHANNELS.seasonGetStandings) as Promise<StandingEntry[]>,
  listFixtures: (round?: number) =>
    ipcRenderer.invoke(IPC_CHANNELS.seasonListFixtures, round) as Promise<FixtureEntry[]>,
  listTeamFixtures: (teamId: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.seasonListTeamFixtures, teamId) as Promise<FixtureEntry[]>,
  getNextGame: () =>
    ipcRenderer.invoke(IPC_CHANNELS.seasonGetNextGame) as Promise<FixtureEntry | null>,
  advanceDay: () => ipcRenderer.invoke(IPC_CHANNELS.seasonAdvanceDay) as Promise<AdvanceResult>,
  advanceToNextGame: () =>
    ipcRenderer.invoke(IPC_CHANNELS.seasonAdvanceToNextGame) as Promise<AdvanceResult>
};

const match: MatchApi = {
  start: (gameId: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.matchStart, gameId) as Promise<MatchState>,
  advancePeriod: (gameId: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.matchAdvancePeriod, gameId) as Promise<MatchState>,
  get: (gameId: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.matchGet, gameId) as Promise<MatchState | null>
};

export const api = { settings, saves, teams, players, gameState, season, match };

contextBridge.exposeInMainWorld('api', api);
