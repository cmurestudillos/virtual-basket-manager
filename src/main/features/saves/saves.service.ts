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
import { DEFAULT_RULESET_MODE, rulesetFor, type RulesetMode } from '@shared/domain/ruleset-mode';
import { nationalTeamId } from '@shared/domain/national-teams';
import { NationalService } from '../national/national.service';
import { applyWorldEdits, type WorldEdit } from '../world-editor/apply-world-edits';
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

export class UnknownNationError extends Error {
  constructor(code: string) {
    super(`No hay selección de ${code}: no tiene jugadores suficientes`);
    this.name = 'UnknownNationError';
  }
}

export class UnknownCountryError extends Error {
  constructor(country: string) {
    super(`No hay ninguna liga de ${country} que jugar`);
    this.name = 'UnknownCountryError';
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
    private readonly seedDirectory: string,
    /**
     * Las ediciones del mundo base, si las hay. Se piden al crear cada partida
     * —no al construir el servicio— para que lo último que se editó entre ya en
     * la siguiente partida sin reiniciar la aplicación.
     */
    private readonly worldEdits: () => readonly WorldEdit[] = () => [],
    /** El reglamento de Ajustes, leído al crear cada partida. */
    private readonly rulesetMode: () => RulesetMode = () => DEFAULT_RULESET_MODE
  ) {}

  list(): SaveSummary[] {
    return this.repository.list().map((row) => this.toSummary(row));
  }

  create(request: CreateSaveRequest): SaveSummary {
    const validated = createSaveRequestSchema.parse(request);
    // El mundo con las ediciones del usuario encima: lo que se ve en el editor
    // es lo que recibe la partida.
    const edited = applyWorldEdits(loadDataset(this.seedDirectory), this.worldEdits());
    const mode = this.rulesetMode();
    const dataset = {
      ...edited,
      competitions: edited.competitions.map((competition) => ({
        ...competition,
        rulesetId: rulesetFor(mode, competition.rulesetId)
      }))
    };

    if (!dataset.teams.some((team) => team.id === validated.teamId)) {
      throw new UnknownTeamError(validated.teamId);
    }

    const leagueCountries = new Set(
      dataset.competitions.filter((row) => row.format === 'league').map((row) => row.country)
    );
    const unknownCountry = validated.activeCountries.find((code) => !leagueCountries.has(code));
    if (unknownCountry) {
      throw new UnknownCountryError(unknownCountry);
    }

    const id = randomUUID();
    const fileName = toSaveFileName(validated.name, id);
    const filePath = prepareSaveFilePath(this.savesDirectory, fileName);

    // Abrir la base aplica las migraciones y deja el esquema listo; sólo
    // después tiene sentido volcar el dataset.
    const db = getSaveDatabase(filePath);
    seedSave(db, dataset, {
      managedTeamId: validated.teamId,
      managerName: validated.managerName,
      managerNationality: validated.managerNationality ?? undefined,
      dismissalEnabled: validated.dismissalEnabled,
      careerMode: validated.careerMode,
      activeCountries: validated.activeCountries
    });

    // La selección se crea ya, con su clasificación, para poder dar la etapa
    // por empezada desde el primer día.
    if (validated.nationalTeam) {
      const national = new NationalService(() => db);
      national.ensureSeason(1, dataset.seasonStartYear);
      const teamId = nationalTeamId(validated.nationalTeam);
      if (!national.getOverview().nations.some((nation) => nation.teamId === teamId)) {
        throw new UnknownNationError(validated.nationalTeam);
      }
      national.takeTeam(teamId);
    }

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
