import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { SourceStats } from '../lib/source-types';
import { matchBbref, parseBbrefTotals } from '../sources/esake-parse';
import { POWER_FORWARD_CM } from '../sources/lba-parse';
import {
  aggregateTblBoxScores,
  completeFromBbref,
  parseBbrefBio,
  parseTblGame,
  parseTblPlayerPage,
  parseTblStandings,
  parseTblTeamPage,
  POINT_GUARD_MAX_CM,
  splitTblName,
  tblDate,
  tblNationality,
  toBbrefPosition
} from '../sources/tblstat-parse';

/** Las fuentes de Turquía: tblstat.net y basketball-reference. */

const fixture = (name: string): string =>
  readFileSync(resolve(import.meta.dirname, 'fixtures', name), 'utf8');

describe('tblstat: clasificación', () => {
  it('lee puesto, id, nombre y balance', () => {
    expect(parseTblStandings(fixture('tblstat-clasificacion.html'))).toEqual([
      { rank: 1, teamId: '4', name: 'Kuzey Kartalları Beko', games: 30, wins: 25, losses: 5 },
      { rank: 2, teamId: '9', name: 'Güney Şahinleri GAİN', games: 30, wins: 25, losses: 5 }
    ]);
  });
});

describe('tblstat: ficha del equipo', () => {
  const page = parseTblTeamPage(fixture('tblstat-equipo.html'));

  it('lee el nombre del título', () => {
    expect(page.name).toBe('Kuzey Kartalları Beko');
  });

  it('lee los jugadores de las tres listas, con fecha, altura y bandera', () => {
    expect(page.players).toEqual([
      {
        playerId: '101',
        name: 'Ali Veli Yılmazer',
        games: 36,
        birthDate: '1999-02-15',
        heightCm: 190,
        flag: 'TR',
        country: 'Turkiye',
        section: 'plantilla'
      },
      {
        playerId: '102',
        name: 'John Doe Jr.',
        games: 11,
        birthDate: '1991-11-25',
        heightCm: null,
        flag: 'BA',
        country: 'Bosnia&Herz.',
        section: 'plantilla'
      },
      {
        playerId: '103',
        name: 'Genç Oyuncu',
        games: null,
        birthDate: '2009-03-30',
        heightCm: null,
        flag: 'TR',
        country: 'Turkiye',
        section: 'cantera'
      }
    ]);
  });

  it('lee los entrenadores, el de ahora el primero, con su bandera', () => {
    expect(page.coaches).toEqual([
      { name: 'Nuevo Entrenador', flag: 'ES', country: 'Spain' },
      { name: 'Primer Entrenador', flag: 'RS', country: 'Serbia' }
    ]);
  });
});

describe('tblstat: acta', () => {
  const game = parseTblGame(fixture('tblstat-acta.html'), '60007');

  it('lee fase, jornada, fecha, pabellón, equipos, tanteo y entrenadores', () => {
    expect(game).toMatchObject({
      gameId: '60007',
      phase: 'Regular Season',
      round: 1,
      date: '2025-09-26',
      venue: 'Pabellón Uno, İstanbul',
      homeId: '4',
      awayId: '9',
      homeScore: 20,
      awayScore: 5,
      homeCoach: 'Primer Entrenador',
      awayCoach: 'Otro Entrenador'
    });
  });

  it('lee las líneas de cada equipo y descarta a quien no jugó', () => {
    expect(game?.lines.map((line) => [line.teamId, line.playerId])).toEqual([
      ['4', '101'],
      ['4', '102'],
      ['9', '201']
    ]);
    expect(game?.lines[0]).toEqual({
      teamId: '4',
      playerId: '101',
      name: 'Ali Veli Yılmazer',
      seconds: 27 * 60 + 26,
      points: 16,
      rebounds: 2,
      assists: 3,
      steals: 1,
      turnovers: 1,
      rating: 17,
      freeThrowMade: 3,
      freeThrowAttempted: 6,
      twoPointMade: 5,
      twoPointAttempted: 5,
      threePointMade: 1,
      threePointAttempted: 2
    });
  });

  it('una página sin equipos no es un acta', () => {
    expect(parseTblGame('<html></html>', '1')).toBeNull();
  });

  it('suma las actas por jugador y equipo, con el rebote total como defensivo', () => {
    const lines = game?.lines ?? [];
    const totals = aggregateTblBoxScores([...lines, ...lines]);
    const first = totals.find((entry) => entry.playerId === '101');
    expect(first?.stats).toMatchObject({
      games: 2,
      starts: null,
      seconds: 2 * (27 * 60 + 26),
      points: 32,
      offensiveRebounds: 0,
      defensiveRebounds: 4,
      blocks: 0,
      blocksReceived: null,
      foulsDrawn: null,
      dunks: null,
      rating: 34
    });
    expect(totals).toHaveLength(3);
  });
});

describe('tblstat: ficha del jugador', () => {
  it('lee nacimiento, altura y bandera', () => {
    expect(parseTblPlayerPage(fixture('tblstat-jugador.html'), '102')).toEqual({
      playerId: '102',
      name: 'John Doe Jr.',
      games: null,
      birthDate: '1988-02-04',
      heightCm: 190,
      flag: 'FR',
      country: 'France'
    });
  });
});

describe('tblstat: normalización', () => {
  it('lee las fechas con puntos', () => {
    expect(tblDate('03.12.1997')).toBe('1997-12-03');
    expect(tblDate('')).toBeNull();
  });

  it('la nacionalidad sale de la bandera o, si no, del nombre del país', () => {
    expect(tblNationality('TR', 'Turkiye')).toBe('TUR');
    expect(tblNationality('GB', 'England')).toBe('GBR');
    expect(tblNationality(null, 'Bosnia&Herz.')).toBeNull();
    expect(tblNationality(null, 'Spain')).toBe('ESP');
  });

  it('parte el nombre por la última palabra, con sufijos y partículas', () => {
    expect(splitTblName('Ali Veli Yılmazer')).toEqual({
      firstName: 'Ali Veli',
      lastName: 'Yılmazer'
    });
    expect(splitTblName('John Doe Jr.')).toEqual({ firstName: 'John', lastName: 'Doe Jr.' });
    expect(splitTblName('Jan van der Berg')).toEqual({
      firstName: 'Jan',
      lastName: 'van der Berg'
    });
    expect(splitTblName('Solo')).toEqual({ firstName: '', lastName: 'Solo' });
  });
});

describe('basketball-reference para Turquía', () => {
  const stats = (games: number, points: number, rebounds: number): SourceStats => ({
    games,
    starts: null,
    seconds: 194 * 60,
    points,
    twoPointMade: 0,
    twoPointAttempted: 0,
    threePointMade: 10,
    threePointAttempted: 0,
    freeThrowMade: 14,
    freeThrowAttempted: 0,
    offensiveRebounds: 0,
    defensiveRebounds: rebounds,
    assists: 16,
    steals: 0,
    turnovers: 0,
    blocks: 0,
    blocksReceived: null,
    dunks: null,
    fouls: 0,
    foulsDrawn: null,
    rating: null
  });

  it('lee de la tabla de totales rebotes de ataque y defensa, tapones y faltas', () => {
    const [row] = parseBbrefTotals(fixture('bbref-totales-tur.html'));
    expect(row).toMatchObject({
      teamSlug: 'kuzey',
      games: 14,
      rebounds: 13,
      offensiveRebounds: 1,
      defensiveRebounds: 12,
      blocks: 7,
      fouls: 20
    });
  });

  it('la tabla sin esas columnas no las inventa', () => {
    const [row] = parseBbrefTotals(fixture('bbref-totales.html'));
    expect(row).not.toHaveProperty('offensiveRebounds');
    expect(completeFromBbref(stats(24, 301, 150), row!)).toBe(false);
  });

  it('empareja por estadísticas y completa los totales de tblstat', () => {
    const rows = parseBbrefTotals(fixture('bbref-totales-tur.html'));
    const player = { stats: stats(14, 66, 13) };
    const matched = matchBbref([player], rows);
    const row = matched.get(player);
    expect(row).toBeDefined();
    expect(completeFromBbref(player.stats, row!)).toBe(true);
    expect(player.stats).toMatchObject({
      offensiveRebounds: 1,
      defensiveRebounds: 12,
      blocks: 7,
      fouls: 20
    });
  });

  it('si los rebotes no suman igual, reparte el total de tblstat en su proporción', () => {
    const [row] = parseBbrefTotals(fixture('bbref-totales-tur.html'));
    const own = stats(14, 66, 26);
    completeFromBbref(own, row!);
    expect(own.offensiveRebounds + own.defensiveRebounds).toBe(26);
    expect(own.offensiveRebounds).toBe(2);
  });

  it('lee de la ficha el puesto, la altura, el peso y el nacimiento', () => {
    expect(parseBbrefBio(fixture('bbref-ficha.html'))).toEqual({
      position: 'Guard',
      heightCm: 188,
      weightKg: 86,
      birthDate: '1993-03-04'
    });
    expect(parseBbrefBio('<html></html>')).toEqual({
      position: null,
      heightCm: null,
      weightKg: null,
      birthDate: null
    });
  });

  it('separa «Guard» y «Forward» por altura', () => {
    expect(toBbrefPosition('Guard', POINT_GUARD_MAX_CM)).toBe('PG');
    expect(toBbrefPosition('Guard', POINT_GUARD_MAX_CM + 1)).toBe('SG');
    expect(toBbrefPosition('Guard', null)).toBe('SG');
    expect(toBbrefPosition('Forward', POWER_FORWARD_CM)).toBe('PF');
    expect(toBbrefPosition('Forward', POWER_FORWARD_CM - 1)).toBe('SF');
    expect(toBbrefPosition('Forward and Center', 210)).toBe('PF');
    expect(toBbrefPosition('Center', 200)).toBe('C');
    expect(toBbrefPosition('Point Guard', 200)).toBe('PG');
    expect(toBbrefPosition(null, 200)).toBeNull();
  });
});
