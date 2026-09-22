import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Dataset } from '../../../src/main/features/saves/dataset';
import { NATION_NAMES } from '../../../src/shared/domain/national-teams';
import { MAX_ROSTER } from '../../../src/shared/domain/youth';
import {
  coachBirthDate,
  mergeRealLeagues,
  reputationFor,
  scaleReference,
  selectRosters,
  slugify,
  teamStrength
} from '../lib/merge';
import type { SourceCoach, SourceLeague, SourcePlayer, SourceTeam } from '../lib/source-types';

const fictitious = JSON.parse(
  readFileSync(resolve('resources/seed-data/dataset.json'), 'utf8')
) as Dataset;
const known = new Set(Object.keys(NATION_NAMES));

function player(id: string, minutes: number, overrides: Partial<SourcePlayer> = {}): SourcePlayer {
  const games = 20;
  const seconds = minutes * 60 * games;
  const scale = minutes / 20;
  return {
    sourceId: id,
    firstName: 'Jugador',
    lastName: id,
    nickname: null,
    birthDate: '1996-03-03',
    age: null,
    nationality: 'ESP',
    nationalityRaw: 'España',
    position: (['PG', 'SG', 'SF', 'PF', 'C'] as const)[id.length % 5],
    positionRaw: null,
    heightCm: 198,
    weightKg: null,
    shirtNumber: null,
    licence: null,
    stats:
      minutes === 0
        ? null
        : {
            games,
            starts: null,
            seconds,
            points: Math.round(8 * scale * games),
            twoPointMade: Math.round(2 * scale * games),
            twoPointAttempted: Math.round(4 * scale * games),
            threePointMade: Math.round(1 * scale * games),
            threePointAttempted: Math.round(3 * scale * games),
            freeThrowMade: Math.round(1 * scale * games),
            freeThrowAttempted: Math.round(1.4 * scale * games),
            offensiveRebounds: Math.round(1 * scale * games),
            defensiveRebounds: Math.round(2.5 * scale * games),
            assists: Math.round(1.5 * scale * games),
            steals: Math.round(0.7 * scale * games),
            turnovers: Math.round(1.1 * scale * games),
            blocks: Math.round(0.3 * scale * games),
            blocksReceived: null,
            dunks: null,
            fouls: Math.round(2 * scale * games),
            foulsDrawn: null,
            rating: null
          },
    ...overrides
  };
}

function team(name: string, finalPosition: number, players: SourcePlayer[]): SourceTeam {
  return {
    sourceId: slugify(name),
    name,
    shortName: null,
    city: null,
    pavilionName: null,
    pavilionCapacity: null,
    finalPosition,
    players
  };
}

function coach(id: string, overrides: Partial<SourceCoach> = {}): SourceCoach {
  return {
    sourceId: id,
    firstName: 'Técnico',
    lastName: id,
    birthDate: '1970-05-05',
    age: null,
    nationality: 'ESP',
    nationalityRaw: 'España',
    ...overrides
  };
}

/** Una Primera FEB de mentira con los casos difíciles dentro. */
function league(): SourceLeague {
  const teams = Array.from({ length: 4 }, (_, index) =>
    team(
      `Club Real ${index + 1}`,
      index + 1,
      Array.from({ length: 12 }, (_, slot) => player(`t${index}-p${slot}`, 30 - slot * 2))
    )
  );
  // Uno se fue a mitad de temporada a otro equipo de la liga: jugó más en el segundo.
  teams[0]!.players.push(player('viajero', 8));
  teams[1]!.players.push(player('viajero', 18));
  // Una plantilla con más gente de la que cabe.
  for (let extra = 0; extra < 5; extra += 1) teams[2]!.players.push(player(`sobra-${extra}`, 1));
  // Nacionalidad que el juego no conoce y un fichaje sin estadísticas.
  teams[3]!.players.push(player('raro', 12, { nationality: 'TGA', nationalityRaw: 'Tonga' }));
  teams[3]!.players.push(player('nuevo', 0, { licence: 'EXT' }));
  // Entrenadores: con fecha, sólo con edad, con bandera desconocida y ninguno.
  teams[0]!.coach = coach('con-fecha', { nationality: 'ITA', nationalityRaw: 'Italia' });
  teams[1]!.coach = coach('con-edad', { birthDate: null, age: 65 });
  teams[2]!.coach = coach('sin-bandera', { nationality: null, nationalityRaw: null });
  teams[3]!.coach = null;
  return {
    competitionId: 'liga-plata',
    name: 'Primera FEB',
    shortName: 'PFEB',
    country: 'ESP',
    seasonStartYear: 2025,
    source: 'https://ejemplo',
    extractedAt: '2026-09-16T00:00:00.000Z',
    teams,
    warnings: []
  };
}

describe('elegir las plantillas', () => {
  it('cada jugador en un solo equipo, donde más jugó, y nadie por encima del máximo', () => {
    const { rosters, droppedDuplicates, droppedOverRoster } = selectRosters(league());
    const all = [...rosters.values()].flat();
    const ids = all.map((entry) => entry.sourceId);
    expect(new Set(ids).size).toBe(ids.length);
    const home = [...rosters.entries()].find(([, players]) =>
      players.some((entry) => entry.sourceId === 'viajero')
    );
    expect(home?.[0].name).toBe('Club Real 2');
    expect(droppedDuplicates).toBe(1);
    expect(droppedOverRoster).toBeGreaterThan(0);
    for (const players of rosters.values()) expect(players.length).toBeLessThanOrEqual(MAX_ROSTER);
  });

  it('el nivel del equipo va de 1 el primero a 0 el último', () => {
    expect(teamStrength(1, 17)).toBe(1);
    expect(teamStrength(17, 17)).toBe(0);
    expect(teamStrength(9, 17)).toBe(0.5);
    expect(teamStrength(null, 17)).toBeNull();
  });

  it('la reputación va del mejor al peor según el puesto final', () => {
    const tier = { reputation: [30, 7] as [number, number] } as never;
    expect(reputationFor(1, 0, 18, tier)).toBe(30);
    expect(reputationFor(18, 17, 18, tier)).toBe(7);
    expect(reputationFor(null, 4, 18, tier)).toBeLessThan(30);
  });
});

describe('mezclar una liga real con el mundo ficticio', () => {
  const { dataset, reports } = mergeRealLeagues(fictitious, [league()], known);

  it('sustituye sólo la liga real y deja el resto del mundo intacto', () => {
    const others = fictitious.teams.filter((entry) => entry.competitionId !== 'liga-plata');
    for (const entry of others) {
      expect(dataset.teams).toContainEqual(entry);
    }
    const plata = dataset.teams.filter((entry) => entry.competitionId === 'liga-plata');
    expect(plata.map((entry) => entry.name).sort()).toEqual([
      'Club Real 1',
      'Club Real 2',
      'Club Real 3',
      'Club Real 4'
    ]);
    expect(dataset.realLeagues).toEqual(['liga-plata']);
  });

  it('la liga y la copa del país llevan su nombre real', () => {
    expect(dataset.competitions.find((entry) => entry.id === 'liga-plata')?.name).toBe(
      'Primera FEB'
    );
    expect(dataset.competitions.find((entry) => entry.id === 'copa-nacional')?.name).toBe(
      'Copa del Rey'
    );
  });

  it('todo jugador cuelga de un equipo que existe y los identificadores no se repiten', () => {
    const teamIds = new Set(dataset.teams.map((entry) => entry.id));
    for (const entry of dataset.players) expect(teamIds.has(entry.teamId)).toBe(true);
    expect(new Set(dataset.players.map((entry) => entry.id)).size).toBe(dataset.players.length);
    expect(new Set(dataset.teams.map((entry) => entry.id)).size).toBe(dataset.teams.length);
  });

  it('rellena lo que la fuente no da con valores razonables', () => {
    const real = dataset.players.filter((entry) => entry.teamId.startsWith('liga-plata-'));
    for (const entry of real) {
      expect(entry.weightKg).toBeGreaterThan(60);
      expect(entry.wingspanCm).toBeGreaterThanOrEqual(entry.heightCm);
      expect(entry.potential).toBeGreaterThanOrEqual(0);
      expect(entry.wageCents).toBeGreaterThan(0);
      expect(entry.contractUntil).toMatch(/^20(2[6-9]|30)-06-30$/);
    }
  });

  it('una nacionalidad desconocida se avisa y se cambia por la del club', () => {
    expect(reports[0]?.unknownNationalities).toContain('TGA');
    const raro = dataset.players.find((entry) => entry.lastName === 'raro');
    expect(raro?.nationality).toBe('ESP');
  });

  it('el mejor equipo real sale con más reputación y presupuesto que el peor', () => {
    const plata = dataset.teams.filter((entry) => entry.competitionId === 'liga-plata');
    const best = plata.find((entry) => entry.name === 'Club Real 1')!;
    const worst = plata.find((entry) => entry.name === 'Club Real 4')!;
    expect(best.reputation).toBeGreaterThan(worst.reputation);
    expect(best.budgetCents).toBeGreaterThan(worst.budgetCents);
  });

  it('las medias quedan dentro del rango de la liga ficticia a la que sustituyen', () => {
    const fictitiousIds = new Set(
      fictitious.teams
        .filter((entry) => entry.competitionId === 'liga-plata')
        .map((entry) => entry.id)
    );
    const values = fictitious.players
      .filter((entry) => fictitiousIds.has(entry.teamId))
      .flatMap((entry) => Object.values(entry.attributes));
    const [min, max] = [Math.min(...values), Math.max(...values)];
    const real = dataset.players.filter((entry) => entry.teamId.startsWith('liga-plata-'));
    for (const entry of real) {
      for (const value of Object.values(entry.attributes)) {
        expect(value).toBeGreaterThanOrEqual(min);
        expect(value).toBeLessThanOrEqual(max);
      }
    }
  });

  it('cada club real lleva su entrenador, con la bandera del país si no se conoce', () => {
    const byName = new Map(dataset.teams.map((entry) => [entry.name, entry]));
    expect(byName.get('Club Real 1')?.coach).toEqual({
      firstName: 'Técnico',
      lastName: 'con-fecha',
      nationality: 'ITA',
      birthDate: '1970-05-05'
    });
    // 65 años el 16-9-2026: nacido entre el 17-9-1960 y el 16-9-1961.
    expect(byName.get('Club Real 2')?.coach?.birthDate).toBe('1961-07-01');
    expect(byName.get('Club Real 3')?.coach?.nationality).toBe('ESP');
    expect(byName.get('Club Real 4')?.coach).toBeUndefined();
    expect(reports[0]?.withoutCoach).toEqual(['Club Real 4']);
    // El mundo inventado no lleva entrenadores.
    expect(dataset.teams.filter((entry) => entry.coach).length).toBe(3);
  });

  it('con sólo la edad, la fecha es el 1 de julio que le cuadra el día de la extracción', () => {
    const aged = coach('x', { birthDate: null, age: 40 });
    expect(coachBirthDate(aged, '2026-09-16T00:00:00.000Z')).toBe('1986-07-01');
    expect(coachBirthDate(aged, '2026-03-01T00:00:00.000Z')).toBe('1985-07-01');
    expect(coachBirthDate(coach('y', { birthDate: null, age: null }), '2026-09-16')).toBeNull();
  });

  it('una liga que no existe en el mundo ficticio es un error', () => {
    expect(() =>
      mergeRealLeagues(fictitious, [{ ...league(), competitionId: 'no-existe' }], known)
    ).toThrow(/no-existe/);
  });
});

describe('equipos invitados de una liga de otra categoría', () => {
  /** Una primera división de cuatro equipos y una segunda de la que sube uno. */
  function host(): SourceLeague {
    return {
      ...league(),
      competitionId: 'italia-1',
      name: 'Primera Real',
      shortName: 'PR',
      country: 'ITA'
    };
  }
  function lower(): SourceLeague {
    const teams = Array.from({ length: 3 }, (_, index) =>
      team(
        `Club Abajo ${index + 1}`,
        index + 1,
        Array.from({ length: 10 }, (_, slot) => player(`b${index}-p${slot}`, 30 - slot * 2))
      )
    );
    // Uno que ya juega en la primera (misma persona, otro id en la otra web).
    teams[0]!.players.push(
      player('t0-p0-otra-web', 20, { firstName: 'Jugador', lastName: 't0-p0' })
    );
    teams[0]!.coach = coach('del-invitado');
    return {
      ...league(),
      competitionId: 'segunda-real',
      name: 'Segunda Real',
      shortName: 'SR',
      country: 'ITA',
      teams,
      guest: { into: 'italia-1', teamIds: [teams[0]!.sourceId], scale: { league: 'liga-plata' } }
    };
  }
  const { dataset, reports } = mergeRealLeagues(fictitious, [lower(), host()], known);
  const italy = dataset.teams.filter((entry) => entry.competitionId === 'italia-1');
  const guestTeam = italy.find((entry) => entry.name === 'Club Abajo 1');

  it('sólo entra el invitado, detrás de los de la liga y con la reputación más baja', () => {
    expect(italy).toHaveLength(5);
    expect(guestTeam).toBeDefined();
    expect(dataset.teams.some((entry) => entry.name === 'Club Abajo 2')).toBe(false);
    expect(Math.min(...italy.map((entry) => entry.reputation))).toBe(guestTeam!.reputation);
    expect(guestTeam!.coach?.lastName).toBe('del-invitado');
    // La liga invitada no es una liga del juego.
    expect(dataset.realLeagues).toEqual(['italia-1']);
    expect(reports.map((report) => report.guestOf ?? null)).toEqual([null, 'italia-1']);
  });

  it('la copa del país toma su nombre real', () => {
    expect(dataset.competitions.find((entry) => entry.id === 'italia-copa')?.name).toBe(
      'Coppa Italia'
    );
  });

  it('sus jugadores llevan la escala de su categoría y no repiten a nadie de la liga', () => {
    const own = dataset.players.filter((entry) => entry.teamId === guestTeam!.id);
    expect(own.length).toBe(10);
    expect(own.every((entry) => entry.id.startsWith('italia-1-segunda-real-p'))).toBe(true);
    expect(reports[1]?.droppedDuplicates).toBe(1);
    // El mejor del invitado, campeón de su liga, no llega al mejor de la primera.
    const hostPlayers = dataset.players.filter(
      (entry) => entry.teamId.startsWith('italia-1-') && entry.teamId !== guestTeam!.id
    );
    const best = (rows: typeof own): number =>
      Math.max(...rows.map((entry) => entry.attributes.basketballIQ));
    expect(best(own)).toBeLessThan(best(hostPlayers));
  });

  it('bajar la escala un escalón la deja por debajo de la de su liga', () => {
    const base = scaleReference(fictitious, { league: 'liga-plata' });
    const lowered = scaleReference(fictitious, { league: 'liga-plata', stepsDown: 0.5 });
    const median = (values: number[]): number => values[Math.floor(values.length / 2)] ?? 0;
    expect(median(lowered.attributes.basketballIQ)).toBeLessThan(
      median(base.attributes.basketballIQ)
    );
  });

  it('meter equipos en una liga que no es real es un error', () => {
    expect(() => mergeRealLeagues(fictitious, [lower()], known)).toThrow(/italia-1/);
  });
});

describe('ascendidos de una liga real a la de encima', () => {
  /** Una primera división de cuatro equipos y una segunda de cinco de la que suben dos. */
  function first(): SourceLeague {
    return {
      ...league(),
      competitionId: 'francia-1',
      name: 'Primera Francesa',
      shortName: 'PF',
      country: 'FRA'
    };
  }
  function second(promoted: string[] = ['club-segunda-2', 'club-segunda-1']): SourceLeague {
    const teams = Array.from({ length: 5 }, (_, index) =>
      team(
        `Club Segunda ${index + 1}`,
        index + 1,
        Array.from({ length: 10 }, (_, slot) => player(`s${index}-p${slot}`, 30 - slot * 2))
      )
    );
    teams[1]!.coach = coach('del-ascendido');
    return {
      ...league(),
      competitionId: 'francia-2',
      name: 'Segunda Francesa',
      shortName: 'SF',
      country: 'FRA',
      teams,
      promoted: { into: 'francia-1', teamIds: promoted }
    };
  }
  const { dataset, reports, rated } = mergeRealLeagues(fictitious, [second(), first()], known);
  const inLeague = (id: string): typeof dataset.teams =>
    dataset.teams.filter((entry) => entry.competitionId === id);
  const top = inLeague('francia-1');
  const bottom = inLeague('francia-2');

  it('los que suben juegan en la de encima, al final y en el orden dado', () => {
    expect(top.map((entry) => entry.name).slice(-2)).toEqual(['Club Segunda 2', 'Club Segunda 1']);
    expect(top).toHaveLength(6);
    expect(top.at(-1)!.reputation).toBe(Math.min(...top.map((entry) => entry.reputation)));
    expect(top.at(-2)!.coach?.lastName).toBe('del-ascendido');
    expect(dataset.realLeagues).toEqual(['francia-1', 'francia-2']);
  });

  it('en su liga se quedan los demás, con la reputación repartida entre ellos', () => {
    expect(bottom.map((entry) => entry.name)).toEqual([
      'Club Segunda 3',
      'Club Segunda 4',
      'Club Segunda 5'
    ]);
    const [best, worst] = [34, 12];
    expect(bottom[0]!.reputation).toBe(best);
    expect(bottom[2]!.reputation).toBe(worst);
  });

  it('se valoran con su liga entera: mismos atributos que si se quedaran', () => {
    const alone = mergeRealLeagues(fictitious, [{ ...second(), promoted: undefined }], known);
    const byName = (rows: typeof dataset.players, name: string): typeof dataset.players =>
      rows.filter((entry) => entry.lastName === name);
    const promotedPlayer = byName(dataset.players, 's1-p0')[0]!;
    const stayed = byName(alone.dataset.players, 's1-p0')[0]!;
    expect(promotedPlayer.id).toBe('francia-1-francia-2-ps1-p0');
    expect(promotedPlayer.attributes).toEqual(stayed.attributes);
    expect(rated.get('francia-2')).toHaveLength(30);
    expect(rated.get('francia-2-ascendidos')).toHaveLength(20);
    expect(reports.find((report) => report.competitionId === 'francia-2-ascendidos')?.guestOf).toBe(
      'francia-1'
    );
  });

  it('la copa de Francia toma su nombre real', () => {
    expect(dataset.competitions.find((entry) => entry.id === 'francia-copa')?.name).toBe(
      'Coupe de France'
    );
  });

  it('subir equipos a una liga que no es real es un error', () => {
    expect(() => mergeRealLeagues(fictitious, [second()], known)).toThrow(/francia-1/);
  });
});

describe('la copa de Grecia', () => {
  it('toma su nombre real cuando su primera división es real', () => {
    const greek: SourceLeague = {
      ...league(),
      competitionId: 'grecia-1',
      name: 'Primera Griega',
      shortName: 'PG',
      country: 'GRE'
    };
    const { dataset } = mergeRealLeagues(fictitious, [greek], known);
    // El ficticio ya se llama así; lo que cambia es la abreviatura.
    expect(dataset.competitions.find((entry) => entry.id === 'grecia-copa')).toMatchObject({
      name: 'Kýpello Elládos',
      shortName: 'Kýpello'
    });
  });
});
