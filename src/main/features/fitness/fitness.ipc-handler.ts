import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '@shared/ipc-channels';
import type { SaveTrainingPlanRequest } from '@shared/contracts/training.contract';
import { requireActiveSaveDatabase } from '../../database/resolve-save-database';
import { FitnessService } from './fitness.service';

export function registerFitnessIpcHandlers(): void {
  const service = new FitnessService(requireActiveSaveDatabase);

  ipcMain.handle(IPC_CHANNELS.trainingGetPlan, (_event, teamId: string) => service.getPlan(teamId));
  ipcMain.handle(IPC_CHANNELS.trainingSavePlan, (_event, request: SaveTrainingPlanRequest) =>
    service.savePlan(request)
  );
}
