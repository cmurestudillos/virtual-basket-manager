import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '@shared/ipc-channels';
import type { CalendarMonthRequest } from '@shared/contracts/calendar.contract';
import { requireActiveSaveDatabase } from '../../database/resolve-save-database';
import { CalendarService } from './calendar.service';

export function registerCalendarIpcHandlers(): void {
  const service = new CalendarService(requireActiveSaveDatabase);

  ipcMain.handle(IPC_CHANNELS.calendarGetMonth, (_event, request: CalendarMonthRequest) =>
    service.getMonth(request)
  );
}
