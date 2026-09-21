import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({ app: { isPackaged: false, getAppPath: () => '' } }));

const { EDITION_FIELD, appUserModelId, resolveEdition } = await import('../edition');
const { generateClubCoach } = await import('@shared/domain/coaches');
const { createRng, seedFromString } = await import('@shared/engine/basketball/rng');

/**
 * La edición privada lleva datos reales que no pueden salir del PC del autor.
 * Estos tests son la red: que la marca se lea bien, que cada fichero de
 * empaquetado meta el dataset que le toca y que ningún nombre real se cuele en
 * el dataset ficticio que se distribuye.
 */

const noManifest = (): string => {
  throw new Error('no debería leerse');
};

describe('la edición', () => {
  it('en desarrollo es la pública salvo con TM_DATASET=real', () => {
    expect(
      resolveEdition({ packaged: false, datasetEnv: undefined, readPackageJson: noManifest })
    ).toBe('public');
    expect(
      resolveEdition({ packaged: false, datasetEnv: 'ficticio', readPackageJson: noManifest })
    ).toBe('public');
    expect(
      resolveEdition({ packaged: false, datasetEnv: 'real', readPackageJson: noManifest })
    ).toBe('private');
  });

  it('empaquetada manda la marca del package.json, no la variable', () => {
    const privada = JSON.stringify({ name: 'triple-manager-privado', [EDITION_FIELD]: 'private' });
    const publica = JSON.stringify({ name: 'triple-manager' });

    expect(
      resolveEdition({ packaged: true, datasetEnv: undefined, readPackageJson: () => privada })
    ).toBe('private');
    expect(
      resolveEdition({ packaged: true, datasetEnv: 'real', readPackageJson: () => publica })
    ).toBe('public');
  });

  it('sin manifiesto legible se queda en la pública', () => {
    expect(
      resolveEdition({ packaged: true, datasetEnv: 'real', readPackageJson: noManifest })
    ).toBe('public');
    expect(
      resolveEdition({ packaged: true, datasetEnv: undefined, readPackageJson: () => '{roto' })
    ).toBe('public');
  });

  it('cada edición tiene su identificador, que coincide con el appId de su instalador', () => {
    const publicYml = readFileSync(resolve('electron-builder.yml'), 'utf8');
    const privateYml = readFileSync(resolve('electron-builder.private.yml'), 'utf8');

    expect(publicYml).toMatch(new RegExp(`^appId: ${appUserModelId('public')}$`, 'm'));
    expect(privateYml).toMatch(new RegExp(`^appId: ${appUserModelId('private')}$`, 'm'));
  });
});

describe('el empaquetado', () => {
  const publicYml = readFileSync(resolve('electron-builder.yml'), 'utf8');
  const privateYml = readFileSync(resolve('electron-builder.private.yml'), 'utf8');

  it('la pública lleva el dataset ficticio y nunca el real', () => {
    expect(publicYml).toMatch(/- from: resources\/seed-data\s+to: seed-data/);
    expect(publicYml).not.toContain('real-data');
    expect(publicYml).not.toContain(EDITION_FIELD);
  });

  it('la privada lleva el real, su propia carpeta de datos y no se publica', () => {
    expect(privateYml).toMatch(/- from: resources\/real-data\s+to: seed-data/);
    expect(privateYml).not.toContain('resources/seed-data');
    expect(privateYml).toMatch(new RegExp(`^\\s+${EDITION_FIELD}: private$`, 'm'));
    // El `name` empaquetado decide la carpeta de %APPDATA%: tiene que ser otro.
    expect(privateYml).toMatch(/^extraMetadata:\s*\n\s+name: triple-manager-privado$/m);
    expect(privateYml).toMatch(/^publish: null$/m);
    expect(privateYml).toMatch(/^\s+output: release-private$/m);
  });

  it('el dataset real y los instaladores privados no se versionan', () => {
    const gitignore = readFileSync(resolve('.gitignore'), 'utf8').split(/\r?\n/);
    expect(gitignore).toContain('resources/real-data');
    expect(gitignore).toContain('release-private');
  });
});

interface NamedDataset {
  /** Las ligas que ya son reales; el resto del dataset real sigue siendo el ficticio. */
  realLeagues?: string[];
  competitions: { id: string; tier: number }[];
  teams: {
    id: string;
    name: string;
    country: string;
    competitionId: string;
    reputation: number;
    coach?: { firstName: string; lastName: string; nationality: string; birthDate: string };
  }[];
  players: { teamId: string; firstName: string; lastName: string; birthDate: string }[];
}

const REAL = resolve('resources/real-data/dataset.json');

describe.skipIf(!existsSync(REAL))('el dataset ficticio frente al real', () => {
  const load = (path: string): NamedDataset =>
    JSON.parse(readFileSync(path, 'utf8')) as NamedDataset;
  const fictitious = load(resolve('resources/seed-data/dataset.json'));
  const whole = existsSync(REAL) ? load(REAL) : { competitions: [], teams: [], players: [] };
  // Sólo cuenta lo que viene de las ligas reales: los países que siguen
  // inventados están en los dos datasets a propósito.
  const realLeagues = new Set(whole.realLeagues ?? []);
  const realTeams = whole.teams.filter((team) => realLeagues.has(team.competitionId));
  const realTeamIds = new Set(realTeams.map((team) => team.id));
  const realPlayers = whole.players.filter((player) => realTeamIds.has(player.teamId));

  it('dice qué ligas son reales', () => {
    expect(realLeagues.size).toBeGreaterThan(0);
  });

  it('no comparte ningún club', () => {
    const names = new Set(realTeams.map((team) => team.name.toLowerCase()));
    const leaked = fictitious.teams.filter((team) => names.has(team.name.toLowerCase()));
    expect(leaked.map((team) => team.name)).toEqual([]);
  });

  it('no comparte ningún jugador con el mismo nombre y fecha de nacimiento', () => {
    const key = (player: NamedDataset['players'][number]): string =>
      `${player.firstName} ${player.lastName}|${player.birthDate}`.toLowerCase();
    const names = new Set(realPlayers.map(key));
    const leaked = fictitious.players.filter((player) => names.has(key(player)));
    expect(leaked.map(key)).toEqual([]);
  });

  // Los entrenadores reales: los clubes de la ACB, la Primera FEB, la Serie A
  // (con el que sube de la A2) y las dos ligas francesas llevan el suyo.
  const coachLeagues = ['liga-nacional', 'liga-plata', 'italia-1', 'francia-1', 'francia-2'].filter(
    (id) => realLeagues.has(id)
  );
  const coachedTeams = realTeams.filter((team) => coachLeagues.includes(team.competitionId));
  const coachName = (coach: { firstName: string; lastName: string }): string =>
    `${coach.firstName} ${coach.lastName}`.trim().toLowerCase();
  const realCoachNames = new Set(
    coachedTeams.flatMap((team) => (team.coach ? [coachName(team.coach)] : []))
  );

  it('todos los clubes de las ligas con entrenadores reales llevan el suyo', () => {
    expect(coachedTeams.length).toBeGreaterThan(0);
    const missing = coachedTeams.filter(
      (team) => !team.coach?.firstName.trim() || !team.coach.lastName.trim()
    );
    expect(missing.map((team) => team.name)).toEqual([]);
    for (const team of coachedTeams) {
      expect(team.coach?.birthDate, team.name).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(team.coach?.nationality, team.name).toMatch(/^[A-Z]{3}$/);
    }
  });

  it('el dataset ficticio no lleva entrenadores ni ningún nombre de uno real', () => {
    expect(fictitious.teams.filter((team) => team.coach).map((team) => team.name)).toEqual([]);
    const leaked = fictitious.players.filter((player) => realCoachNames.has(coachName(player)));
    expect(leaked.map(coachName)).toEqual([]);
  });

  it('el entrenador que el juego inventa para esos clubes no se llama como uno real', () => {
    const tiers = new Map(whole.competitions.map((row) => [row.id, row.tier]));
    const seasonStart = new Date(Date.UTC(2025, 8, 1));
    const invented = coachedTeams.map((team) =>
      coachName(
        generateClubCoach({
          country: team.country,
          clubReputation: team.reputation,
          tier: tiers.get(team.competitionId) ?? 1,
          today: seasonStart,
          rng: createRng(seedFromString(`${team.id}-entrenador`))
        })
      )
    );
    expect(invented.filter((name) => realCoachNames.has(name))).toEqual([]);
  });
});
