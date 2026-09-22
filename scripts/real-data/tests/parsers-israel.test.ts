import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { SourcePlayer, SourceTeam } from '../lib/source-types';
import {
  aggregateWinnerBoxScores,
  cleanWinnerName,
  parseWinnerGame,
  parseWinnerPlayerPage,
  parseWinnerStandings,
  parseWinnerTeamPage,
  splitWinnerFullName,
  unifyTransferred,
  winnerNationality,
  winnerPosition
} from '../sources/winner-parse';

/** La fuente de Israel: basket.co.il, la web oficial de la Ligat Winner, en inglés. */

const fixture = (name: string): string =>
  readFileSync(resolve(import.meta.dirname, 'fixtures', name), 'utf8');

describe('Ligat Winner: nombres, puestos y países', () => {
  it('limpia los nombres: apodo entre comillas aparte y mayúscula inicial', () => {
    expect(cleanWinnerName('Alero "Apodo"', 'Dos')).toEqual({
      firstName: 'Alero',
      lastName: 'Dos',
      nickname: 'Apodo'
    });
    expect(cleanWinnerName('  Pivot ', 'cuatro   Jr.')).toEqual({
      firstName: 'Pivot',
      lastName: 'Cuatro Jr.',
      nickname: null
    });
    expect(cleanWinnerName('Nombre', 'McApellido').lastName).toBe('McApellido');
  });

  it('parte los nombres de las actas por la primera palabra, con el apodo en el nombre', () => {
    expect(splitWinnerFullName('Otro  Tecnico ')).toMatchObject({
      firstName: 'Otro',
      lastName: 'Tecnico'
    });
    expect(splitWinnerFullName('Alero &quot;Apodo&quot; Dos Tres')).toEqual({
      firstName: 'Alero',
      lastName: 'Dos Tres',
      nickname: 'Apodo'
    });
    expect(splitWinnerFullName('Solo')).toMatchObject({ firstName: '', lastName: 'Solo' });
  });

  it('traduce los puestos de la web, con «F» por altura', () => {
    expect(winnerPosition('PG', 180)).toBe('PG');
    expect(winnerPosition('G', 190)).toBe('SG');
    expect(winnerPosition('G-F', 198)).toBe('SF');
    expect(winnerPosition('F', 200)).toBe('SF');
    expect(winnerPosition('F', 206)).toBe('PF');
    expect(winnerPosition('F-C', 204)).toBe('PF');
    expect(winnerPosition('C', 210)).toBe('C');
    expect(winnerPosition('Coach', 190)).toBeNull();
    expect(winnerPosition(null, 190)).toBeNull();
  });

  it('toma la primera nacionalidad y traduce el ISO de tres letras al COI', () => {
    expect(winnerNationality(['DNK', 'USA'])).toBe('DEN');
    expect(winnerNationality(['XXX', 'DEU'])).toBe('GER');
    expect(winnerNationality([])).toBeNull();
  });
});

describe('Ligat Winner: clasificación', () => {
  it('lee puesto, id y balance, una fila por equipo', () => {
    expect(parseWinnerStandings(fixture('winner-clasificacion.html'))).toEqual([
      { rank: 1, teamId: '901', name: 'Leones Norte', games: 26, wins: 24, losses: 2 },
      { rank: 2, teamId: '902', name: 'Halcones Sur', games: 32, wins: 13, losses: 19 }
    ]);
  });
});

describe('Ligat Winner: equipo', () => {
  const page = parseWinnerTeamPage(fixture('winner-equipo.html'));

  it('lee el nombre de la temporada y el pabellón con su aforo', () => {
    expect(page.name).toBe('Leones Patrocinador Norte');
    expect(page.arena).toEqual({ name: 'Pabellon Norte', capacity: 5400 });
  });

  it('lee la plantilla con sus secciones, sin el cuerpo técnico', () => {
    expect(page.players.map((player) => [player.playerId, player.section])).toEqual([
      ['5001', 'plantilla'],
      ['5002', 'plantilla'],
      ['5003', 'plantilla'],
      ['5004', 'inactivo'],
      ['5005', 'baja']
    ]);
    expect(page.players[0]).toEqual({
      playerId: '5001',
      firstName: 'Base',
      lastName: 'Uno',
      nickname: null,
      shirtNumber: 0,
      positionRaw: 'PG',
      heightCm: 185,
      birthDate: '1997-12-31',
      section: 'plantilla'
    });
    expect(page.players[1]).toMatchObject({
      firstName: 'Alero',
      lastName: 'Dos',
      nickname: 'Apodo',
      shirtNumber: 21,
      positionRaw: 'F',
      heightCm: 206,
      birthDate: '1997-03-21'
    });
    // Sin nombre en inglés: vacío, y a mano.
    expect(page.players[2]).toMatchObject({ firstName: '', lastName: '', positionRaw: 'G' });
    expect(page.players[3]).toMatchObject({ shirtNumber: null, positionRaw: 'G-F', heightCm: 196 });
    expect(page.players[4]).toMatchObject({ lastName: 'Cuatro Jr.', birthDate: '1996-12-05' });
  });
});

describe('Ligat Winner: acta', () => {
  const game = parseWinnerGame(fixture('winner-acta.html'), '777')!;

  it('lee jornada, fecha, pabellón, equipos, tanteo y entrenadores', () => {
    expect(game).toMatchObject({
      gameId: '777',
      round: 3,
      date: '2025-10-12',
      venue: 'Pabellon Norte, Ciudad Norte',
      homeId: '901',
      awayId: '902',
      // El marcador de la web es «visitante:local».
      homeScore: 75,
      awayScore: 70,
      homeCoach: { coachId: '77', name: 'Entrenador Inicio' },
      awayCoach: { coachId: '88', name: 'Otro  Tecnico' }
    });
  });

  it('lee cada jugador, sin las filas de equipo ni de totales', () => {
    expect(game.lines.map((line) => line.playerId)).toEqual([
      '5001',
      '5002',
      '5006',
      '6001',
      '6002'
    ]);
    expect(game.lines[0]).toEqual({
      playerId: '5001',
      teamId: '901',
      firstName: 'Base',
      lastName: 'Uno',
      starter: true,
      seconds: 32 * 60,
      points: 40,
      twoPointMade: 10,
      twoPointAttempted: 15,
      threePointMade: 5,
      threePointAttempted: 9,
      freeThrowMade: 5,
      freeThrowAttempted: 6,
      defensiveRebounds: 4,
      offensiveRebounds: 1,
      fouls: 2,
      foulsDrawn: 6,
      steals: 3,
      turnovers: 2,
      assists: 7,
      blocks: 1,
      blocksReceived: 0,
      rating: 38
    });
    expect(game.lines[1]).toMatchObject({ firstName: 'Alero', lastName: 'Dos', starter: true });
    expect(game.lines[4]).toMatchObject({ teamId: '902', starter: false, points: 20 });
    const points = (teamId: string): number =>
      game.lines.filter((line) => line.teamId === teamId).reduce((sum, l) => sum + l.points, 0);
    expect([points('901'), points('902')]).toEqual([75, 70]);
  });

  it('sin las dos tablas de equipo no hay acta', () => {
    expect(parseWinnerGame('<html><body>nada</body></html>', '1')).toBeNull();
  });

  it('suma las actas por jugador y equipo, sin contar quien no jugó', () => {
    const second = { ...game.lines[0]!, starter: false, seconds: 0, points: 2, twoPointMade: 1 };
    const totals = aggregateWinnerBoxScores([...game.lines, second]);
    const first = totals.find((entry) => entry.playerId === '5001')!;
    expect(first.stats).toMatchObject({
      games: 2,
      starts: 1,
      seconds: 32 * 60,
      points: 42,
      twoPointMade: 11,
      blocksReceived: 0,
      foulsDrawn: 12,
      rating: 76,
      dunks: null
    });
    expect(totals.find((entry) => entry.playerId === '5006')).toBeUndefined();
    expect(totals).toHaveLength(4);
  });
});

describe('Ligat Winner: ficha del jugador', () => {
  it('lee nombre, dorsal, nacionalidades, puesto, altura y fecha', () => {
    expect(parseWinnerPlayerPage(fixture('winner-jugador.html'))).toEqual({
      firstName: 'Alero',
      lastName: 'Dos',
      nickname: 'Apodo',
      shirtNumber: 21,
      nationalityCodes: ['DNK', 'USA'],
      nationalityRaw: 'Denmark (DNK) , United States (USA)',
      positionRaw: 'F',
      heightCm: 206,
      birthDate: '1997-03-21'
    });
    expect(parseWinnerPlayerPage('<html></html>')).toBeNull();
  });
});

describe('Ligat Winner: jugadores que cambiaron de equipo', () => {
  const person = (sourceId: string, overrides: Partial<SourcePlayer> = {}): SourcePlayer => ({
    sourceId,
    firstName: 'Viajero',
    lastName: 'Uno',
    nickname: null,
    birthDate: '1999-01-01',
    age: null,
    nationality: 'ISR',
    nationalityRaw: null,
    position: 'SG',
    positionRaw: 'G',
    heightCm: 190,
    weightKg: null,
    shirtNumber: null,
    licence: null,
    stats: null,
    ...overrides
  });
  const club = (sourceId: string, players: SourcePlayer[]): SourceTeam => ({
    sourceId,
    name: `Club ${sourceId}`,
    shortName: null,
    city: null,
    pavilionName: null,
    pavilionCapacity: null,
    finalPosition: null,
    players
  });

  it('les da el mismo id en los dos equipos (el menor), por nombre y fecha', () => {
    const teams = [
      club('1', [person('300'), person('301', { lastName: 'Otro' })]),
      club('2', [
        person('120'),
        person('121', { birthDate: null }),
        person('122', { lastName: 'Otro', birthDate: '2000-02-02' })
      ])
    ];
    const warnings: string[] = [];
    unifyTransferred(teams, (message) => warnings.push(message));
    expect(teams.map((team) => team.players.map((player) => player.sourceId))).toEqual([
      ['120', '301'],
      ['120', '121', '122']
    ]);
    expect(warnings).toHaveLength(1);
  });
});
