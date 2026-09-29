import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { SourceStats } from '../lib/source-types';
import { emptyStats } from '../sources/lkl-parse';
import {
  apiRows,
  bbrefPosition,
  bbrefSeasons,
  feetInchesToCm,
  gleaguePosition,
  leagueOrder,
  mergePerson,
  nameKey,
  parseApiPlayerIndex,
  parseApiPlayerInfo,
  parseApiRoster,
  parseApiStandings,
  parseApiTotals,
  parseBbrefArena,
  parseBbrefCoachBirth,
  parseBbrefCoaches,
  parseBbrefDunks,
  parseBbrefRoster,
  parseBbrefStandings,
  parseBbrefTotals,
  poundsToKg,
  splitUsaName,
  sumStats,
  surnameKey,
  usaDate,
  usaName,
  usaNationality
} from '../sources/usa-parse';

/** EE. UU.: basketball-reference y la API de estadísticas de la NBA. Fixtures inventados. */

const fixture = (name: string): string =>
  readFileSync(resolve(import.meta.dirname, 'fixtures', name), 'utf8');
const api = JSON.parse(fixture('usa-api.json')) as Record<string, unknown>;
const apiBody = (key: string): string => JSON.stringify(api[key]);

describe('medidas, fechas y nombres', () => {
  it('pies y pulgadas a centímetros y libras a kilos', () => {
    expect(feetInchesToCm('6-8')).toBe(203);
    expect(feetInchesToCm('7-0')).toBe(213);
    expect(feetInchesToCm('')).toBeNull();
    expect(feetInchesToCm('203')).toBeNull();
    expect(poundsToKg('220')).toBe(100);
    expect(poundsToKg('')).toBeNull();
  });

  it('las tres formas de fecha', () => {
    expect(usaDate('January 3, 2001')).toBe('2001-01-03');
    expect(usaDate('AUG 10, 2005')).toBe('2005-08-10');
    expect(usaDate('2002-03-22T00:00:00')).toBe('2002-03-22');
    expect(usaDate('')).toBeNull();
    expect(usaDate('Foo 1, 2000')).toBeNull();
  });

  it('los sufijos siempre igual y el nombre de una sola cadena', () => {
    expect(usaName(' Dos ', 'Segundo Jr')).toEqual({ firstName: 'Dos', lastName: 'Segundo Jr.' });
    expect(usaName('Tres', 'Tercero iii')).toEqual({ firstName: 'Tres', lastName: 'Tercero III' });
    expect(splitUsaName('Uno Primero de la Vega')).toEqual({
      firstName: 'Uno',
      lastName: 'Primero de la Vega'
    });
  });

  it('la clave para casar personas: sin tildes, puntos ni sufijos', () => {
    expect(nameKey('Dos Segundo Jr.')).toBe(nameKey('Dos Segundo'));
    expect(nameKey('Ünö Prímero')).toBe('uno primero');
    expect(nameKey("D'Uno O'Primero")).toBe('duno oprimero');
    expect(surnameKey('Tres Tercero III')).toBe('tercero');
  });

  it('la nacionalidad de la API, también «DRC»', () => {
    expect(usaNationality('Serbia')).toBe('SRB');
    expect(usaNationality('DRC')).toBe('COD');
    expect(usaNationality('Nicaragua')).toBe('NCA');
    expect(usaNationality(null)).toBeNull();
  });
});

describe('basketball-reference', () => {
  it('los totales, destapando la tabla del comentario y sin las cabeceras repetidas', () => {
    const rows = parseBbrefTotals(fixture('usa-bbref-totales.html'));
    expect(rows.map((row) => [row.playerId, row.team, row.total])).toEqual([
      ['unoaa01', '2TM', true],
      ['unoaa01', 'AAA', false],
      ['unoaa01', 'BBB', false],
      ['dosbb01', 'AAA', false]
    ]);
    expect(rows[0]).toMatchObject({ games: 70, starts: 50, minutes: 2000, points: 1050 });
  });

  it('quien jugó en varios clubes: la suma y el club de más minutos', () => {
    const seasons = bbrefSeasons(parseBbrefTotals(fixture('usa-bbref-totales.html')));
    expect(seasons).toHaveLength(2);
    expect(seasons[0]).toMatchObject({
      team: 'BBB',
      clubs: [
        { team: 'AAA', minutes: 700 },
        { team: 'BBB', minutes: 1300 }
      ]
    });
    expect(seasons[0]!.totals.minutes).toBe(2000);
    expect(seasons[1]).toMatchObject({ team: 'AAA', clubs: [{ team: 'AAA', minutes: 1800 }] });
  });

  it('la plantilla: fecha, medidas y país de nacimiento; lo vacío, a null', () => {
    const roster = parseBbrefRoster(fixture('usa-bbref-equipo.html'));
    expect(roster).toEqual([
      {
        playerId: 'unoaa01',
        name: 'Uno Primero',
        position: 'SG',
        heightCm: 196,
        weightKg: 93,
        birthDate: '2001-01-03',
        birthCountry: 'ES',
        shirtNumber: 8
      },
      {
        playerId: 'dosbb01',
        name: 'Dos Segundo Jr.',
        position: 'C',
        heightCm: 213,
        weightKg: null,
        birthDate: null,
        birthCountry: null,
        shirtNumber: null
      }
    ]);
  });

  it('el pabellón, sin el número del edificio', () => {
    expect(parseBbrefArena(fixture('usa-bbref-equipo.html'))).toBe('Pabellón Central');
    expect(parseBbrefArena('<p>nada</p>')).toBeNull();
  });

  it('clasificación, mates (la fila total manda), entrenadores en orden y fecha de la ficha', () => {
    const page = fixture('usa-bbref-liga.html');
    expect(parseBbrefStandings(page)).toEqual([
      { rank: 1, name: 'Club Bravo', wins: 60, losses: 22 },
      { rank: 2, name: 'Club Alfa', wins: 41, losses: 41 }
    ]);
    expect([...parseBbrefDunks(page)]).toEqual([
      ['unoaa01', 12],
      ['dosbb01', 150]
    ]);
    expect(parseBbrefCoaches(page)).toEqual([
      { coachId: 'tecnaa01c', name: 'Técnico Uno', team: 'AAA', games: 1 },
      { coachId: 'tecnbb01c', name: 'Técnico Dos', team: 'AAA', games: 81 }
    ]);
    expect(parseBbrefCoachBirth(page)).toBe('1976-04-07');
    expect(parseBbrefCoachBirth('<p>sin fecha</p>')).toBeNull();
  });

  it('el puesto: el primero de los que da', () => {
    expect(bbrefPosition('SF-PF')).toBe('SF');
    expect(bbrefPosition('c')).toBe('C');
    expect(bbrefPosition('G')).toBeNull();
  });
});

describe('la API de estadísticas', () => {
  it('filas con sus columnas; `null` si no es una respuesta de la API', () => {
    expect(apiRows(apiBody('clasificacion'))).toHaveLength(3);
    expect(apiRows(apiBody('plantilla'), 'Coaches')).toEqual([]);
    expect(apiRows('<html>Access Denied</html>')).toBeNull();
    expect(apiRows('{"message":"error"}')).toBeNull();
  });

  it('los totales: tiros de dos, minutos con decimales, faltas y tapones recibidos', () => {
    const [row] = parseApiTotals(apiBody('totales'));
    expect(row).toMatchObject({ personId: '101', teamId: '9', teamCode: 'AAA' });
    expect(row!.stats).toMatchObject({
      games: 30,
      seconds: 42_030,
      twoPointMade: 100,
      twoPointAttempted: 200,
      threePointMade: 30,
      blocksReceived: 7,
      foulsDrawn: 66,
      dunks: null
    });
  });

  it('índice, plantilla y ficha, y lo que falta en uno se toma de otro', () => {
    const index = parseApiPlayerIndex(apiBody('indice'));
    expect(index[1]).toMatchObject({
      personId: '102',
      firstName: 'Dos',
      lastName: 'Segundo Jr.',
      heightCm: 213,
      weightKg: null,
      country: 'USA',
      birthDate: null,
      shirtNumber: null
    });
    const [roster] = parseApiRoster(apiBody('plantilla'));
    expect(roster).toMatchObject({ personId: '101', birthDate: '2005-08-10', position: 'G' });
    const merged = mergePerson(roster!, index[0]);
    expect(merged).toMatchObject({ birthDate: '2005-08-10', country: 'DRC', position: 'G' });
    expect(parseApiPlayerInfo(apiBody('ficha'))).toEqual({
      personId: '103',
      firstName: 'Tres',
      lastName: 'Tercero III',
      birthDate: '2002-03-22',
      heightCm: 208,
      weightKg: 109,
      position: 'Forward-Center',
      country: 'Nicaragua',
      shirtNumber: null
    });
    expect(parseApiPlayerInfo(apiBody('totales'))).toBeNull();
  });

  it('la clasificación de toda la liga: victorias y, a igualdad, diferencia de puntos', () => {
    const standings = parseApiStandings(apiBody('clasificacion'));
    expect(standings[2]).toMatchObject({ conference: 'West', division: 'Pacific', wins: 26 });
    expect([...leagueOrder(standings)]).toEqual([
      ['3', 1],
      ['2', 2],
      ['1', 3]
    ]);
  });

  it('suma los clubes de un jugador; un dato que falta en uno es null en la suma', () => {
    const one: SourceStats = { ...emptyStats(), games: 10, seconds: 600, foulsDrawn: 4, starts: 2 };
    const two: SourceStats = {
      ...emptyStats(),
      games: 5,
      seconds: 300,
      foulsDrawn: null,
      starts: 1
    };
    const total = sumStats([one, two]);
    expect(total).toMatchObject({
      games: 15,
      seconds: 900,
      starts: 3,
      foulsDrawn: null,
      dunks: null
    });
  });
});

describe('el puesto en la G League (altura y juego)', () => {
  const stats = (minutes: number, rebounds: number, assists: number): SourceStats => ({
    ...emptyStats(),
    seconds: minutes * 60,
    defensiveRebounds: rebounds,
    assists
  });
  const quiet = stats(360, 30, 10);
  const rebounder = stats(360, 110, 10);
  const passer = stats(360, 30, 60);

  it('los pívots de la API lo son salvo si son bajos y no rebotean', () => {
    expect(gleaguePosition('C', 211, quiet)).toBe('C');
    expect(gleaguePosition('F-C', 203, quiet)).toBe('PF');
    expect(gleaguePosition('Center-Forward', 203, rebounder)).toBe('C');
    expect(gleaguePosition('C', null, null)).toBe('C');
  });

  it('por altura: pívot seguro y ala-pívot', () => {
    expect(gleaguePosition('F', 208, quiet)).toBe('C');
    expect(gleaguePosition('F', 206, rebounder)).toBe('C');
    expect(gleaguePosition('Forward', 204, quiet)).toBe('PF');
    expect(gleaguePosition('F', 198, rebounder)).toBe('PF');
    expect(gleaguePosition('F', 196, rebounder)).toBe('SF');
    expect(gleaguePosition('F', 198, quiet)).toBe('SF');
  });

  it('bases, escoltas y aleros', () => {
    expect(gleaguePosition('G', 185, quiet)).toBe('PG');
    expect(gleaguePosition('G', 193, passer)).toBe('PG');
    expect(gleaguePosition('Guard', 193, quiet)).toBe('SG');
    expect(gleaguePosition('G-F', 196, quiet)).toBe('SG');
    expect(gleaguePosition('G-F', 201, quiet)).toBe('SF');
    expect(gleaguePosition(null, null, null)).toBe('SG');
  });
});
