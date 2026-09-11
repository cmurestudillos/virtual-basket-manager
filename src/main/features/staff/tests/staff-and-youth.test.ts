import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { and, eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MAX_ROSTER } from '@shared/domain/youth';
import {
  closeSaveDatabase,
  openSaveDatabase,
  type SaveDatabase
} from '../../../database/save-database';
import { playersTable, staffTable, teamsTable } from '../../../database/schema/save';
import { loadDataset } from '../../saves/dataset';
import { seedSave } from '../../saves/save-seeder';
import { RotationService } from '../../rotation/rotation.service';
import { SeasonService } from '../../season/season.service';
import { YouthService } from '../../youth/youth.service';
import { StaffService } from '../staff.service';

/**
 * Cuerpo técnico y cantera contra SQLite de verdad.
 *
 * Van juntos porque comparten lo que hay que comprobar de verdad: que lo que se
 * contrata y lo que se promociona acaba notándose en el resto del juego.
 */

const MIGRATIONS = resolve('drizzle/save');
const SEED_DIRECTORY = resolve('resources/seed-data');
const MANAGED_TEAM = 'team-1';
const RIVAL_TEAM = 'team-2';

let directory: string;
let filePath: string;
let db: SaveDatabase;
let staff: StaffService;
let youth: YouthService;
let season: SeasonService;

function freeStaff(role: string) {
  return db
    .select()
    .from(staffTable)
    .all()
    .filter((row) => row.teamId === null && row.role === role);
}

function roster(teamId = MANAGED_TEAM) {
  return db
    .select()
    .from(playersTable)
    .where(and(eq(playersTable.teamId, teamId), eq(playersTable.isYouth, false)))
    .all();
}

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'vbm-staff-'));
  filePath = join(directory, 'partida.sqlite');
  db = openSaveDatabase(filePath, MIGRATIONS);
  seedSave(db, loadDataset(SEED_DIRECTORY), {
    managedTeamId: MANAGED_TEAM,
    managerName: 'Carlos'
  });

  const resolveDb = (): SaveDatabase => db;
  staff = new StaffService(resolveDb);
  youth = new YouthService(resolveDb);
  season = new SeasonService(resolveDb);
});

afterEach(() => {
  closeSaveDatabase(filePath);
  rmSync(directory, { recursive: true, force: true });
});

describe('cuerpo técnico', () => {
  it('la partida arranca con los cinco puestos cubiertos y un mercado', () => {
    const view = staff.get(MANAGED_TEAM);

    expect(view.members).toHaveLength(5);
    expect(view.vacancies).toHaveLength(0);
    expect(view.candidates.length).toBeGreaterThan(5);
    expect(view.seasonWagesCents).toBeGreaterThan(0);
    expect(view.isManaged).toBe(true);
    // Cada técnico dice en números lo que aporta.
    expect(view.members.every((member) => member.effect.length > 0)).toBe(true);
  });

  it('contratar a otro para el mismo puesto deja libre al que estaba', () => {
    const before = staff.get(MANAGED_TEAM);
    const previous = before.members.find((member) => member.role === 'physio')!;
    const candidate = freeStaff('physio')[0];
    expect(candidate).toBeDefined();

    const after = staff.hire({ teamId: MANAGED_TEAM, staffId: candidate!.id });
    const physios = after.members.filter((member) => member.role === 'physio');

    expect(physios).toHaveLength(1);
    expect(physios[0]?.id).toBe(candidate!.id);
    expect(after.candidates.some((member) => member.id === previous.id)).toBe(true);
  });

  it('despedir deja el puesto vacante y al técnico en el mercado', () => {
    const view = staff.get(MANAGED_TEAM);
    const scout = view.members.find((member) => member.role === 'scout')!;

    const after = staff.fire({ teamId: MANAGED_TEAM, staffId: scout.id });

    expect(after.members.some((member) => member.role === 'scout')).toBe(false);
    expect(after.vacancies.map((vacancy) => vacancy.role)).toContain('scout');
    expect(after.candidates.some((member) => member.id === scout.id)).toBe(true);
    expect(staff.levels(MANAGED_TEAM).scout).toBe(0);
  });

  it('no se puede tocar el cuerpo técnico de un rival', () => {
    const rival = staff.get(RIVAL_TEAM);

    const libre = staff.get(MANAGED_TEAM).candidates[0]!;

    expect(rival.isManaged).toBe(false);
    expect(() => staff.hire({ teamId: RIVAL_TEAM, staffId: libre.id })).toThrow(
      /no lo dirige el usuario/
    );
  });

  it('no se puede fichar a un técnico que ya trabaja en otro club', () => {
    const ajeno = db
      .select()
      .from(staffTable)
      .all()
      .find((row) => row.teamId === RIVAL_TEAM)!;

    expect(() => staff.hire({ teamId: MANAGED_TEAM, staffId: ajeno.id })).toThrow(/otro club/);
  });

  it('las fichas del cuerpo técnico entran en la nómina del club', () => {
    season.getCurrent();
    const antes = staff.seasonWagesCents(MANAGED_TEAM);

    const caro = staff
      .get(MANAGED_TEAM)
      .candidates.filter((member) => member.role === 'assistant')
      .sort((a, b) => b.level - a.level)[0];
    if (caro) {
      staff.hire({ teamId: MANAGED_TEAM, staffId: caro.id });
      expect(staff.seasonWagesCents(MANAGED_TEAM)).not.toBe(antes);
    }
  });
});

describe('cantera', () => {
  it('cada club arranca con juveniles y con instalaciones de nivel 2', () => {
    const academy = youth.get(MANAGED_TEAM);

    expect(academy.level).toBe(2);
    expect(academy.players.length).toBeGreaterThanOrEqual(3);
    expect(academy.rosterSize).toBe(12);
    expect(academy.canPromote).toBe(true);
    // Un juvenil vale poco hoy y mucho mañana: es toda la idea.
    expect(academy.players.every((player) => player.potential > player.overall)).toBe(true);
  });

  it('el juvenil no cuenta como jugador del primer equipo', () => {
    expect(roster()).toHaveLength(12);
    // Ni aparece en la rotación, que es lo que el motor lee.
    expect(new RotationService(() => db).get(MANAGED_TEAM).slots).toHaveLength(12);
  });

  it('promocionar lo sube a la plantilla', () => {
    const academy = youth.get(MANAGED_TEAM);
    const prospect = academy.players[0]!;

    const after = youth.promote({ teamId: MANAGED_TEAM, playerId: prospect.playerId });

    expect(after.rosterSize).toBe(13);
    expect(after.players.some((player) => player.playerId === prospect.playerId)).toBe(false);
    expect(roster().some((row) => row.id === prospect.playerId)).toBe(true);
    // Y ya entra en la rotación, al final de ella.
    expect(new RotationService(() => db).get(MANAGED_TEAM).slots).toHaveLength(13);
  });

  it('con la plantilla llena no se puede subir a nadie', () => {
    let academy = youth.get(MANAGED_TEAM);
    while (academy.rosterSize < MAX_ROSTER && academy.players.length > 0) {
      academy = youth.promote({
        teamId: MANAGED_TEAM,
        playerId: academy.players[0]!.playerId
      });
    }

    expect(academy.rosterSize).toBe(MAX_ROSTER);
    expect(academy.canPromote).toBe(false);
    expect(() =>
      youth.promote({ teamId: MANAGED_TEAM, playerId: academy.players[0]!.playerId })
    ).toThrow(/plantilla/);
  });

  it('mejorar las instalaciones cuesta dinero y sube el nivel', () => {
    const antes = db.select().from(teamsTable).where(eq(teamsTable.id, MANAGED_TEAM)).get()!;
    const after = youth.upgrade({ teamId: MANAGED_TEAM });
    const despues = db.select().from(teamsTable).where(eq(teamsTable.id, MANAGED_TEAM)).get()!;

    expect(after.level).toBe(antes.youthLevel + 1);
    expect(despues.budgetCents).toBeLessThan(antes.budgetCents);
  });

  it('sin caja no hay obra', () => {
    db.update(teamsTable)
      .set({ budgetCents: 1_000_00 })
      .where(eq(teamsTable.id, MANAGED_TEAM))
      .run();

    expect(() => youth.upgrade({ teamId: MANAGED_TEAM })).toThrow(/dinero/);
  });

  it('no se toca la cantera de un rival', () => {
    expect(youth.get(RIVAL_TEAM).isManaged).toBe(false);
    expect(() => youth.upgrade({ teamId: RIVAL_TEAM })).toThrow(/no lo dirige el usuario/);
  });

  it('cada temporada nueva trae hornada y se lleva a los mayores', () => {
    const antes = youth.get(MANAGED_TEAM).players.length;
    // La temporada 1 ya sembró la suya; se fuerza una segunda hornada.
    youth.runIntake(2, 2026);

    const despues = youth.get(MANAGED_TEAM).players;
    expect(despues.length).toBeGreaterThanOrEqual(antes);
    expect(despues.length).toBeLessThanOrEqual(10);
  });
});
