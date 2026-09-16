import { contextBridge, ipcRenderer } from 'electron';
import { IPC_CHANNELS } from '@shared/ipc-channels';
import type { SettingsApi, SettingsKey } from '@shared/contracts/settings.contract';
import type { CreateSaveRequest, SavesApi, SaveSummary } from '@shared/contracts/saves.contract';
import type {
  CatalogLeague,
  CatalogScope,
  CatalogTeam,
  TeamSummary,
  TeamsApi
} from '@shared/contracts/teams.contract';
import type { PlayerSummary, PlayersApi } from '@shared/contracts/players.contract';
import type { GameStateApi, ManagedTeamState } from '@shared/contracts/game-state.contract';
import type {
  AdvanceResult,
  ContinentalSummary,
  ContinentalView,
  CupBracket,
  FixtureEntry,
  LeagueEntry,
  PlayoffBracket,
  SeasonApi,
  SeasonSummary,
  StandingEntry
} from '@shared/contracts/season.contract';
import type { HistoryApi, HistoryView } from '@shared/contracts/history.contract';
import type { CareerApi, CareerStatus } from '@shared/contracts/career.contract';
import type { InboxApi, InboxView, PressConference } from '@shared/contracts/inbox.contract';
import type { UpdatesApi, UpdatesView } from '@shared/contracts/updates.contract';
import type {
  EditorOverview,
  EditorResult,
  EditorTeam,
  PlayerPatch,
  TeamPatch,
  WorldEditorApi
} from '@shared/contracts/world-editor.contract';
import type { PressTone } from '@shared/domain/press';
import type {
  LiveOrderResult,
  LiveTacticsPatch,
  LiveTick,
  MatchApi,
  MatchState
} from '@shared/contracts/match.contract';
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
  listCatalog: () => ipcRenderer.invoke(IPC_CHANNELS.teamsListCatalog) as Promise<CatalogTeam[]>,
  listLeagues: () => ipcRenderer.invoke(IPC_CHANNELS.teamsListLeagues) as Promise<CatalogLeague[]>,
  listScope: () => ipcRenderer.invoke(IPC_CHANNELS.teamsListScope) as Promise<CatalogScope>
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
  getStandings: (competitionId?: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.seasonGetStandings, competitionId) as Promise<StandingEntry[]>,
  listLeagues: () => ipcRenderer.invoke(IPC_CHANNELS.seasonListLeagues) as Promise<LeagueEntry[]>,
  listFixtures: (round?: number, competitionId?: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.seasonListFixtures, round, competitionId) as Promise<
      FixtureEntry[]
    >,
  listTeamFixtures: (teamId: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.seasonListTeamFixtures, teamId) as Promise<FixtureEntry[]>,
  getNextGame: () =>
    ipcRenderer.invoke(IPC_CHANNELS.seasonGetNextGame) as Promise<FixtureEntry | null>,
  advanceDay: () => ipcRenderer.invoke(IPC_CHANNELS.seasonAdvanceDay) as Promise<AdvanceResult>,
  advanceToNextGame: () =>
    ipcRenderer.invoke(IPC_CHANNELS.seasonAdvanceToNextGame) as Promise<AdvanceResult>,
  getPlayoffs: (competitionId?: string) =>
    ipcRenderer.invoke(
      IPC_CHANNELS.seasonGetPlayoffs,
      competitionId
    ) as Promise<PlayoffBracket | null>,
  getCup: (country?: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.seasonGetCup, country) as Promise<CupBracket | null>,
  listContinental: () =>
    ipcRenderer.invoke(IPC_CHANNELS.seasonListContinental) as Promise<ContinentalSummary[]>,
  getContinental: (competitionId?: string) =>
    ipcRenderer.invoke(
      IPC_CHANNELS.seasonGetContinental,
      competitionId
    ) as Promise<ContinentalView | null>,
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
    ipcRenderer.invoke(IPC_CHANNELS.matchGet, gameId) as Promise<MatchState | null>,
  snapshot: (gameId: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.matchSnapshot, gameId) as Promise<MatchState | null>,
  advancePossession: (gameId: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.matchAdvancePossession, gameId) as Promise<LiveTick>,
  substitute: (gameId: string, outgoingId: string, incomingId: string) =>
    ipcRenderer.invoke(
      IPC_CHANNELS.matchSubstitute,
      gameId,
      outgoingId,
      incomingId
    ) as Promise<LiveOrderResult>,
  callTimeout: (gameId: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.matchTimeout, gameId) as Promise<LiveOrderResult>,
  setLiveTactics: (gameId: string, patch: LiveTacticsPatch) =>
    ipcRenderer.invoke(IPC_CHANNELS.matchLiveTactics, gameId, patch) as Promise<LiveOrderResult>,
  setAutoRotation: (gameId: string, enabled: boolean) =>
    ipcRenderer.invoke(IPC_CHANNELS.matchAutoRotation, gameId, enabled) as Promise<LiveOrderResult>
};

const career: CareerApi = {
  getStatus: () => ipcRenderer.invoke(IPC_CHANNELS.careerGetStatus) as Promise<CareerStatus>,
  accept: (teamId: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.careerAccept, teamId) as Promise<CareerStatus>,
  resign: () => ipcRenderer.invoke(IPC_CHANNELS.careerResign) as Promise<CareerStatus>,
  wait: () => ipcRenderer.invoke(IPC_CHANNELS.careerWait) as Promise<CareerStatus>
};

const inbox: InboxApi = {
  get: () => ipcRenderer.invoke(IPC_CHANNELS.inboxGet) as Promise<InboxView>,
  unreadCount: () => ipcRenderer.invoke(IPC_CHANNELS.inboxUnreadCount) as Promise<number>,
  markRead: (id: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.inboxMarkRead, id) as Promise<InboxView>,
  markAllRead: () => ipcRenderer.invoke(IPC_CHANNELS.inboxMarkAllRead) as Promise<InboxView>,
  getPress: (id: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.inboxGetPress, id) as Promise<PressConference | null>,
  answerPress: (id: string, tone: PressTone) =>
    ipcRenderer.invoke(IPC_CHANNELS.inboxAnswerPress, id, tone) as Promise<PressConference>
};

const editor: WorldEditorApi = {
  overview: () => ipcRenderer.invoke(IPC_CHANNELS.editorOverview) as Promise<EditorOverview>,
  team: (teamId: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.editorTeam, teamId) as Promise<EditorTeam | null>,
  updateTeam: (teamId: string, patch: TeamPatch) =>
    ipcRenderer.invoke(IPC_CHANNELS.editorUpdateTeam, teamId, patch) as Promise<
      EditorResult<EditorTeam>
    >,
  updatePlayer: (playerId: string, patch: PlayerPatch) =>
    ipcRenderer.invoke(IPC_CHANNELS.editorUpdatePlayer, playerId, patch) as Promise<
      EditorResult<EditorTeam>
    >,
  movePlayer: (playerId: string, toTeamId: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.editorMovePlayer, playerId, toTeamId) as Promise<
      EditorResult<EditorTeam>
    >,
  resetTeam: (teamId: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.editorResetTeam, teamId) as Promise<EditorResult<EditorTeam>>,
  resetAll: () => ipcRenderer.invoke(IPC_CHANNELS.editorResetAll) as Promise<EditorOverview>
};

const updates: UpdatesApi = {
  get: () => ipcRenderer.invoke(IPC_CHANNELS.updatesGet) as Promise<UpdatesView>,
  check: () => ipcRenderer.invoke(IPC_CHANNELS.updatesCheck) as Promise<UpdatesView>,
  install: () => ipcRenderer.invoke(IPC_CHANNELS.updatesInstall) as Promise<void>,
  onChange: (listener: (view: UpdatesView) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, view: UpdatesView): void => listener(view);
    ipcRenderer.on(IPC_CHANNELS.updatesChanged, handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.updatesChanged, handler);
  }
};

const history: HistoryApi = {
  get: () => ipcRenderer.invoke(IPC_CHANNELS.historyGet) as Promise<HistoryView>
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
  match,
  history,
  career,
  inbox,
  editor,
  updates
};

contextBridge.exposeInMainWorld('api', api);
