import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { SourceStats } from '../lib/source-types';
import {
  accentName,
  adcName,
  aggregateAdcBoxScores,
  looksForeign,
  MIN_MINUTES_FOR_POSITION,
  parseAdcBoxScore,
  parseAdcCalendar,
  parseAdcPlayerPage,
  parseWikiRoster,
  positionFromStats,
  sameWikiPlayer,
  wikiNationality,
  wikiPosition
} from '../sources/adc-parse';

/** laliganacional.com.ar (la web de la AdC) y las plantillas de la Wikipedia en español. */

const fixture = (name: string): string =>
  readFileSync(resolve(import.meta.dirname, 'fixtures', name), 'utf8');

describe('AdC: calendario de un equipo', () => {
  const games = parseAdcCalendar(fixture('adc-calendario.html'));

  it('lee local, visitante, fecha, pabellón, tanteo y enlace al acta', () => {
    expect(games).toHaveLength(4);
    expect(games[0]).toEqual({
      home: { clubId: '19', teamId: '88922', slug: 'boca', name: 'BOCA' },
      away: { clubId: '1992', teamId: '89551', slug: 'racing-ch', name: 'RACING (CH)' },
      date: '2025-09-24',
      time: '21:30',
      venue: 'LUIS CONDE',
      homeScore: 82,
      awayScore: 67,
      link: '/laliga/partido/v2OfJwdtendcZVQENr4npy8Ee5QbIe7JOaMBy7qB3sQtr8zx7sam7sBA==/boca-vs-racing-ch'
    });
    // Los nombres con tilde vienen como entidades HTML.
    expect(games[1]?.away.name).toBe('SAN MARTÍN (C)');
  });

  it('mezcla la liga con las copas (la Supercopa, en Córdoba) y trae los no jugados sin fecha', () => {
    expect(games[2]).toMatchObject({
      date: '2026-03-05',
      venue: 'ESTRUCTURAS PRETENSA ATENAS',
      homeScore: 81,
      awayScore: 86
    });
    expect(games[3]).toMatchObject({ date: null, time: null, homeScore: 0, awayScore: 0 });
  });
});

describe('AdC: acta', () => {
  const html = fixture('adc-acta.html');
  const box = parseAdcBoxScore(html);

  it('el primer entrenador de cada equipo, por id de equipo', () => {
    expect(box?.coaches).toEqual(
      new Map([
        ['88922', 'PEREZ, GONZALO FRANCISCO'],
        ['89551', 'BEGUERIE, CARLOS ELIAS']
      ])
    );
  });

  it('una línea por jugador, con minutos en segundos, titular y lo recibido', () => {
    expect(box?.lines).toHaveLength(3);
    expect(box?.lines[2]).toEqual({
      teamId: '89551',
      clubId: '1992',
      playerId: '380597',
      shortName: 'COOPER, T.',
      fullName: 'COOPER, THOMAS',
      slug: 'thomas-cooper',
      shirtNumber: 2,
      starter: true,
      seconds: 34 * 60 + 16,
      points: 11,
      twoPointMade: 4,
      twoPointAttempted: 14,
      threePointMade: 1,
      threePointAttempted: 6,
      freeThrowMade: 0,
      freeThrowAttempted: 0,
      offensiveRebounds: 0,
      defensiveRebounds: 3,
      assists: 5,
      steals: 1,
      turnovers: 1,
      blocks: 0,
      blocksReceived: 0,
      fouls: 0,
      foulsDrawn: 6,
      rating: 10
    });
  });

  it('se salta las filas de totales (id 0) y lo que no es un acta', () => {
    const withTotals = html.replace('&quot;IdJugador&quot;:379572', '&quot;IdJugador&quot;:0');
    expect(parseAdcBoxScore(withTotals)?.lines).toHaveLength(2);
    expect(parseAdcBoxScore('<html>Error interno</html>')).toBeNull();
  });

  it('suma las actas por jugador y equipo', () => {
    const lines = box?.lines ?? [];
    const [stats] = aggregateAdcBoxScores([...lines, ...lines]).filter(
      (entry) => entry.playerId === '380597'
    );
    expect(stats?.stats).toMatchObject({ games: 2, starts: 2, seconds: 2 * 2056, points: 22 });
  });
});

describe('AdC: ficha', () => {
  it('sólo trae la fecha de nacimiento', () => {
    expect(parseAdcPlayerPage(fixture('adc-ficha.html'))).toBe('1999-02-02');
    expect(parseAdcPlayerPage('<div class="datos-jugador"></div>')).toBeNull();
  });
});

describe('AdC: nombres', () => {
  it('apellido de uso del acta, primer nombre de pila y las tildes del diccionario', () => {
    expect(adcName('GUERRERO, J.', 'GUERRERO MARGARIT, JUAN MARTIN', null, true)).toEqual({
      firstName: 'Juan Martín',
      lastName: 'Guerrero'
    });
    expect(adcName('FERNANDEZ, V.', 'FERNANDEZ, VICTOR LUIS', null, true)).toEqual({
      firstName: 'Víctor',
      lastName: 'Fernández'
    });
  });

  it('las tildes de la Wikipedia mandan; a los de fuera no se les ponen las del diccionario', () => {
    expect(adcName('CAFFARO, F.', 'CAFFARO, FRANCISCO', 'Francisco Cáffaro', true)).toEqual({
      firstName: 'Francisco',
      lastName: 'Cáffaro'
    });
    expect(adcName('MARTIN, T.', 'MARTIN, TYLER', null, false).lastName).toBe('Martin');
    expect(accentName('Nicolas Perez', null, true)).toBe('Nicolás Pérez');
    // Una palabra de la Wikipedia que no es la misma no se cuela.
    expect(accentName('Agustin Barreiro', 'Agustín Bareiro', true)).toBe('Agustín Barreiro');
  });

  it('los sufijos anglosajones siempre igual', () => {
    expect(adcName('TATE JR, D.', 'TATE JR, DANA D', null, false)).toEqual({
      firstName: 'Dana',
      lastName: 'Tate Jr.'
    });
    expect(adcName('HUGHES III, J.', 'HUGHES III, JOHNNY VANTE', null, false).lastName).toBe(
      'Hughes III'
    );
    // El corto a veces lo pierde.
    expect(adcName('ROBINSON, D.', 'ROBINSON III, DONALD LEE', null, false).lastName).toBe(
      'Robinson III'
    );
  });

  it('avisa de los nombres que no suenan de aquí', () => {
    expect(looksForeign('SABIN, TYLER FRANCIS')).toBe(true);
    expect(looksForeign('RUSSELL JR, DWAYNE MAURICE')).toBe(true);
    expect(looksForeign('BALBI, FRANCO NICOLAS')).toBe(false);
    expect(looksForeign('VAZQUEZ, FACUNDO')).toBe(false);
  });
});

describe('AdC: plantillas de la Wikipedia', () => {
  const roster = parseWikiRoster(fixture('adc-wiki-club.txt'));

  it('lee las dos plantillas (player2 y la española) con nombre, país, puesto, altura y fecha', () => {
    expect(roster).toHaveLength(6);
    expect(roster[0]).toEqual({
      name: 'Wayne Langston',
      nationalityRaw: 'USA',
      positionRaw: 'C',
      heightCm: 201,
      birthDate: '1993-10-26'
    });
    expect(roster[2]?.name).toBe('Sebastián Vega');
    expect(roster[4]).toMatchObject({ name: 'Francisco Cáffaro', heightCm: 216, positionRaw: 'P' });
    expect(roster[5]).toMatchObject({ heightCm: null, birthDate: null });
  });

  it('nacionalidad en COI, ISO o en español', () => {
    expect(wikiNationality('ARG')).toBe('ARG');
    expect(wikiNationality('BHS')).toBe('BAH');
    expect(wikiNationality('Cabo Verde')).toBe('CPV');
    expect(wikiNationality('')).toBeNull();
  });

  it('puesto en español o inglés; «G» y «F» quedan para las estadísticas', () => {
    expect(wikiPosition('B')).toBe('PG');
    expect(wikiPosition('E')).toBe('SG');
    expect(wikiPosition('A')).toBe('SF');
    expect(wikiPosition('AP')).toBe('PF');
    expect(wikiPosition('P')).toBe('C');
    expect(wikiPosition('PF')).toBe('PF');
    expect(wikiPosition('G')).toBe('G');
    expect(wikiPosition('-')).toBeNull();
  });

  it('casa al jugador del acta con el de la Wikipedia por nombre de pila y apellido', () => {
    expect(sameWikiPlayer('CAFFARO, FRANCISCO', 'Francisco Cáffaro')).toBe(true);
    expect(sameWikiPlayer('GUERRERO MARGARIT, JUAN MARTIN', 'Juan Martín Guerrero')).toBe(true);
    expect(sameWikiPlayer('BARREIRO, AGUSTIN', 'Agustín Bareiro')).toBe(false);
    expect(sameWikiPlayer('SMITH, MICHAEL JUSTICE', 'Dylan Smith')).toBe(false);
  });
});

describe('AdC: puesto por las estadísticas', () => {
  /** Estadísticas de 1.000 minutos con estos números por 36 minutos. */
  const per36 = (numbers: {
    assists: number;
    rebounds: number;
    offensive?: number;
    blocks?: number;
    threeShare: number;
  }): SourceStats => {
    const factor = 1000 / 36;
    const attempts = 400;
    const offensive = numbers.offensive ?? numbers.rebounds * 0.25;
    return {
      games: 30,
      starts: 30,
      seconds: 1000 * 60,
      points: 400,
      twoPointMade: 0,
      twoPointAttempted: Math.round(attempts * (1 - numbers.threeShare)),
      threePointMade: 0,
      threePointAttempted: Math.round(attempts * numbers.threeShare),
      freeThrowMade: 0,
      freeThrowAttempted: 0,
      offensiveRebounds: offensive * factor,
      defensiveRebounds: (numbers.rebounds - offensive) * factor,
      assists: numbers.assists * factor,
      steals: 0,
      turnovers: 0,
      blocks: (numbers.blocks ?? 0) * factor,
      blocksReceived: 0,
      dunks: null,
      fouls: 0,
      foulsDrawn: 0,
      rating: 0
    };
  };

  it('pívot: casi sin triples y muchos rebotes, o muchos ofensivos', () => {
    expect(positionFromStats(per36({ assists: 1.5, rebounds: 10, threeShare: 0.03 }))).toBe('C');
    expect(
      positionFromStats(per36({ assists: 1.5, rebounds: 9, offensive: 3.6, threeShare: 0.3 }))
    ).toBe('C');
  });

  it('ala-pívot: muchos rebotes y pocas asistencias', () => {
    expect(positionFromStats(per36({ assists: 1.4, rebounds: 7, threeShare: 0.4 }))).toBe('PF');
  });

  it('base, escolta y alero por las asistencias', () => {
    expect(positionFromStats(per36({ assists: 4.1, rebounds: 4.8, threeShare: 0.5 }))).toBe('PG');
    expect(positionFromStats(per36({ assists: 2.6, rebounds: 4.5, threeShare: 0.55 }))).toBe('SG');
    expect(positionFromStats(per36({ assists: 1.8, rebounds: 5.8, threeShare: 0.55 }))).toBe('SF');
    // Un ala-pívot que reparte mucho es base, no ala-pívot.
    expect(positionFromStats(per36({ assists: 3.5, rebounds: 7, threeShare: 0.4 }))).toBe('PG');
  });

  it('con «G» o «F» de la Wikipedia, sólo decide entre los dos', () => {
    expect(positionFromStats(per36({ assists: 3.2, rebounds: 4, threeShare: 0.5 }), 'G')).toBe(
      'PG'
    );
    expect(positionFromStats(per36({ assists: 1, rebounds: 9, threeShare: 0.05 }), 'G')).toBe('SG');
    expect(positionFromStats(per36({ assists: 1, rebounds: 9, threeShare: 0.05 }), 'F')).toBe('PF');
  });

  it(`con menos de ${MIN_MINUTES_FOR_POSITION} minutos no se decide`, () => {
    const few = { ...per36({ assists: 5, rebounds: 3, threeShare: 0.5 }), seconds: 30 * 60 };
    expect(positionFromStats(few)).toBeNull();
    expect(positionFromStats(few, 'G')).toBe('SG');
    expect(positionFromStats(null)).toBeNull();
  });
});
