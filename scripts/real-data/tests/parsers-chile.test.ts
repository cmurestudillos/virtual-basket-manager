import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  aggregateGeniusBoxScores,
  applyLiveStats,
  chileanName,
  chileanPosition,
  geniusDate,
  geniusHtml,
  parseGeniusBoxScore,
  parseGeniusRoster,
  parseGeniusSchedule,
  parseGeniusStaff,
  parseGeniusTeams,
  parseLiveStats,
  parseWikiForeigners,
  parseWikiTableRoster,
  sameChileanPlayer
} from '../sources/lnbch-parse';

/** La LNB chilena: Genius Sports («hosted» y FIBA LiveStats) y la Wikipedia en español. */

const fixture = (name: string): string =>
  readFileSync(resolve(import.meta.dirname, 'fixtures', name), 'utf8');

describe('Genius «hosted»: equipos y calendario', () => {
  it('el HTML viene dentro de un JSON; los equipos, con su id', () => {
    const html = geniusHtml(fixture('lnbch-equipos.json'));
    expect(html).not.toBeNull();
    expect(parseGeniusTeams(html!)).toEqual([
      { teamId: '23020', name: 'CD ABA ANCUD' },
      { teamId: '23113', name: 'CD ESPANOL OSORNO' },
      { teamId: '23021', name: 'CD ESPANOL TALCA' }
    ]);
    expect(geniusHtml('<html>404</html>')).toBeNull();
  });

  it('las fechas en español abreviado («25 sept. 2025 19:00»)', () => {
    expect(geniusDate('25 sept. 2025 19:00')).toEqual({ date: '2025-09-25', time: '19:00' });
    expect(geniusDate('3 may. 2026 20:00')).toEqual({ date: '2026-05-03', time: '20:00' });
    expect(geniusDate('mañana')).toEqual({ date: null, time: null });
  });

  it('los partidos de una fase: local, visitante, tanteo y pabellón', () => {
    const games = parseGeniusSchedule(fixture('lnbch-calendario.html'));
    expect(games).toEqual([
      {
        gameId: '2803264',
        date: '2026-03-25',
        time: '19:30',
        venue: 'CASA DEL DEPORTE',
        homeId: '23013',
        awayId: '23012',
        homeScore: 105,
        awayScore: 72
      },
      {
        gameId: '2803263',
        date: '2026-03-25',
        time: '20:30',
        venue: 'CEO 2',
        homeId: '23016',
        // Puente Alto: en el Apertura, otro id que en la Transición (23017).
        awayId: '69206',
        homeScore: 83,
        awayScore: 91
      }
    ]);
  });
});

describe('Genius «hosted»: plantilla y cuerpo técnico', () => {
  const roster = parseGeniusRoster(fixture('lnbch-plantilla.html'));

  it('id de persona, dorsal, fecha y nacionalidad; la altura sólo si es creíble', () => {
    expect(roster).toHaveLength(4);
    expect(roster[1]).toEqual({
      personId: '224661',
      shirtNumber: 4,
      shortName: 'D. Jones Navarrete',
      positionRaw: 'SF',
      birthDate: '1994-01-24',
      nationality: 'CHI',
      heightCm: 191
    });
    // Nacionalidad vacía (un nacionalizado) y sin altura.
    expect(roster[2]).toMatchObject({ shortName: 'S. Mijares Machado', nationality: null });
    expect(roster[0]?.heightCm).toBeNull();
  });

  it('el primer entrenador, una vez aunque salga repetido', () => {
    expect(parseGeniusStaff(fixture('lnbch-staff.html'))).toEqual(['Gomez Martinez, Santiago']);
  });
});

describe('Genius: acta y LiveStats', () => {
  const box = parseGeniusBoxScore(fixture('lnbch-acta.html'));

  it('una tabla por equipo, local primero, con el id de persona y las columnas por su título', () => {
    expect(box?.teams.map((team) => [team.teamId, team.name, team.lines.length])).toEqual([
      ['23017', 'MUN. PUENTE ALTO', 3],
      ['23021', 'CD ESPANOL TALCA', 2]
    ]);
    expect(box?.teams[0]?.lines[1]).toEqual({
      teamId: '23017',
      personId: '216574',
      shirtNumber: 14,
      shortName: 'J. Pino Hernandez',
      starter: false,
      seconds: 33 * 60 + 4,
      points: 8,
      twoPointMade: 4,
      twoPointAttempted: 4,
      threePointMade: 0,
      threePointAttempted: 4,
      freeThrowMade: 0,
      freeThrowAttempted: 0,
      offensiveRebounds: 1,
      defensiveRebounds: 7,
      assists: 0,
      steals: 4,
      turnovers: 1,
      blocks: 2,
      blocksReceived: 0,
      fouls: 4,
      foulsDrawn: 0,
      rating: 17
    });
    expect(parseGeniusBoxScore('<html></html>')).toBeNull();
  });

  it('el data.json: nombre legal, titulares, faltas recibidas y entrenador', () => {
    const live = parseLiveStats(fixture('lnbch-livestats.json'));
    expect(live?.complete).toBe(true);
    expect(
      live?.teams.map((team) => [team.name, team.code, team.coach, team.score, team.players.length])
    ).toEqual([
      ['MUN. PUENTE ALTO', 'PUE', 'Alvaro Chacon Escobar', 65, 12],
      ['CD ESPANOL TALCA', 'EST', 'Hector Vera Alfaro', 60, 12]
    ]);
    const lines = parseGeniusBoxScore(fixture('lnbch-acta.html'))!.teams[0]!.lines;
    expect(applyLiveStats(lines, live!.teams[0])).toBe(3);
    expect(lines.map((line) => [line.shortName, line.starter, line.foulsDrawn])).toEqual([
      ['B. Araya Ulloa', false, 0],
      ['J. Pino Hernandez', true, 2],
      ['R. Brown', true, 5]
    ]);
  });

  it('un data.json sin números no vale', () => {
    expect(parseLiveStats(fixture('lnbch-livestats-vacia.json'))?.complete).toBe(false);
    expect(parseLiveStats('no es json')).toBeNull();
  });

  it('suma por persona y equipo sólo los partidos que jugó', () => {
    const lines = box!.teams.flatMap((team) => team.lines);
    const totals = aggregateGeniusBoxScores([...lines, ...lines]);
    // Araya no jugó: no cuenta.
    expect(totals.map((entry) => entry.personId)).toEqual([
      '216574',
      '792739',
      '2202800',
      '2507743'
    ]);
    expect(totals[0]?.stats).toMatchObject({ games: 2, points: 16, seconds: 2 * 1984 });
  });
});

describe('nombres', () => {
  it('primer apellido y tildes de la Wikipedia en los chilenos', () => {
    expect(chileanName('Benjamin', 'Herrera Alvarez', 'Benjamín Herrera Álvarez', 'CHI')).toEqual({
      firstName: 'Benjamín',
      lastName: 'Herrera'
    });
    // Sin Wikipedia, las del diccionario.
    expect(chileanName('Tomas', 'Gonzalez Perez', null, 'CHI')).toEqual({
      firstName: 'Tomás',
      lastName: 'González'
    });
    expect(chileanName('Juan', 'De La Fuente Soto', null, 'CHI').lastName).toBe('De la Fuente');
  });

  it('los de fuera, con el apellido entero y los sufijos bien', () => {
    expect(chileanName('Anthony', 'Duncan Ii', null, 'USA')).toEqual({
      firstName: 'Anthony',
      lastName: 'Duncan II'
    });
    expect(chileanName('David', 'Ferreira Chaves', null, 'BRA').lastName).toBe('Ferreira Chaves');
  });

  it('casa el nombre legal con el de la Wikipedia', () => {
    expect(sameChileanPlayer('Barham', 'Amor Alvear', 'Barham Amor')).toBe(true);
    expect(sameChileanPlayer('Darrol', 'Jones Navarrete', 'Darrol Jones Navarrete')).toBe(true);
    expect(sameChileanPlayer('Ty', 'Jones Cisternas', 'Darrol Jones Navarrete')).toBe(false);
  });
});

describe('Wikipedia en español', () => {
  const rows = parseWikiTableRoster(fixture('lnbch-wiki-club.txt'));

  it('las tablas de plantilla, con las columnas en cualquier orden', () => {
    expect(rows[0]).toEqual({
      name: 'Darrol Jones Navarrete',
      nationalityRaw: 'CHI',
      positionRaw: 'A',
      heightCm: 195,
      birthDate: '1994-01-24'
    });
    // Dos banderas: un nacionalizado.
    expect(rows[2]).toMatchObject({ name: 'Sergio Mijares Machado', nationalityRaw: 'VEN/CHI' });
    // Puesto antes que la bandera, y «m=2» son dos metros.
    expect(rows.find((row) => row.name === 'Jahsean Corbett')).toMatchObject({
      nationalityRaw: 'VIR',
      positionRaw: 'A',
      heightCm: 198
    });
    expect(rows.find((row) => row.name === 'Máximo González Barros')?.heightCm).toBe(200);
    // Sin puesto, sin altura; con la edad en años, sin fecha.
    expect(rows[1]).toMatchObject({ positionRaw: null, heightCm: null });
    expect(rows[3]?.birthDate).toBeNull();
    // El formato viejo: puesto, dorsal, bandera con el nombre del país y «(J)».
    expect(rows.at(-3)).toMatchObject({
      name: 'Máximo González Barros',
      nationalityRaw: 'Chile',
      positionRaw: 'P'
    });
  });

  it('la tabla de extranjeros de un torneo, con los cortados', () => {
    const foreigners = parseWikiForeigners(fixture('lnbch-wiki-torneo.txt'));
    expect(foreigners).toHaveLength(10);
    expect(foreigners).toContainEqual({ name: 'Terrence Bieshaar', nationalityRaw: 'Holanda' });
    expect(foreigners).toContainEqual({ name: 'Rashad Hassan', nationalityRaw: 'USA' });
    expect(foreigners).toContainEqual({ name: 'Darryl Owens II', nationalityRaw: 'USA' });
  });

  it('los ala-pívots de menos de 198 cm pasan a alero', () => {
    expect(chileanPosition('PF', 197)).toBe('SF');
    expect(chileanPosition('PF', 198)).toBe('PF');
    expect(chileanPosition('PF', null)).toBe('PF');
    expect(chileanPosition('C', 190)).toBe('C');
    expect(chileanPosition(null, 190)).toBeNull();
  });
});
