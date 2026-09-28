import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  aggregateLklBoxScores,
  findLivewireLazy,
  lklNationality,
  lklPosition,
  parseLivewireUpdate,
  parseLklBoxScore,
  parseLklHistory,
  parseLklPlayerPage,
  parseLklSquad,
  parseLklStandings
} from '../sources/lkl-parse';
import {
  basketnewsNationality,
  nationFromLithuanian,
  nklPosition,
  parseBasketnewsGame,
  parseBasketnewsPlayer,
  parseNklCalendar,
  parseNklStandings,
  splitBasketnewsName
} from '../sources/nkl-parse';

/**
 * Las fuentes de Lituania: lkl.lt (la LKL) y, para la NKL, el calendario de
 * nkl.lt y las actas y fichas de basketnews.lt.
 */

const fixture = (name: string): string =>
  readFileSync(resolve(import.meta.dirname, 'fixtures', name), 'utf8');

describe('LKL: puestos y países', () => {
  it('separa por altura los tres puestos de la web', () => {
    expect(lklPosition('Gynėjas', 186)).toBe('PG');
    expect(lklPosition('Gynėjas', 191)).toBe('SG');
    expect(lklPosition('Puolėjas', 201)).toBe('SF');
    expect(lklPosition('Puolėjas', 205)).toBe('PF');
    expect(lklPosition('Centras', 208)).toBe('C');
    // Sin altura, exterior y alero en lo más común.
    expect(lklPosition('Gynėjas', null)).toBe('SG');
    expect(lklPosition('Puolėjas', null)).toBe('SF');
    expect(lklPosition('Treneris', 190)).toBeNull();
    expect(lklPosition(null, 190)).toBeNull();
  });

  it('toma el código COI de la plantilla o la bandera de la ficha', () => {
    expect(lklNationality(['LTU', 'us'])).toBe('LTU');
    expect(lklNationality([null, 'us'])).toBe('USA');
    expect(lklNationality(['', 'lv'])).toBe('LAT');
    expect(lklNationality([])).toBeNull();
  });
});

describe('LKL: clasificación', () => {
  it('lee sólo la tabla general, con el slug de cada club', () => {
    expect(parseLklStandings(fixture('lkl-clasificacion.html'))).toEqual([
      { rank: 1, slug: 'sauliai', name: 'Šauliai', games: 32, wins: 31, losses: 1 },
      { rank: 2, slug: 'ezeras-remejas', name: 'Ežero Rėmėjas', games: 32, wins: 20, losses: 12 }
    ]);
  });
});

describe('LKL: acta en JSON', () => {
  const game = parseLklBoxScore(fixture('lkl-acta.json'), '900')!;

  it('reconoce el lado de casa por los puntos', () => {
    expect(game).toMatchObject({
      gameId: '900',
      homeId: '41',
      awayId: '3',
      homeScore: 78,
      awayScore: 81
    });
    expect(game.lines).toHaveLength(4);
  });

  it('lee cada línea con rebotes, faltas y tapones puestos y recibidos', () => {
    expect(game.lines[0]).toEqual({
      slug: 'antanas-pirmas',
      teamId: '41',
      name: 'A. Pirmas',
      starter: true,
      seconds: 23 * 60 + 30,
      points: 70,
      twoPointMade: 20,
      twoPointAttempted: 30,
      threePointMade: 5,
      threePointAttempted: 10,
      freeThrowMade: 15,
      freeThrowAttempted: 20,
      offensiveRebounds: 2,
      defensiveRebounds: 4,
      assists: 2,
      steals: 1,
      turnovers: 1,
      blocks: 3,
      blocksReceived: 1,
      fouls: 1,
      foulsDrawn: 2,
      rating: 40
    });
    expect(game.lines[3]).toMatchObject({ slug: 'dainius-svecias', teamId: '3', starter: false });
  });

  it('suma los partidos jugados; el que no salió del banquillo no cuenta', () => {
    const totals = aggregateLklBoxScores([...game.lines, ...game.lines]);
    expect(totals.map((entry) => entry.slug)).toEqual([
      'antanas-pirmas',
      'bronius-antras',
      'dainius-svecias'
    ]);
    expect(totals[0]!.stats).toMatchObject({ games: 2, starts: 2, points: 140, seconds: 2820 });
    expect(totals[1]!.stats).toMatchObject({ games: 2, starts: 0, fouls: 4 });
  });

  it('un JSON que no es un acta es null', () => {
    expect(parseLklBoxScore('{"gameStatistics":{}}', '1')).toBeNull();
    expect(parseLklBoxScore('<html>', '1')).toBeNull();
  });
});

describe('LKL: plantilla, Livewire, ficha e historial', () => {
  it('lee la plantilla de la temporada', () => {
    expect(parseLklSquad(fixture('lkl-plantilla.html'))).toEqual([
      {
        slug: 'antanas-pirmas',
        fullName: 'Antanas Pirmas',
        shirtNumber: 1,
        positionRaw: 'Gynėjas',
        heightCm: 186,
        weightKg: 84,
        birthDate: '1999-02-03',
        nationalityRaw: 'LTU'
      },
      {
        slug: 'jonas-ilgas-antras',
        fullName: 'Jonas Ilgas-Antras',
        shirtNumber: 44,
        positionRaw: 'Puolėjas',
        heightCm: 207,
        weightKg: null,
        birthDate: null,
        nationalityRaw: null
      }
    ]);
  });

  it('encuentra el componente perezoso de la plantilla y el token', () => {
    expect(findLivewireLazy(fixture('lkl-club.html'), 'team-squad')).toEqual({
      csrf: 'TOKEN123',
      snapshot:
        '{"data":{"teamId":3,"currentSeasonId":2,"seasonId":null},"memo":{"id":"bbb","name":"team-squad"}}',
      lazyParam: 'eyJQUk9CQSI6MX0='
    });
    expect(findLivewireLazy(fixture('lkl-club.html'), 'no-existe')).toBeNull();
    expect(
      parseLivewireUpdate('{"components":[{"snapshot":"{}","effects":{"html":"<table></table>"}}]}')
    ).toEqual({ html: '<table></table>', snapshot: '{}' });
    expect(parseLivewireUpdate('{"components":[]}')).toBeNull();
  });

  it('lee la ficha: id, nombre partido, puesto, fecha, banderas, altura y peso', () => {
    expect(parseLklPlayerPage(fixture('lkl-ficha.html'))).toEqual({
      playerId: '2003',
      firstName: 'Dainius',
      lastName: 'Svečias Jr.',
      positionRaw: 'Centras',
      birthDate: '1996-01-08',
      flags: ['us', 'lt'],
      heightCm: 210,
      weightKg: 109
    });
    expect(parseLklPlayerPage('<html></html>')).toBeNull();
  });

  it('lee el historial de liga regular: partidos y de titular por temporada y club', () => {
    expect(parseLklHistory(fixture('lkl-historial.html'))).toEqual([
      { team: 'Ežero Rėmėjas', season: '2025-2026', games: 11, starts: 9 },
      { team: 'Šauliai', season: '2024-2025', games: 30, starts: 2 }
    ]);
  });
});

describe('NKL: calendario y clasificación de nkl.lt', () => {
  it('lee los partidos de la temporada con su fase, sin repetir', () => {
    expect(parseNklCalendar(fixture('nkl-calendario.html'), 2025)).toEqual([
      {
        gameId: '501',
        stageId: '2639',
        date: '2025-10-02',
        homeId: '71',
        awayId: '72',
        homeScore: 78,
        awayScore: 89
      },
      {
        gameId: '502',
        stageId: '2672',
        date: '2026-04-02',
        homeId: '72',
        awayId: '71',
        homeScore: 90,
        awayScore: 80
      }
    ]);
    expect(parseNklCalendar(fixture('nkl-calendario.html'), 2026)[0]).toMatchObject({
      gameId: '601',
      homeScore: null
    });
  });

  it('lee la clasificación con el id de cada club', () => {
    expect(parseNklStandings(fixture('nkl-clasificacion.html'))).toEqual([
      { rank: 1, teamId: '72', name: 'Kalno Klubas', games: 32, wins: 28, losses: 4 },
      { rank: 2, teamId: '71', name: 'Ežero Klubas', games: 32, wins: 23, losses: 9 }
    ]);
  });
});

describe('NKL: actas y fichas de basketnews', () => {
  it('parte el nombre por el espacio doble entre nombre y apellido', () => {
    expect(splitBasketnewsName('John Michael  Doe Jr')).toEqual({
      firstName: 'John Michael',
      lastName: 'Doe Jr'
    });
    expect(splitBasketnewsName('Antanas Pirmas')).toEqual({
      firstName: 'Antanas',
      lastName: 'Pirmas'
    });
    expect(splitBasketnewsName('Solo')).toEqual({ firstName: '', lastName: 'Solo' });
  });

  const game = parseBasketnewsGame(fixture('basketnews-acta.html'), '501')!;

  it('lee los dos equipos, el de casa primero, con el entrenador del partido', () => {
    expect(game.home).toEqual({
      teamId: '71',
      name: 'Ežero Klubas-Rėmėjas',
      coach: 'Petras Treneris'
    });
    expect(game.away).toEqual({ teamId: '72', name: 'Kalno Klubas', coach: null });
    expect(game.lines.map((line) => [line.playerId, line.teamId])).toEqual([
      ['9001', '71'],
      ['9002', '71'],
      ['9003', '72']
    ]);
  });

  it('lee cada línea por la cabecera, con el titular marcado', () => {
    expect(game.lines[0]).toEqual({
      playerId: '9001',
      teamId: '71',
      firstName: 'Antanas',
      lastName: 'Pirmas',
      starter: true,
      seconds: 35 * 60 + 57,
      points: 17,
      twoPointMade: 3,
      twoPointAttempted: 5,
      threePointMade: 3,
      threePointAttempted: 7,
      freeThrowMade: 2,
      freeThrowAttempted: 3,
      defensiveRebounds: 3,
      offensiveRebounds: 1,
      assists: 5,
      steals: 1,
      turnovers: 3,
      blocks: 0,
      blocksReceived: 2,
      fouls: 2,
      foulsDrawn: 7,
      rating: 21
    });
    expect(game.lines[1]).toMatchObject({ starter: false, firstName: 'John Michael' });
  });

  it('el orden del rebote sale de la cabecera («REB O-D» en el visitante)', () => {
    expect(game.lines[2]).toMatchObject({ offensiveRebounds: 4, defensiveRebounds: 6 });
  });

  it('lee la ficha: nombre, puesto, altura, fecha y ciudadanías', () => {
    const player = parseBasketnewsPlayer(fixture('basketnews-ficha.html'))!;
    expect(player).toEqual({
      firstName: 'John Michael',
      lastName: 'Doe Jr',
      positionRaw: 'SG, SF',
      heightCm: 197,
      weightKg: null,
      birthDate: '1995-01-27',
      flags: ['us'],
      citizenships: ['JAV', 'Latvijos']
    });
    expect(basketnewsNationality(player)).toBe('USA');
    expect(basketnewsNationality({ flags: [], citizenships: ['Latvijos'] })).toBe('LAT');
    expect(parseBasketnewsPlayer('<html></html>')).toBeNull();
  });

  it('el puesto es el primero de los dos', () => {
    expect(nklPosition('SG, SF')).toBe('SG');
    expect(nklPosition('PF, C')).toBe('PF');
    expect(nklPosition('C')).toBe('C');
    expect(nklPosition(null)).toBeNull();
  });

  it('entiende los países en lituano, en genitivo o nominativo', () => {
    expect(nationFromLithuanian('Lietuvos')).toBe('LTU');
    expect(nationFromLithuanian('LIETUVA')).toBe('LTU');
    expect(nationFromLithuanian('JAV')).toBe('USA');
    expect(nationFromLithuanian('Bosnijos ir Hercegovinos')).toBe('BIH');
    expect(nationFromLithuanian('Serbia')).toBe('SRB');
    expect(nationFromLithuanian('Nežinoma')).toBeNull();
  });
});
