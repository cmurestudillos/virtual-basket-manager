import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '@shared/ipc-channels';
import type { CreateSaveRequest } from '@shared/contracts/saves.contract';
import { getAppDatabase } from '../../database/client';
import { getSavesDirectory, getSeedDataDirectory } from '../../config/paths';
import { DEFAULT_RULESET_MODE, isRulesetMode } from '@shared/domain/ruleset-mode';
import { SettingsRepository } from '../settings/settings.repository';
import { WorldEditorRepository } from '../world-editor/world-editor.repository';
import { SavesRepository } from './saves.repository';
import { SavesService } from './saves.service';

export function registerSavesIpcHandlers(): void {
  const worldEdits = new WorldEditorRepository(getAppDatabase());
  const settings = new SettingsRepository(getAppDatabase());
  const service = new SavesService(
    new SavesRepository(getAppDatabase()),
    getSavesDirectory(),
    getSeedDataDirectory(),
    () => worldEdits.all(),
    () => {
      const saved = settings.findByKey('ruleset');
      return isRulesetMode(saved) ? saved : DEFAULT_RULESET_MODE;
    }
  );

  ipcMain.handle(IPC_CHANNELS.savesList, () => service.list());
  ipcMain.handle(IPC_CHANNELS.savesCreate, (_event, request: CreateSaveRequest) =>
    service.create(request)
  );
  ipcMain.handle(IPC_CHANNELS.savesLoad, (_event, id: string) => service.load(id));
  ipcMain.handle(IPC_CHANNELS.savesDelete, (_event, id: string) => {
    service.delete(id);
  });
}
