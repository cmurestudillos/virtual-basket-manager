import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  aggregateBblBoxScores,
  bblNationality,
  bblPosition,
  cleanPersonName,
  nextPageProps,
  parseBblGame,
  parseBblTeamSeason,
  parseProaKader,
  parseProaPlayerPage,
  proaCalendarName,
  proaFirstName,
  proaNationality,
  proaRecord,
  splitCoachName
} from '../sources/bbl-parse';

/** Las fuentes de Alemania: easycredit-bbl.de (BBL) y 2basketballbundesliga.de (ProA). */

const fixture = (name: string): string =>
  readFileSync(resolve(import.meta.dirname, 'fixtures', name), 'utf8');

describe('BBL: datos de la página', () => {
  it('lee los pageProps del __NEXT_DATA__ y nada si no lo hay', () => {
    expect(nextPageProps(fixture('bbl-equipo.html'))).toHaveProperty('seasonTeam');
    expect(nextPageProps('<html><body>sin datos</body></html>')).toBeNull();
    expect(nextPageProps('<script id="__NEXT_DATA__">{roto</script>')).toBeNull();
  });

  it('limpia espacios y sufijos de los nombres', () => {
    expect(cleanPersonName('  Nombre   Largo JR ')).toBe('Nombre Largo Jr.');
    expect(cleanPersonName('Nombre Otro Jr.')).toBe('Nombre Otro Jr.');
    expect(cleanPersonName('Junior Rey')).toBe('Junior Rey');
  });

  it('traduce puestos y nacionalidades', () => {
    expect(bblPosition('POINT_GUARD')).toBe('PG');
    expect(bblPosition('CENTER')).toBe('C');
    expect(bblPosition('PF')).toBe('PF');
    expect(bblPosition('Teamarzt')).toBeNull();
    expect(bblNationality(['DE', 'US'])).toBe('GER');
    expect(bblNationality(['XX', 'HR'])).toBe('CRO');
    expect(bblNationality([])).toBeNull();
  });
});

describe('BBL: equipo en una temporada', () => {
  const team = parseBblTeamSeason(fixture('bbl-equipo.html'))!;

  it('lee temporada, puesto, balance y el pabellón principal', () => {
    expect(team).toMatchObject({
      teamId: '901',
      seasonId: 2025,
      name: 'FALKEN Nordstadt',
      rank: 3,
      wins: 24,
      losses: 10,
      venue: { name: 'Große Halle Nordstadt', capacity: 6150 }
    });
  });

  it('lee la plantilla con fecha, altura en centímetros, puesto y nacionalidades', () => {
    expect(team.players).toEqual([
      {
        playerId: '5001',
        firstName: 'Jugador',
        lastName: 'Uno',
        birthDate: '2001-04-22',
        heightCm: 197,
        weightKg: 84,
        position: 'SMALL_FORWARD',
        nationalities: ['DE'],
        shirtNumber: 6
      },
      {
        playerId: '5002',
        firstName: 'Rejean',
        lastName: 'Doble Espacio Jr.',
        birthDate: '1996-11-17',
        heightCm: 201,
        weightKg: 95,
        position: 'POWER_FORWARD',
        nationalities: ['XX', 'US'],
        shirtNumber: 34
      },
      {
        playerId: '5003',
        firstName: 'Sin',
        lastName: 'Datos',
        birthDate: null,
        heightCm: null,
        weightKg: null,
        position: null,
        nationalities: [],
        shirtNumber: null
      }
    ]);
  });

  it('lee el cuerpo técnico con su fecha', () => {
    expect(team.coaches).toEqual([
      { firstName: 'Ayudante', lastName: 'Primero', birthDate: '1979-11-16', headCoach: false },
      { firstName: 'Entrenador', lastName: 'Inventado', birthDate: '1983-08-24', headCoach: true }
    ]);
  });

  it('sin datos de equipo no hay nada', () => {
    expect(parseBblTeamSeason(fixture('bbl-acta.html'))).toBeNull();
  });
});

describe('BBL: acta', () => {
  const game = parseBblGame(fixture('bbl-acta.html'))!;

  it('lee fase, jornada, tanteo y el entrenador de cada equipo', () => {
    expect(game).toMatchObject({
      gameId: '7001',
      seasonId: 2025,
      stage: 'MAIN_ROUND',
      matchDay: 1,
      scheduledTime: '2025-09-26T18:00:00Z',
      homeId: '901',
      awayId: '902',
      homeScore: 12,
      awayScore: 3,
      homeCoach: 'Entrenador Inventado',
      awayCoach: 'Otro Entrenador'
    });
    expect(game.lines).toHaveLength(4);
  });

  it('lee la línea de cada jugador con rebotes, tapones, faltas y titular', () => {
    expect(game.lines[0]).toEqual({
      teamId: '901',
      playerId: '5001',
      firstName: 'Jugador',
      lastName: 'Uno',
      seconds: 1311,
      starter: true,
      points: 10,
      twoPointMade: 2,
      twoPointAttempted: 3,
      threePointMade: 2,
      threePointAttempted: 5,
      freeThrowMade: 0,
      freeThrowAttempted: 0,
      offensiveRebounds: 2,
      defensiveRebounds: 3,
      assists: 4,
      steals: 1,
      turnovers: 0,
      blocks: 1,
      fouls: 2,
      foulsDrawn: 3,
      rating: 12
    });
  });

  it('una página sin partido no es un acta', () => {
    expect(parseBblGame(fixture('bbl-equipo.html'))).toBeNull();
  });

  it('suma por jugador y equipo, y quien no jugó no cuenta', () => {
    const lines = [...game.lines, ...game.lines.map((line) => ({ ...line, starter: false }))];
    const totals = aggregateBblBoxScores(lines);
    expect(totals.map((entry) => entry.playerId)).toEqual(['5001', '5002', '6001']);
    expect(totals[0]!.stats).toMatchObject({
      games: 2,
      starts: 1,
      seconds: 2622,
      points: 20,
      offensiveRebounds: 4,
      defensiveRebounds: 6,
      blocks: 2,
      fouls: 4,
      foulsDrawn: 6,
      rating: 24,
      blocksReceived: null,
      dunks: null
    });
  });

  it('parte el nombre del entrenador por la primera palabra', () => {
    expect(splitCoachName('Nombre  Apellido Compuesto')).toEqual({
      firstName: 'Nombre',
      lastName: 'Apellido Compuesto'
    });
    expect(splitCoachName('Solo')).toEqual({ firstName: '', lastName: 'Solo' });
  });
});

describe('ProA: plantilla de un equipo', () => {
  const kader = parseProaKader(fixture('proa-plantilla.html'));

  it('lee el cuerpo técnico con fecha y bandera', () => {
    expect(kader.staff.map((person) => [person.personId, person.lastName, person.role])).toEqual([
      ['801', 'Entrenador', 'Trainer'],
      ['802', 'Ayudante', 'Co-Trainer']
    ]);
    expect(kader.staff[0]).toMatchObject({
      firstName: 'Primer',
      birthDate: '1988-09-21',
      flag: 'RS',
      country: 'Serbien'
    });
  });

  it('lee la plantilla sin la marca de formado en casa, con el personal aparte', () => {
    expect(kader.players).toEqual([
      {
        personId: '901',
        firstName: 'Tomas',
        lastName: 'Brücke',
        birthDate: '2007-02-28',
        role: 'PG',
        flag: 'DE',
        country: 'Deutschland',
        heightCm: 187,
        weightKg: 78,
        shirtNumber: 7
      },
      {
        personId: '902',
        firstName: 'Juan Segundo',
        lastName: 'Largo Jr.',
        birthDate: '1999-10-02',
        role: 'SF',
        flag: 'US',
        country: 'Vereinigte Staaten von Amerika',
        heightCm: 191,
        weightKg: 84,
        shirtNumber: 2
      },
      {
        personId: '903',
        firstName: 'Doctor',
        lastName: 'Médico',
        birthDate: '1970-01-01',
        role: 'Teamarzt',
        flag: 'DE',
        country: 'Deutschland',
        heightCm: null,
        weightKg: null,
        shirtNumber: null
      }
    ]);
  });

  it('lee los totales de liga regular de cada jugador', () => {
    expect(kader.stats.map((row) => [row.personId, row.name])).toEqual([
      ['902', 'Juan Segundo Largo Jr.'],
      ['904', 'Se Fue']
    ]);
    expect(kader.stats[0]!.stats).toEqual({
      games: 27,
      starts: null,
      seconds: 758 * 60 + 45,
      points: 438,
      twoPointMade: 138,
      twoPointAttempted: 263,
      threePointMade: 13,
      threePointAttempted: 39,
      freeThrowMade: 123,
      freeThrowAttempted: 142,
      offensiveRebounds: 68,
      defensiveRebounds: 135,
      assists: 42,
      steals: 25,
      turnovers: 41,
      blocks: 1,
      blocksReceived: null,
      dunks: null,
      fouls: 39,
      foulsDrawn: null,
      rating: 498
    });
  });

  it('lee el nombre del equipo y su calendario de liga regular', () => {
    expect(kader.teamName).toBe('Falken Süd');
    expect(kader.games).toEqual([
      { home: 'Falken Süd', away: 'Otro Equipo', homeScore: 69, awayScore: 71 },
      { home: 'Otro Equipo', away: 'Falken Süd', homeScore: 72, awayScore: 84 }
    ]);
    expect(proaRecord(kader.games, 'Falken Süd')).toEqual({ wins: 1, losses: 1 });
  });

  it('el nombre del equipo en el calendario es el que sale en todos sus partidos', () => {
    const game = (home: string, away: string): (typeof kader.games)[number] => ({
      home,
      away,
      homeScore: 80,
      awayScore: 70
    });
    expect(proaCalendarName([game('A', 'Propio'), game('Propio', 'B'), game('C', 'Propio')])).toBe(
      'Propio'
    );
    expect(proaCalendarName([])).toBeNull();
  });
});

describe('ProA: ficha de jugador, nombres y nacionalidades', () => {
  it('lee la ficha', () => {
    expect(parseProaPlayerPage(fixture('proa-jugador.html'))).toEqual({
      firstName: 'Se',
      lastName: 'Fue',
      position: 'PF',
      birthDate: '2002-04-03',
      heightCm: 200,
      weightKg: 99,
      country: 'Vereinigte Staaten von Amerika'
    });
  });

  it('el nombre de uso es el primero de los de pila', () => {
    expect(proaFirstName('Juan  Segundo Tercero')).toBe('Juan');
    expect(proaFirstName('Solo')).toBe('Solo');
  });

  it('la nacionalidad sale de la bandera o del país en alemán', () => {
    expect(proaNationality('SI', null)).toBe('SLO');
    expect(proaNationality(null, 'Vereinigte Staaten von Amerika')).toBe('USA');
    expect(proaNationality(null, 'Österreich')).toBe('AUT');
    expect(proaNationality(null, null)).toBeNull();
  });
});
