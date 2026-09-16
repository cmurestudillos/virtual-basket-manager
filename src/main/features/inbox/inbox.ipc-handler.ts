import { ipcMain } from 'electron';
import type { PressTone } from '@shared/domain/press';
import { IPC_CHANNELS } from '@shared/ipc-channels';
import { requireActiveSaveDatabase } from '../../database/resolve-save-database';
import { InboxService } from './inbox.service';

export function registerInboxIpcHandlers(): void {
  const service = new InboxService(requireActiveSaveDatabase);

  ipcMain.handle(IPC_CHANNELS.inboxGet, () => service.get());
  ipcMain.handle(IPC_CHANNELS.inboxUnreadCount, () => service.unreadCount());
  ipcMain.handle(IPC_CHANNELS.inboxMarkRead, (_event, id: string) => service.markRead(id));
  ipcMain.handle(IPC_CHANNELS.inboxMarkAllRead, () => service.markAllRead());
  ipcMain.handle(IPC_CHANNELS.inboxGetPress, (_event, id: string) => service.getPress(id));
  ipcMain.handle(IPC_CHANNELS.inboxAnswerPress, (_event, id: string, tone: PressTone) =>
    service.answerPress(id, tone)
  );
}
