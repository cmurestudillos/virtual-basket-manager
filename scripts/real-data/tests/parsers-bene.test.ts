import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  aggregateBnxtBoxScores,
  bnxtCountry,
  bnxtName,
  bnxtNationality,
  bnxtPosition,
  bnxtTeamName,
  parseBnxtBoxScore,
  parseBnxtRoster,
  parseBnxtSchedule,
  parseBnxtStandings,
  parseBnxtTeams
} from '../sources/bnxt-parse';

/** La API JSON de la BNXT League (bnxt.sportpress.info), la liga de Bélgica y los Países Bajos. */

const fixture = (name: string): string =>
  readFileSync(resolve(import.meta.dirname, 'fixtures', name), 'utf8');

describe('BNXT: nombres de equipo, países, puestos y nacionalidades', () => {
  it('quita la coletilla «playoff» del nombre', () => {
    expect(bnxtTeamName('Windrose Giants Antwerp playoff')).toBe('Windrose Giants Antwerp');
    expect(bnxtTeamName('House of Talents Spurs Kortrijk Playoff')).toBe(
      'House of Talents Spurs Kortrijk'
    );
    expect(bnxtTeamName('Union Mons-Hainaut')).toBe('Union Mons-Hainaut');
  });

  it('el país del equipo sale del «club» de la API', () => {
    expect(bnxtCountry('Belgium')).toBe('BEL');
    expect(bnxtCountry('Netherlands')).toBe('NED');
    expect(bnxtCountry('')).toBeNull();
  });

  it('sin ala-pívots: son los pívots bajos y los aleros altos', () => {
    expect(bnxtPosition('point_guard', 185)).toBe('PG');
    expect(bnxtPosition('shooting_guard', 195)).toBe('SG');
    expect(bnxtPosition('small_forward', 200)).toBe('SF');
    expect(bnxtPosition('small_forward', 205)).toBe('PF');
    expect(bnxtPosition('center', 202)).toBe('PF');
    expect(bnxtPosition('center', 203)).toBe('C');
    // Sin altura, el puesto tal cual.
    expect(bnxtPosition('center', null)).toBe('C');
    // Con dos, cuenta el primero.
    expect(bnxtPosition('point_guard-shooting_guard', 185)).toBe('PG');
    expect(bnxtPosition('small_forward-power_forward', 194)).toBe('SF');
    expect(bnxtPosition(null, 200)).toBeNull();
  });

  it('la nacionalidad viene en código COI, a veces en minúsculas', () => {
    expect(bnxtNationality('SLO')).toBe('SLO');
    expect(bnxtNationality('SUI')).toBe('SUI');
    expect(bnxtNationality('GER')).toBe('GER');
    expect(bnxtNationality('usa')).toBe('USA');
    expect(bnxtNationality('')).toBeNull();
  });
});

describe('BNXT: nombres de jugador', () => {
  it('del nombre de pila legal se queda el primero', () => {
    expect(bnxtName('Troy Drake', 'Dobbs', 'USA')).toEqual({
      firstName: 'Troy',
      lastName: 'Dobbs'
    });
  });

  it('los sufijos, siempre igual; «Junior» de nombre de pila se queda', () => {
    expect(bnxtName('Rob', 'Howard Junior', 'USA').lastName).toBe('Howard Jr.');
    expect(bnxtName('Dante', 'Maddox Jr', 'USA').lastName).toBe('Maddox Jr.');
    expect(bnxtName('Eddie', 'Colbert III', 'USA').lastName).toBe('Colbert III');
    expect(bnxtName('Junior', 'Bonsenge', 'BEL')).toEqual({
      firstName: 'Junior',
      lastName: 'Bonsenge'
    });
  });

  it('lo que viene en mayúsculas, con mayúscula inicial', () => {
    expect(bnxtName('Maks', 'KLANJŠČEK', 'SLO').lastName).toBe('Klanjšček');
  });

  it('las partículas, en minúscula para los neerlandeses y tal cual para los belgas', () => {
    expect(bnxtName('Boyd', 'Van Der Vuurst', 'NED').lastName).toBe('van der Vuurst');
    expect(bnxtName('Chermano', 'Van La Parra', 'NED').lastName).toBe('van La Parra');
    expect(bnxtName('Niels', 'Van Den Eynde', 'BEL').lastName).toBe('Van Den Eynde');
    expect(bnxtName('Niels', 'De Ridder', 'BEL').lastName).toBe('De Ridder');
  });
});

describe('BNXT: clasificación y equipos', () => {
  it('cada fila con el id del equipo en la temporada, su país y su balance', () => {
    const rows = parseBnxtStandings(fixture('bnxt-clasificacion.json'));
    expect(rows.map((row) => row.position)).toEqual([1, 2, 17]);
    expect(rows[0]).toEqual({
      position: 1,
      teamId: '506',
      name: 'Windrose Giants Antwerp',
      shortName: 'ANT',
      country: 'BEL',
      games: 34,
      wins: 29,
      losses: 5
    });
    expect(rows[2]).toMatchObject({ teamId: '518', country: 'NED', wins: 4, losses: 30 });
  });

  it('los equipos con el id de club y el primer entrenador del final', () => {
    const teams = parseBnxtTeams(fixture('bnxt-equipos.json'));
    expect(teams).toEqual([
      {
        teamId: '504',
        clubId: '2',
        name: 'Filou Oostende',
        headCoaches: ['Dennis Wucherer']
      },
      {
        teamId: '518',
        clubId: '10',
        name: 'Zeeuw & Zeeuw Rotterdam City',
        headCoaches: ['Deividas Kumelis']
      }
    ]);
  });
});

describe('BNXT: calendario', () => {
  const games = parseBnxtSchedule(fixture('bnxt-calendario.json'));

  it('los partidos con su fase, pabellón y tanteo', () => {
    expect(games).toHaveLength(2);
    expect(games.find((game) => game.gameId === '10587')).toEqual({
      gameId: '10587',
      time: '2025-09-28 14:00:00',
      phaseId: '169',
      status: 'finished',
      arena: 'Topsportcentrum Rotterdam',
      home: { teamId: '518', score: 68 },
      away: { teamId: '516', score: 88 }
    });
  });

  it('el partido dado por perdido, 0-40', () => {
    expect(games.find((game) => game.gameId === '11027')).toMatchObject({
      home: { teamId: '518', score: 0 },
      away: { teamId: '524', score: 40 }
    });
  });
});

describe('BNXT: acta', () => {
  const sides = parseBnxtBoxScore(fixture('bnxt-acta.json'), '10569');

  it('dos equipos, con el de casa marcado', () => {
    expect(sides.map((side) => [side.teamId, side.isHome, side.points])).toEqual([
      ['502', false, 65],
      ['506', true, 99]
    ]);
  });

  it('cada línea: minutos enteros, faltas y tapones recibidos, valoración y titular', () => {
    const gary = sides[0]!.lines[0]!;
    expect(gary.person).toEqual({
      playerId: '5241',
      firstName: 'Juwan',
      lastName: 'Gary',
      birthDate: '2001-02-17',
      nationalityRaw: 'USA'
    });
    expect(gary).toMatchObject({
      gameId: '10569',
      teamId: '502',
      positionRaw: 'small_forward',
      shirtNumber: 4,
      starter: true,
      seconds: 29 * 60,
      points: 10,
      twoPointMade: 3,
      twoPointAttempted: 7,
      threePointMade: 1,
      threePointAttempted: 2,
      freeThrowMade: 1,
      freeThrowAttempted: 2,
      offensiveRebounds: 0,
      defensiveRebounds: 5,
      assists: 2,
      steals: 1,
      turnovers: 2,
      blocks: 1,
      blocksReceived: 0,
      fouls: 2,
      foulsDrawn: 1,
      rating: 12
    });
    // Sin fecha de nacimiento en la API.
    expect(sides[1]!.lines[0]!.person).toMatchObject({ lastName: 'Bello', birthDate: null });
  });

  it('un partido dado por perdido no tiene acta', () => {
    expect(parseBnxtBoxScore('{"data":[]}', '11027')).toEqual([]);
  });

  it('suma las actas por jugador y equipo', () => {
    const lines = sides.flatMap((side) => side.lines);
    const twice = aggregateBnxtBoxScores([...lines, ...lines]);
    const gary = twice.find((entry) => entry.playerId === '5241');
    expect(gary?.teamId).toBe('502');
    expect(gary?.stats).toMatchObject({
      games: 2,
      starts: 2,
      seconds: 2 * 29 * 60,
      points: 20,
      foulsDrawn: 2,
      blocksReceived: 0,
      dunks: null
    });
  });
});

describe('BNXT: plantilla', () => {
  const roster = parseBnxtRoster(fixture('bnxt-plantilla.json'));

  it('puesto, altura, peso, fecha y nacionalidad tal cual', () => {
    expect(roster).toHaveLength(4);
    expect(roster[0]).toEqual({
      playerId: '5287',
      firstName: 'Maks',
      lastName: 'KLANJŠČEK',
      birthDate: '1999-12-15',
      nationalityRaw: 'SLO',
      positionRaw: 'shooting_guard',
      heightCm: 194,
      weightKg: 90,
      shirtNumber: null
    });
  });

  it('lo que falta, vacío', () => {
    expect(roster[1]).toMatchObject({ lastName: 'Hien', birthDate: null, positionRaw: 'center' });
    expect(roster[2]).toMatchObject({ lastName: 'Van Der Heiden', heightCm: null, weightKg: null });
    expect(roster[3]).toMatchObject({
      lastName: 'Van Zeil',
      nationalityRaw: null,
      positionRaw: 'point_guard-shooting_guard'
    });
  });
});
