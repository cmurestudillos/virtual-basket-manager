import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { usualFirstName } from '../lib/normalize';
import {
  abaNationality,
  abaPosition,
  aggregateAbaBoxScores,
  parseAbaBoxScore,
  parseAbaRoster,
  parseAbaStandings,
  speakersByTeam,
  splitAbaName,
  type AbaGame
} from '../sources/aba-parse';

/** aba-liga.com: la Liga Adriática y su segunda división (la misma aplicación). */

const fixture = (name: string): string =>
  readFileSync(resolve(import.meta.dirname, 'fixtures', name), 'utf8');

describe('ABA: puestos y países', () => {
  it('los cinco puestos de la web, tal cual', () => {
    expect(abaPosition('Guard')).toBe('PG');
    expect(abaPosition('Shooting Guard')).toBe('SG');
    expect(abaPosition('Forward')).toBe('SF');
    expect(abaPosition('Power Forward')).toBe('PF');
    expect(abaPosition('Center')).toBe('C');
    expect(abaPosition('')).toBeNull();
  });

  it('la nacionalidad viene en ISO de tres letras', () => {
    expect(abaNationality('SVN')).toBe('SLO');
    expect(abaNationality('HRV')).toBe('CRO');
    expect(abaNationality('DEU')).toBe('GER');
    expect(abaNationality('SRB')).toBe('SRB');
    expect(abaNationality('PAN')).toBe('PAN');
    expect(abaNationality('')).toBeNull();
  });
});

describe('ABA: clasificación', () => {
  const tables = parseAbaStandings(fixture('aba-clasificacion.html'));

  it('una tabla por fase, con su título', () => {
    // El título «Regular Season 2025/26» no lleva tabla: van detrás las de los grupos.
    expect(tables.map((table) => table.title)).toEqual([
      'Top 8 Season 2025/26',
      'Play-out Season 2025/26',
      'Group A',
      'Group B'
    ]);
  });

  it('cada fila con el id del club y su balance', () => {
    expect(tables[0]?.rows[0]).toEqual({
      rank: 1,
      teamId: '95',
      name: 'Dubai Basketball',
      games: 24,
      wins: 21,
      losses: 3
    });
    expect(tables[1]?.rows[0]).toMatchObject({ rank: 1, teamId: '91', wins: 14, losses: 12 });
    expect(tables[2]?.rows[0]).toMatchObject({ teamId: '95', games: 16, wins: 15 });
  });
});

describe('ABA: acta', () => {
  const game = parseAbaBoxScore(fixture('aba-acta.html'), '1') as AbaGame;

  it('lee la cabecera', () => {
    expect(game).toMatchObject({
      gameId: '1',
      round: 'ROUND 1, AdmiralBet ABA League, Season 2025/26 - Group A',
      date: '2025-10-06',
      attendance: 6436,
      venue: 'Beogradska Arena',
      home: { teamId: '22', name: 'Partizan Mozzart Bet', city: 'Beograd', score: 84 },
      away: { teamId: '10', name: 'Krka', city: 'Novo Mesto', score: 78 }
    });
  });

  it('lee cada línea por su columna, con el titular marcado', () => {
    expect(game.lines.find((line) => line.playerId === '4807')).toEqual({
      playerId: '4807',
      teamId: '22',
      shortName: 'Jones C.',
      shirtNumber: 1,
      starter: true,
      seconds: 864,
      points: 10,
      twoPointMade: 2,
      twoPointAttempted: 4,
      threePointMade: 2,
      threePointAttempted: 3,
      freeThrowMade: 0,
      freeThrowAttempted: 0,
      defensiveRebounds: 2,
      offensiveRebounds: 0,
      assists: 4,
      steals: 1,
      turnovers: 1,
      blocks: 0,
      blocksReceived: 0,
      fouls: 1,
      foulsDrawn: 2,
      rating: 14
    });
    expect(game.lines.find((line) => line.playerId === '4209')).toMatchObject({
      teamId: '10',
      starter: true,
      seconds: 1720,
      freeThrowMade: 6,
      freeThrowAttempted: 6,
      assists: 8,
      blocksReceived: 1,
      fouls: 3,
      foulsDrawn: 3
    });
    expect(game.lines.find((line) => line.playerId === '5107')).toMatchObject({
      shortName: 'Bailey Jr. V.',
      points: 29
    });
    // Quien no salió a la pista va en el acta con cuatro celdas.
    expect(game.lines.find((line) => line.playerId === '4672')).toMatchObject({
      seconds: 0,
      points: 0,
      starter: false
    });
  });

  it('suma sólo los partidos que jugó', () => {
    const totals = aggregateAbaBoxScores([...game.lines, ...game.lines]);
    expect(totals.find((entry) => entry.playerId === '4672')).toBeUndefined();
    expect(totals.find((entry) => entry.playerId === '4807')?.stats).toMatchObject({
      games: 2,
      starts: 2,
      seconds: 1728,
      points: 20
    });
  });

  it('quién habló después del partido', () => {
    expect(game.speakers).toEqual(['Željko Obradović', 'Dejan Jakara']);
  });
});

describe('ABA: entrenadores por las declaraciones', () => {
  const played = (id: string, home: string, away: string, speakers: string[]): AbaGame => ({
    gameId: id,
    round: '',
    date: `2025-10-0${id}`,
    attendance: null,
    venue: null,
    home: { teamId: home, name: home, city: '', score: 80 },
    away: { teamId: away, name: away, city: '', score: 70 },
    lines: [],
    speakers
  });

  it('un nombre es del club que jugó todos sus partidos, y el otro del rival', () => {
    const byTeam = speakersByTeam([
      played('1', 'A', 'B', ['Ana', 'Beto']),
      played('2', 'A', 'C', ['Ana', 'Ciro']),
      played('3', 'B', 'C', ['Bruno', 'Ciro']),
      played('4', 'A', 'B', ['Ana', 'Bruno'])
    ]);
    expect(byTeam.get('A')).toEqual(['Ana']);
    expect(byTeam.get('C')).toEqual(['Ciro']);
    // Beto sólo habló una vez: es del rival de Ana.
    expect(byTeam.get('B')).toEqual(['Beto', 'Bruno']);
  });
});

describe('ABA: plantilla', () => {
  it('lee la plantilla de la temporada', () => {
    const roster = parseAbaRoster(fixture('aba-plantilla.html'));
    expect(roster).toHaveLength(3);
    expect(roster[0]).toEqual({
      playerId: '4799',
      fullName: 'Isaac Bonga',
      positionRaw: 'Forward',
      heightCm: 204,
      birthDate: '1999-11-08',
      nationalityRaw: 'DEU'
    });
    expect(roster[1]).toMatchObject({ fullName: 'Mitar Bošnjaković', nationalityRaw: 'SRB' });
  });
});

describe('ABA: nombres', () => {
  it('el acta dice dónde empieza el apellido del nombre legal', () => {
    expect(
      splitAbaName('Khalil Umar Mubaarak Brantley', 'Mubaarak Brantley K.', usualFirstName)
    ).toEqual({ firstName: 'Khalil', lastName: 'Mubaarak Brantley' });
    expect(splitAbaName('Victor Bailey Jr.', 'Bailey Jr. V.', usualFirstName)).toEqual({
      firstName: 'Victor',
      lastName: 'Bailey Jr.'
    });
    expect(splitAbaName('Dwayne Lee Bacon JR', 'Bacon JR D.', usualFirstName)).toEqual({
      firstName: 'Dwayne',
      lastName: 'Bacon Jr.'
    });
    expect(splitAbaName('Blaž Mahkovic', 'Mahkovic B.', usualFirstName)).toEqual({
      firstName: 'Blaž',
      lastName: 'Mahkovic'
    });
  });

  it('sin acta, el apellido es la última palabra con su sufijo', () => {
    expect(splitAbaName('Kasey Juwan Shepherd', null, usualFirstName)).toEqual({
      firstName: 'Kasey',
      lastName: 'Shepherd'
    });
    expect(splitAbaName('Souleymane Boum JR', null, usualFirstName)).toEqual({
      firstName: 'Souleymane',
      lastName: 'Boum Jr.'
    });
    expect(splitAbaName('Đorđe Ćurčić M.', null, usualFirstName)).toEqual({
      firstName: 'Đorđe',
      lastName: 'Ćurčić'
    });
  });
});
