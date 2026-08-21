import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import {
  createSaveRequestSchema,
  saveIdSchema,
  type CreateSaveRequest,
  type SaveSummary
} from '@shared/contracts/saves.contract';
import { getSaveDatabase, type SaveDatabase } from '../../database/client';
import { setActiveSaveFilePath } from '../../database/resolve-save-database';
import { deleteSaveFile, prepareSaveFilePath, toSaveFileName } from '../../database/save-file';
import { gameStateTable, teamsTable } from '../../database/schema/save';
import type { SaveRow } from '../../database/schema/app';
import { loadDataset } from './dataset';
import { seedSave } from './save-seeder';
import type { SavesRepository } from './saves.repository';

export class SaveNotFoundError extends Error {
  constructor(id: string) {
    super(`No existe la partida ${id}`);
    this.name = 'SaveNotFoundError';
  }
}

export class UnknownTeamError extends Error {
  constructor(teamId: string) {
    super(`El equipo ${teamId} no está en el dataset`);
    this.name = 'UnknownTeamError';
  }
}

/**
 * Alta, carga y baja de partidas.
 *
 * Una partida son dos cosas a la vez: una fila en el registro (base de
 * aplicación) y un fichero `.sqlite` propio con todo el mundo dentro. Este
 * servicio es el único sitio donde esas dos cosas se crean o se destruyen
 * juntas, para que no pueda quedar una sin la otra.
 */
export class SavesService {
  constructor(
    private readonly repository: SavesRepository,
    private readonly savesDirectory: string,
    private readonly seedDirectory: string
  ) {}

  list(): SaveSummary[] {
    return this.repository.list().map((row) => this.toSummary(row));
  }

  create(request: CreateSaveRequest): SaveSummary {
    const validated = createSaveRequestSchema.parse(request);
    const dataset = loadDataset(this.seedDirectory);

    if (!dataset.teams.some((team) => team.id === validated.teamId)) {
      throw new UnknownTeamError(validated.teamId);
    }

    const id = randomUUID();
    const fileName = toSaveFileName(validated.name, id);
    const filePath = prepareSaveFilePath(this.savesDirectory, fileName);

    // Abrir la base aplica las migraciones y deja el esquema listo; sólo
    // después tiene sentido volcar el dataset.
    const db = getSaveDatabase(filePath);
    seedSave(db, dataset, {
      managedTeamId: validated.teamId,
      managerName: validated.managerName
    });

    const now = new Date();
    this.repository.insert({
      id,
      name: validated.name,
      fileName,
      createdAt: now,
      lastPlayedAt: now
    });

    setActiveSaveFilePath(filePath);

    const row = this.repository.findById(id);
    if (!row) {
      throw new SaveNotFoundError(id);
    }
    return this.toSummary(row);
  }

  /** Carga una partida y la deja como activa para el resto de features. */
  load(id: string): SaveSummary {
    const validated = saveIdSchema.parse({ id });
    const row = this.repository.findById(validated.id);
    if (!row) {
      throw new SaveNotFoundError(validated.id);
    }

    setActiveSaveFilePath(prepareSaveFilePath(this.savesDirectory, row.fileName));
    this.repository.touchLastPlayed(row.id, new Date());

    return this.toSummary({ ...row, lastPlayedAt: new Date() });
  }

  delete(id: string): void {
    const validated = saveIdSchema.parse({ id });
    const row = this.repository.findById(validated.id);
    if (!row) {
      throw new SaveNotFoundError(validated.id);
    }

    const filePath = prepareSaveFilePath(this.savesDirectory, row.fileName);
    deleteSaveFile(filePath);
    this.repository.delete(row.id);
  }

  /**
   * Completa la ficha del listado con lo que sólo sabe el propio fichero de la
   * partida (equipo dirigido, entrenador, temporada). Si el fichero falta o
   * está corrupto, la partida sigue apareciendo en la lista con esos campos a
   * nulo en lugar de reventar el menú entero.
   */
  private toSummary(row: SaveRow): SaveSummary {
    const base: SaveSummary = {
      id: row.id,
      name: row.name,
      fileName: row.fileName,
      createdAt: row.createdAt.getTime(),
      lastPlayedAt: row.lastPlayedAt?.getTime() ?? null,
      teamName: null,
      managerName: null,
      seasonNumber: null
    };

    try {
      const db = getSaveDatabase(prepareSaveFilePath(this.savesDirectory, row.fileName));
      const state = readGameState(db);
      if (!state) {
        return base;
      }

      return {
        ...base,
        teamName: state.teamName,
        managerName: state.managerName,
        seasonNumber: state.seasonNumber
      };
    } catch {
      return base;
    }
  }
}

function readGameState(
  db: SaveDatabase
): { teamName: string | null; managerName: string; seasonNumber: number } | null {
  const state = db.select().from(gameStateTable).get();
  if (!state) {
    return null;
  }

  const team = state.managedTeamId
    ? db.select().from(teamsTable).where(eq(teamsTable.id, state.managedTeamId)).get()
    : null;

  return {
    teamName: team?.name ?? null,
    managerName: state.managerName,
    seasonNumber: state.seasonNumber
  };
}
