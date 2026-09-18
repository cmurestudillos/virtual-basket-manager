import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '@shared/ipc-channels';
import type { CoachRankingRequest } from '@shared/contracts/coaches.contract';
import { requireActiveSaveDatabase } from '../../database/resolve-save-database';
import { CoachService } from './coaches.service';

export function registerCoachesIpcHandlers(): void {
  const service = new CoachService(requireActiveSaveDatabase);

  ipcMain.handle(IPC_CHANNELS.coachesRanking, (_event, request: CoachRankingRequest) =>
    service.ranking(request)
  );
  ipcMain.handle(IPC_CHANNELS.coachesGetProfile, (_event, coachId: string | null) =>
    service.getProfile(coachId)
  );
}
