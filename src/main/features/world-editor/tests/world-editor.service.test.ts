import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { AppDatabase } from '../../../database/client';
import { playersTable, teamsTable } from '../../../database/schema/save';
import { closeSaveDatabase, openSaveDatabase } from '../../../database/save-database';
import { loadDataset } from '../../saves/dataset';
import { seedSave } from '../../saves/save-seeder';
import { applyWorldEdits } from '../apply-world-edits';
import { WorldEditorRepository } from '../world-editor.repository';
import { WorldEditorService } from '../world-editor.service';

/**
 * El editor del mundo base, contra la base de la aplicación de verdad.
 *
 * Lo que importa comprobar no es que un formulario guarde, sino las dos
 * promesas del diseño: que el dataset original no se toca nunca —se puede
 * restaurar, y el cargador lo comparte toda la sesión— y que lo editado es
 * exactamente lo que recibe la partida nueva que se cree después.
 */

const SEED_DIRECTORY = resolve('resources/seed-data');
const TEAM = 'liga-nacional-1';
const OTHER = 'liga-nacional-2';

let directory: string;
let sqlite: Database.Database;
let editor: WorldEditorService;
let repository: WorldEditorRepository;

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'vbm-editor-'));
  sqlite = new Database(join(directory, 'app.sqlite'));
  const db = drizzle(sqlite) as unknown as AppDatabase;
  migrate(db, { migrationsFolder: resolve('drizzle/app') });
  repository = new WorldEditorRepository(db);
  editor = new WorldEditorService(repository, SEED_DIRECTORY);
});

afterEach(() => {
  sqlite.close();
  rmSync(directory, { recursive: true, force: true });
});

function firstPlayerOf(teamId: string): string {
  return editor.team(teamId)!.players[0]!.playerId;
}

describe('clubes', () => {
  it('se editan, se marcan y se cuentan', () => {
    const result = editor.updateTeam(TEAM, { name: 'Club Editado', pavilionCapacity: 12000 });

    expect(result.ok).toBe(true);
    expect(result.value!.name).toBe('Club Editado');
    expect(result.value!.pavilionCapacity).toBe(12000);
    expect(result.value!.edited).toBe(true);

    const overview = editor.overview();
    expect(overview.editedTeams).toBe(1);
    expect(overview.teams.find((team) => team.teamId === TEAM)!.edited).toBe(true);
    expect(overview.teams.find((team) => team.teamId === OTHER)!.edited).toBe(false);
  });

  it('rechaza lo que rompería la partida, con su motivo', () => {
    const pequeño = editor.updateTeam(TEAM, { pavilionCapacity: 5 });
    expect(pequeño.ok).toBe(false);
    expect(pequeño.reason).toContain('pavilionCapacity');

    expect(editor.updateTeam(TEAM, { name: '' }).ok).toBe(false);
    expect(editor.updateTeam('club-inventado', { name: 'Nada' }).ok).toBe(false);
  });

  it('volver a poner el valor original deja de ser una edición', () => {
    const original = editor.team(TEAM)!.name;
    editor.updateTeam(TEAM, { name: 'Otro nombre' });

    editor.updateTeam(TEAM, { name: original });

    expect(editor.overview().editedTeams).toBe(0);
    expect(editor.team(TEAM)!.edited).toBe(false);
  });
});

describe('jugadores', () => {
  it('se editan sus atributos sin tocar los demás', () => {
    const playerId = firstPlayerOf(TEAM);
    const antes = editor.team(TEAM)!.players.find((p) => p.playerId === playerId)!;

    const result = editor.updatePlayer(playerId, { attributes: { threePoint: 99 } });

    const despues = result.value!.players.find((p) => p.playerId === playerId)!;
    expect(despues.attributes.threePoint).toBe(99);
    expect(despues.attributes.close).toBe(antes.attributes.close);
    expect(despues.edited).toBe(true);
  });

  it('un atributo fuera de escala no entra', () => {
    const result = editor.updatePlayer(firstPlayerOf(TEAM), { attributes: { threePoint: 400 } });

    expect(result.ok).toBe(false);
  });

  it('se cambian de plantilla respetando mínimo y máximo', () => {
    const playerId = firstPlayerOf(TEAM);
    const origen = editor.team(TEAM)!.players.length;

    const result = editor.movePlayer(playerId, OTHER);

    expect(result.ok).toBe(true);
    expect(editor.team(TEAM)!.players).toHaveLength(origen - 1);
    expect(editor.team(OTHER)!.players.some((p) => p.playerId === playerId)).toBe(true);
    // Los dos clubes quedan marcados: uno pierde un jugador y otro lo gana.
    const overview = editor.overview();
    expect(overview.teams.find((t) => t.teamId === TEAM)!.edited).toBe(true);
    expect(overview.teams.find((t) => t.teamId === OTHER)!.edited).toBe(true);
  });

  it('no deja una plantilla por debajo de diez', () => {
    expect(editor.movePlayer(firstPlayerOf(TEAM), OTHER).ok).toBe(true);
    expect(editor.movePlayer(firstPlayerOf(TEAM), OTHER).ok).toBe(true);
    // Doce de partida, dos fuera: con diez ya no sale nadie más.
    const result = editor.movePlayer(firstPlayerOf(TEAM), 'liga-nacional-3');

    expect(result.ok).toBe(false);
    expect(result.reason).toContain('10');
  });

  it('no deja una plantilla por encima de catorce', () => {
    editor.movePlayer(firstPlayerOf(OTHER), TEAM);
    editor.movePlayer(firstPlayerOf('liga-nacional-3'), TEAM);
    const result = editor.movePlayer(firstPlayerOf('liga-nacional-4'), TEAM);

    expect(result.ok).toBe(false);
    expect(result.reason).toContain('14');
  });
});

describe('restaurar', () => {
  it('un club vuelve al original con los jugadores que eran suyos', () => {
    const playerId = firstPlayerOf(TEAM);
    editor.updateTeam(TEAM, { name: 'Club Editado' });
    editor.updatePlayer(playerId, { attributes: { threePoint: 99 } });

    const result = editor.resetTeam(TEAM);

    expect(result.value!.edited).toBe(false);
    expect(result.value!.name).not.toBe('Club Editado');
    expect(editor.overview().editedPlayers).toBe(0);
  });

  it('todo el mundo vuelve al original', () => {
    editor.updateTeam(TEAM, { name: 'Club Editado' });
    editor.movePlayer(firstPlayerOf(OTHER), TEAM);

    const overview = editor.resetAll();

    expect(overview.editedTeams).toBe(0);
    expect(overview.editedPlayers).toBe(0);
  });

  it('el dataset original no se toca: el cargador lo comparte toda la sesión', () => {
    const nombreOriginal = loadDataset(SEED_DIRECTORY).teams.find((t) => t.id === TEAM)!.name;

    editor.updateTeam(TEAM, { name: 'Club Editado' });
    editor.merged();

    expect(loadDataset(SEED_DIRECTORY).teams.find((t) => t.id === TEAM)!.name).toBe(nombreOriginal);
  });
});

describe('la partida nueva', () => {
  it('nace del mundo editado', () => {
    const playerId = firstPlayerOf(TEAM);
    editor.updateTeam(TEAM, { name: 'Club Editado', reputation: 97 });
    editor.movePlayer(playerId, OTHER);

    const saveDir = mkdtempSync(join(tmpdir(), 'vbm-editor-save-'));
    const filePath = join(saveDir, 'partida.sqlite');
    const save = openSaveDatabase(filePath, resolve('drizzle/save'));
    try {
      seedSave(save, applyWorldEdits(loadDataset(SEED_DIRECTORY), repository.all()), {
        managedTeamId: TEAM,
        managerName: 'Carlos'
      });

      const team = save
        .select()
        .from(teamsTable)
        .all()
        .find((row) => row.id === TEAM)!;
      expect(team.name).toBe('Club Editado');
      expect(team.reputation).toBe(97);
      const player = save
        .select()
        .from(playersTable)
        .all()
        .find((row) => row.id === playerId)!;
      expect(player.teamId).toBe(OTHER);
    } finally {
      closeSaveDatabase(filePath);
      rmSync(saveDir, { recursive: true, force: true });
    }
  });
});
