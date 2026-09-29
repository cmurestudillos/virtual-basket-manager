import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { SourceStats } from '../lib/source-types';
import { emptyStats } from '../sources/lkl-parse';
import {
  aggregateNblBoxScores,
  correctWithTotals,
  nblName,
  nblNationality,
  nblPosition,
  nblSeconds,
  parseNblBoxScore,
  parseNblLeaders,
  parseNblMatches,
  parseNblPerson,
  parseNblRoster,
  rosettaData,
  slimNblMatch
} from '../sources/nbl-parse';

/** La NBL australiana: la API «Rosetta» de su web (datos de Synergy). Fixtures inventados. */

const fixture = (name: string): string =>
  readFileSync(resolve(import.meta.dirname, 'fixtures', name), 'utf8');

describe('Rosetta: respuestas, partidos y fichas', () => {
  it('el `data` de una respuesta; `null` si no es una', () => {
    expect(rosettaData('{"data":[1,2]}')).toEqual([1, 2]);
    expect(rosettaData('{"error":"Access Denied"}')).toBeNull();
    expect(rosettaData('<html>')).toBeNull();
  });

  it('los partidos, con los ids de Synergy de los equipos y el tipo', () => {
    const matches = parseNblMatches(fixture('nbl-partidos.json'));
    expect(matches.map((match) => [match.id, match.type, match.date])).toEqual([
      ['m-1', 'regular', '2025-09-18'],
      ['m-2', null, '2026-02-22'],
      ['m-3', 'final', '2026-03-04']
    ]);
    expect(matches[0]).toMatchObject({
      homeId: 's-a',
      awayId: 's-b',
      homeCode: 'AAA',
      homeScore: 90,
      awayScore: 85,
      venue: 'Pabellón Uno'
    });
    expect(matches[2]).toMatchObject({ homeScore: null, awayScore: null, venue: null });
  });

  it('la plantilla, sin repetidos y con lo que no cuadra a null', () => {
    const roster = parseNblRoster(fixture('nbl-plantilla.json'));
    expect(roster).toEqual([
      {
        personId: 's-p1',
        firstName: 'Uno',
        lastName: 'Primero',
        birthDate: '1999-01-02',
        heightCm: 188,
        weightKg: 84,
        nationalityRaw: 'AUS',
        positionRaw: 'G',
        shirtNumber: 7
      },
      {
        personId: 's-p2',
        firstName: 'Dos',
        lastName: 'Segundo Jnr',
        birthDate: null,
        heightCm: null,
        weightKg: null,
        nationalityRaw: 'TRI',
        positionRaw: 'FC',
        shirtNumber: 0
      }
    ]);
  });

  it('la ficha suelta de un jugador', () => {
    const json = JSON.stringify({
      data: [
        {
          id: 'r-p9',
          external_id: 's-p9',
          first_name: 'Nueve',
          last_name: 'Suelto',
          date_of_birth: '1998-01-29',
          height: null,
          nationality_code: 'USA',
          latest_playing_position: 'G'
        }
      ]
    });
    expect(parseNblPerson(json)).toMatchObject({
      personId: 's-p9',
      birthDate: '1998-01-29',
      heightCm: null,
      positionRaw: 'G'
    });
    expect(parseNblPerson('{"data":[]}')).toBeNull();
  });
});

describe('Rosetta: el acta', () => {
  const slim = slimNblMatch(fixture('nbl-acta.json'))!;

  it('se reduce a las líneas del partido entero y a las acciones que cuentan', () => {
    expect(slim.lines).toHaveLength(4);
    expect(slim.actions.map((action) => action[0])).toEqual(['foul', '2pt', '2pt', 'block', '2pt']);
    expect(JSON.stringify(slim)).not.toContain('vídeo');
    expect(slimNblMatch('{"data":[{"player_match_statistics":[]}]}')).toBeNull();
  });

  it('las líneas, con las faltas recibidas, los mates y los tapones recibidos del jugada a jugada', () => {
    const box = parseNblBoxScore(slim);
    expect(box.hasPlayByPlay).toBe(true);
    const [home, away] = box.sides;
    expect(home.teamId).toBe('s-a');
    expect(home.score).toBe(9);
    expect(away.score).toBe(4);
    const byId = new Map([...home.lines, ...away.lines].map((line) => [line.personId, line]));
    expect(byId.get('s-p1')).toMatchObject({
      starter: true,
      seconds: 30 * 60 + 15,
      points: 7,
      fouls: 3,
      rating: 9,
      dunks: 0,
      foulsDrawn: 0,
      blocksReceived: 0,
      shirtNumber: 7
    });
    expect(byId.get('s-p2')).toMatchObject({ starter: false, blocks: 1, dunks: 1 });
    // El tapón es a un tiro del rival, no al fallado de su compañero.
    expect(byId.get('s-p3')).toMatchObject({ foulsDrawn: 1, blocksReceived: 1 });
    expect(byId.get('s-p4')).toMatchObject({ participated: false, seconds: 0 });
  });

  it('se suma por jugador y club, sin los que no jugaron', () => {
    const box = parseNblBoxScore(slim);
    const all = aggregateNblBoxScores([...box.sides[0].lines, ...box.sides[1].lines]);
    expect(all.map((entry) => entry.personId).sort()).toEqual(['s-p1', 's-p2', 's-p3']);
    const second = all.find((entry) => entry.personId === 's-p2')!;
    expect(second.stats).toMatchObject({ games: 1, starts: 0, seconds: 585, dunks: 1 });
  });

  it('los minutos, en «mm:ss» o con horas', () => {
    expect(nblSeconds('34:14')).toBe(2054);
    expect(nblSeconds('1:00:05')).toBe(3605);
    expect(nblSeconds(null)).toBe(0);
    expect(nblSeconds('n/a')).toBe(0);
  });
});

describe('Rosetta: totales oficiales', () => {
  it('corrigen lo que le falta a un acta corta', () => {
    const [official] = parseNblLeaders(fixture('nbl-leaders.json'));
    expect(official).toMatchObject({
      personId: 's-p1',
      teamId: 's-a',
      defensiveRebounds: 3,
      fouls: 3
    });
    const box = parseNblBoxScore(slimNblMatch(fixture('nbl-acta.json'))!);
    const [entry] = aggregateNblBoxScores(box.sides[0].lines);
    const changed = correctWithTotals(entry!.stats, official!, entry!.stats);
    expect(changed).toEqual({ points: 3, threePointMade: 1, threePointAttempted: 1 });
    expect(entry!.stats).toMatchObject({ points: 10, threePointMade: 2, threePointAttempted: 4 });
  });

  it('sin dejar nada en negativo', () => {
    const stats: SourceStats = { ...emptyStats(), points: 2 };
    const official = parseNblLeaders(fixture('nbl-leaders.json'))[0]!;
    const summed = { ...official, points: 20 };
    correctWithTotals(stats, official, summed);
    expect(stats.points).toBe(0);
  });
});

describe('puestos, nombres y países', () => {
  const stats = (assists: number, rebounds: number, minutes = 600): SourceStats => ({
    ...emptyStats(),
    seconds: minutes * 60,
    assists,
    defensiveRebounds: rebounds
  });

  it('la altura manda; dentro de cada franja, el juego', () => {
    expect(nblPosition('C', 211, null)).toBe('C');
    expect(nblPosition('FC', 201, null)).toBe('PF');
    expect(nblPosition('F', 209, null)).toBe('C');
    expect(nblPosition('G', 205, null)).toBe('PF');
    expect(nblPosition('F', 200, stats(30, 150))).toBe('PF');
    expect(nblPosition('F', 200, stats(30, 60))).toBe('SF');
    expect(nblPosition('F', 196, stats(30, 150))).toBe('SF');
    expect(nblPosition('G', 199, stats(100, 30))).toBe('SF');
    expect(nblPosition('G', 190, stats(100, 30))).toBe('PG');
    expect(nblPosition('G', 190, stats(40, 30))).toBe('SG');
    expect(nblPosition('G', 184, stats(10, 30))).toBe('PG');
    expect(nblPosition('G', 190, stats(40, 30, 20))).toBe('SG');
    // Sin puesto: con altura decide el montaje; sin nada, `null`.
    expect(nblPosition(null, 200, null)).toBeNull();
    expect(nblPosition(null, null, null)).toBeNull();
  });

  it('los sufijos del apellido, siempre igual', () => {
    expect(nblName('Dos', 'Segundo Jnr')).toEqual({ firstName: 'Dos', lastName: 'Segundo Jr.' });
    expect(nblName(' Uno ', 'Primero-Guion')).toEqual({
      firstName: 'Uno',
      lastName: 'Primero-Guion'
    });
  });

  it('códigos FIBA e ISO mezclados', () => {
    expect(nblNationality('AUS')).toBe('AUS');
    expect(nblNationality('NZL')).toBe('NZL');
    expect(nblNationality('NLD')).toBe('NED');
    expect(nblNationality('TRI')).toBe('TTO');
    expect(nblNationality('SUD')).toBe('SUD');
    expect(nblNationality(null)).toBeNull();
  });
});
