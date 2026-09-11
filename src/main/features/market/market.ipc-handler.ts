import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '@shared/ipc-channels';
import type {
  LoanRequest,
  MarketSearchRequest,
  OfferRequest,
  RenewRequest
} from '@shared/contracts/market.contract';
import { requireActiveSaveDatabase } from '../../database/resolve-save-database';
import { MarketService } from './market.service';

export function registerMarketIpcHandlers(): void {
  const service = new MarketService(requireActiveSaveDatabase);

  ipcMain.handle(IPC_CHANNELS.marketGetStatus, () => service.getStatus());
  ipcMain.handle(IPC_CHANNELS.marketSearch, (_event, request: MarketSearchRequest) =>
    service.search(request)
  );
  ipcMain.handle(IPC_CHANNELS.marketOffer, (_event, request: OfferRequest) =>
    service.offer(request)
  );
  ipcMain.handle(IPC_CHANNELS.marketListContracts, () => service.listContracts());
  ipcMain.handle(IPC_CHANNELS.marketRenew, (_event, request: RenewRequest) =>
    service.renew(request)
  );
  ipcMain.handle(IPC_CHANNELS.marketRelease, (_event, request: { playerId: string }) =>
    service.release(request)
  );
  ipcMain.handle(IPC_CHANNELS.marketListLoans, () => service.listLoans());
  ipcMain.handle(IPC_CHANNELS.marketLoanOut, (_event, request: LoanRequest) =>
    service.loanOut(request)
  );
  ipcMain.handle(IPC_CHANNELS.marketLoanIn, (_event, request: LoanRequest) =>
    service.loanIn(request)
  );
}
