import { ipcMain } from 'electron';
import type { LiveTacticsPatch } from '@shared/contracts/match.contract';
import { IPC_CHANNELS } from '@shared/ipc-channels';
import { requireActiveSaveDatabase } from '../../database/resolve-save-database';
import { MatchReportService } from './match-report.service';
import { MatchService } from './match.service';

export function registerMatchIpcHandlers(): void {
  const service = new MatchService(requireActiveSaveDatabase);
  const report = new MatchReportService(requireActiveSaveDatabase);

  ipcMain.handle(IPC_CHANNELS.matchStart, (_event, gameId: string) => service.start(gameId));
  ipcMain.handle(IPC_CHANNELS.matchAdvancePeriod, (_event, gameId: string) =>
    service.advancePeriod(gameId)
  );
  ipcMain.handle(IPC_CHANNELS.matchGet, (_event, gameId: string) => service.get(gameId));

  ipcMain.handle(IPC_CHANNELS.matchSnapshot, (_event, gameId: string) => service.snapshot(gameId));
  ipcMain.handle(IPC_CHANNELS.matchAdvancePossession, (_event, gameId: string) =>
    service.advancePossession(gameId)
  );
  ipcMain.handle(
    IPC_CHANNELS.matchSubstitute,
    (_event, gameId: string, outgoingId: string, incomingId: string) =>
      service.substitute(gameId, outgoingId, incomingId)
  );
  ipcMain.handle(IPC_CHANNELS.matchTimeout, (_event, gameId: string) =>
    service.callTimeout(gameId)
  );
  ipcMain.handle(IPC_CHANNELS.matchLiveTactics, (_event, gameId: string, patch: LiveTacticsPatch) =>
    service.setLiveTactics(gameId, patch)
  );
  ipcMain.handle(IPC_CHANNELS.matchAutoRotation, (_event, gameId: string, enabled: boolean) =>
    service.setAutoRotation(gameId, enabled)
  );
  ipcMain.handle(IPC_CHANNELS.matchPreview, (_event, gameId: string) => report.preview(gameId));
  ipcMain.handle(IPC_CHANNELS.matchRoundResults, (_event, gameId: string) =>
    report.roundResults(gameId)
  );
}
