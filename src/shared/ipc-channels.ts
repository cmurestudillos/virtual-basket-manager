/**
 * Único sitio donde se nombran los canales IPC. Main y preload importan de
 * aquí, así que un canal mal escrito es un error de compilación y no un
 * `invoke` que se queda colgado para siempre.
 */
export const IPC_CHANNELS = {
  settingsGet: 'settings:get',
  settingsSet: 'settings:set',
  savesList: 'saves:list',
  savesCreate: 'saves:create',
  savesLoad: 'saves:load',
  savesDelete: 'saves:delete',
  teamsList: 'teams:list',
  teamsGet: 'teams:get',
  teamsListCatalog: 'teams:listCatalog',
  playersListByTeam: 'players:listByTeam',
  playersGet: 'players:get',
  gameStateGet: 'gameState:get',
  seasonGetCurrent: 'season:getCurrent',
  seasonGetStandings: 'season:getStandings',
  seasonListFixtures: 'season:listFixtures',
  seasonListTeamFixtures: 'season:listTeamFixtures',
  seasonGetNextGame: 'season:getNextGame',
  seasonAdvanceDay: 'season:advanceDay',
  seasonAdvanceToNextGame: 'season:advanceToNextGame',
  seasonGetPlayoffs: 'season:getPlayoffs',
  seasonStartNext: 'season:startNext',
  rotationGet: 'rotation:get',
  rotationSave: 'rotation:save',
  rotationAuto: 'rotation:auto',
  tacticsGet: 'tactics:get',
  tacticsSave: 'tactics:save',
  statsTeamSeason: 'stats:teamSeason',
  statsLeaders: 'stats:leaders',
  trainingGetPlan: 'training:getPlan',
  trainingSavePlan: 'training:savePlan',
  matchStart: 'match:start',
  matchAdvancePeriod: 'match:advancePeriod',
  matchGet: 'match:get'
} as const;

export type IpcChannel = (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS];
