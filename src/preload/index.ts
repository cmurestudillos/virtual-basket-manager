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
  PlayoffBracket,
  SeasonApi,
  SeasonSummary,
  StandingEntry
} from '@shared/contracts/season.contract';
import type { MatchApi, MatchState } from '@shared/contracts/match.contract';
import type {
  RotationApi,
  SaveRotationRequest,
  TeamRotation
} from '@shared/contracts/rotation.contract';
import type {
  SaveTacticsRequest,
  TacticsApi,
  TeamTacticsView
} from '@shared/contracts/tactics.contract';
import type { LeaderBoard, PlayerSeasonStats, StatsApi } from '@shared/contracts/stats.contract';
import type {
  SaveTrainingPlanRequest,
  TeamTrainingPlan,
  TrainingApi
} from '@shared/contracts/training.contract';
import type { StaffApi, StaffRequest, TeamStaff } from '@shared/contracts/staff.contract';
import type {
  ContractEntry,
  LoanEntry,
  LoanRequest,
  MarketApi,
  MarketOfferResult,
  MarketPlayer,
  MarketSearchRequest,
  MarketStatus,
  OfferRequest,
  RenewRequest
} from '@shared/contracts/market.contract';
import type {
  PromotePlayerRequest,
  UpgradeYouthRequest,
  YouthAcademy,
  YouthApi
} from '@shared/contracts/youth.contract';
import type {
  BoardView,
  ClubApi,
  ClubFinances,
  ExpandArenaRequest,
  SetTicketPriceRequest
} from '@shared/contracts/club.contract';

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
    ipcRenderer.invoke(IPC_CHANNELS.seasonAdvanceToNextGame) as Promise<AdvanceResult>,
  getPlayoffs: () =>
    ipcRenderer.invoke(IPC_CHANNELS.seasonGetPlayoffs) as Promise<PlayoffBracket | null>,
  startNextSeason: () => ipcRenderer.invoke(IPC_CHANNELS.seasonStartNext) as Promise<SeasonSummary>
};

const rotation: RotationApi = {
  get: (teamId: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.rotationGet, teamId) as Promise<TeamRotation>,
  save: (request: SaveRotationRequest) =>
    ipcRenderer.invoke(IPC_CHANNELS.rotationSave, request) as Promise<TeamRotation>,
  auto: (teamId: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.rotationAuto, teamId) as Promise<TeamRotation>
};

const tactics: TacticsApi = {
  get: (teamId: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.tacticsGet, teamId) as Promise<TeamTacticsView>,
  save: (request: SaveTacticsRequest) =>
    ipcRenderer.invoke(IPC_CHANNELS.tacticsSave, request) as Promise<TeamTacticsView>
};

const stats: StatsApi = {
  teamSeason: (teamId: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.statsTeamSeason, teamId) as Promise<PlayerSeasonStats[]>,
  leaders: (category: string, limit?: number) =>
    ipcRenderer.invoke(IPC_CHANNELS.statsLeaders, category, limit) as Promise<LeaderBoard>
};

const training: TrainingApi = {
  getPlan: (teamId: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.trainingGetPlan, teamId) as Promise<TeamTrainingPlan>,
  savePlan: (request: SaveTrainingPlanRequest) =>
    ipcRenderer.invoke(IPC_CHANNELS.trainingSavePlan, request) as Promise<TeamTrainingPlan>
};

const club: ClubApi = {
  getFinances: (teamId: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.clubGetFinances, teamId) as Promise<ClubFinances>,
  setTicketPrice: (request: SetTicketPriceRequest) =>
    ipcRenderer.invoke(IPC_CHANNELS.clubSetTicketPrice, request) as Promise<ClubFinances>,
  expandArena: (request: ExpandArenaRequest) =>
    ipcRenderer.invoke(IPC_CHANNELS.clubExpandArena, request) as Promise<ClubFinances>,
  getBoard: () => ipcRenderer.invoke(IPC_CHANNELS.clubGetBoard) as Promise<BoardView>
};

const staff: StaffApi = {
  get: (teamId: string) => ipcRenderer.invoke(IPC_CHANNELS.staffGet, teamId) as Promise<TeamStaff>,
  hire: (request: StaffRequest) =>
    ipcRenderer.invoke(IPC_CHANNELS.staffHire, request) as Promise<TeamStaff>,
  fire: (request: StaffRequest) =>
    ipcRenderer.invoke(IPC_CHANNELS.staffFire, request) as Promise<TeamStaff>
};

const youth: YouthApi = {
  get: (teamId: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.youthGet, teamId) as Promise<YouthAcademy>,
  promote: (request: PromotePlayerRequest) =>
    ipcRenderer.invoke(IPC_CHANNELS.youthPromote, request) as Promise<YouthAcademy>,
  upgrade: (request: UpgradeYouthRequest) =>
    ipcRenderer.invoke(IPC_CHANNELS.youthUpgrade, request) as Promise<YouthAcademy>
};

const market: MarketApi = {
  getStatus: () => ipcRenderer.invoke(IPC_CHANNELS.marketGetStatus) as Promise<MarketStatus>,
  search: (request: MarketSearchRequest) =>
    ipcRenderer.invoke(IPC_CHANNELS.marketSearch, request) as Promise<MarketPlayer[]>,
  offer: (request: OfferRequest) =>
    ipcRenderer.invoke(IPC_CHANNELS.marketOffer, request) as Promise<MarketOfferResult>,
  listContracts: () =>
    ipcRenderer.invoke(IPC_CHANNELS.marketListContracts) as Promise<ContractEntry[]>,
  renew: (request: RenewRequest) =>
    ipcRenderer.invoke(IPC_CHANNELS.marketRenew, request) as Promise<ContractEntry[]>,
  release: (request: { playerId: string }) =>
    ipcRenderer.invoke(IPC_CHANNELS.marketRelease, request) as Promise<ContractEntry[]>,
  listLoans: () => ipcRenderer.invoke(IPC_CHANNELS.marketListLoans) as Promise<LoanEntry[]>,
  loanOut: (request: LoanRequest) =>
    ipcRenderer.invoke(IPC_CHANNELS.marketLoanOut, request) as Promise<MarketOfferResult>,
  loanIn: (request: LoanRequest) =>
    ipcRenderer.invoke(IPC_CHANNELS.marketLoanIn, request) as Promise<MarketOfferResult>
};

const match: MatchApi = {
  start: (gameId: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.matchStart, gameId) as Promise<MatchState>,
  advancePeriod: (gameId: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.matchAdvancePeriod, gameId) as Promise<MatchState>,
  get: (gameId: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.matchGet, gameId) as Promise<MatchState | null>
};

export const api = {
  settings,
  saves,
  teams,
  players,
  gameState,
  season,
  rotation,
  tactics,
  stats,
  training,
  club,
  staff,
  youth,
  market,
  match
};

contextBridge.exposeInMainWorld('api', api);
