import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  aggregateBoxScores,
  decodeWidgetState,
  isoDurationSeconds,
  leftBefore,
  nameKey,
  nationFromFrenchPlace,
  parseBoxScore,
  parseCompetitions,
  parseFixtures,
  parseHeadCoaches,
  parseMatchVenue,
  parsePersonDetail,
  parsePlayerTotals,
  parseRoster,
  parseStandings,
  parseToken,
  regularSeasonOf,
  splitVenue,
  toLnbPosition,
  widgetState
} from '../sources/lnb-parse';
import { POWER_FORWARD_CM } from '../sources/lba-parse';

/** La fuente de Francia: la API de la LNB y las actas de Sportradar. */

const fixture = (name: string): string =>
  readFileSync(resolve(import.meta.dirname, 'fixtures', name), 'utf8');

describe('API de la LNB', () => {
  it('lee el token', () => {
    expect(parseToken('{"message":"Success","token":"abc.def"}')).toBe('abc.def');
    expect(parseToken('{"message":"Error"}')).toBeNull();
  });

  it('encuentra la liga regular de cada división y no sus fases', () => {
    const competitions = parseCompetitions(fixture('lnb-competiciones.json'));
    expect(competitions).toHaveLength(4);
    expect(regularSeasonOf(competitions, 'PROA')).toMatchObject({
      externalId: '902',
      seasonId: 'aaaa-temporada-primera'
    });
    expect(regularSeasonOf(competitions, 'PROB')?.externalId).toBe('903');
    expect(regularSeasonOf(competitions, 'NM1')).toBeNull();
  });

  it('la clasificación oficial, ordenada, con las sanciones y sin filas rotas', () => {
    const standings = parseStandings(fixture('lnb-clasificacion.json'));
    expect(standings.map((row) => row.name)).toEqual(['Villa Sur', 'Villa Norte']);
    expect(standings[1]).toMatchObject({
      rank: 2,
      teamId: '7002',
      teamUuid: 'uuid-norte',
      code: 'VNO',
      wins: 2,
      losses: 1,
      penalty: 1,
      penaltyNote: 'Villa Norte: -1 Victoire'
    });
    expect(standings[0]?.penaltyNote).toBeNull();
  });

  it('la plantilla: todos los que pasaron por el equipo', () => {
    const roster = parseRoster(fixture('lnb-plantilla.json'));
    expect(roster).toHaveLength(2);
    expect(roster[0]).toEqual({
      personId: '501',
      firstName: 'Jugador',
      lastName: 'Primero',
      birthDate: '1999-04-12',
      heightCm: 204,
      nationality: 'USA',
      position: '3/4 - Ailier/Ailier fort',
      shirtNumber: '34'
    });
    expect(roster[1]).toMatchObject({ heightCm: null, position: null, shirtNumber: null });
  });

  it('la ficha: peso, alta y baja; una baja anterior al alta no dice nada', () => {
    const detail = parsePersonDetail(fixture('lnb-ficha.json'));
    expect(detail).toMatchObject({
      birthDate: '1999-04-12',
      heightCm: 205,
      weightKg: 98,
      fromDate: '2025-11-21',
      toDate: '2025-06-30'
    });
    expect(leftBefore(detail, '2026-05-16')).toBe(false);
    expect(leftBefore({ ...detail!, toDate: '2026-02-01' }, '2026-05-16')).toBe(true);
    expect(leftBefore({ ...detail!, toDate: '2026-06-30' }, '2026-05-16')).toBe(false);
    expect(leftBefore(null, '2026-05-16')).toBe(false);
    expect(parsePersonDetail('{"status":true,"data":{}}')).toBeNull();
  });

  it('los primeros entrenadores por fecha de alta y, a igual fecha, por cargo', () => {
    const heads = parseHeadCoaches(fixture('lnb-staff.json'));
    expect(heads.map((head) => head.personId)).toEqual(['401', '404', '403']);
    expect(heads[0]).toEqual({
      roleId: '8001',
      personId: '401',
      firstName: 'Primer',
      lastName: 'Técnico',
      fromDate: '2025-07-01',
      toDate: '2025-11-20'
    });
  });

  it('el pabellón y la ciudad del partido', () => {
    expect(parseMatchVenue(fixture('lnb-partido.json'))).toEqual({
      pavilion: 'Palacio Inventado',
      city: 'Villa Sur'
    });
    expect(splitVenue('Sin Ciudad')).toEqual({ pavilion: 'Sin Ciudad', city: null });
    expect(splitVenue(null)).toEqual({ pavilion: null, city: null });
  });

  it('los puestos: con dos, el primero; «3/4», por altura', () => {
    expect(toLnbPosition('1 - Meneur')).toBe('PG');
    expect(toLnbPosition('1/2 - Meneur/Arrière')).toBe('PG');
    expect(toLnbPosition('2/3 - Arrière/Ailier')).toBe('SG');
    expect(toLnbPosition('3/4 - Ailier/Ailier fort', POWER_FORWARD_CM - 1)).toBe('SF');
    expect(toLnbPosition('3/4 - Ailier/Ailier fort', POWER_FORWARD_CM)).toBe('PF');
    expect(toLnbPosition('3/4 - Ailier/Ailier fort')).toBe('SF');
    expect(toLnbPosition('3 - Ailier', 210)).toBe('SF');
    expect(toLnbPosition('4/5 - Ailier fort/Pivot')).toBe('PF');
    expect(toLnbPosition('5 - Pivot')).toBe('C');
    expect(toLnbPosition('')).toBeNull();
    expect(toLnbPosition(null)).toBeNull();
  });

  it('la nacionalidad de un entrenador por su lugar: sin país, francés', () => {
    expect(nationFromFrenchPlace('Villeurbanne')).toBe('FRA');
    expect(nationFromFrenchPlace('Atenas (Grecia)')).toBe('GRE');
    expect(nationFromFrenchPlace('Italia')).toBe('ITA');
    expect(nationFromFrenchPlace('Ciudad (Narnia)')).toBeNull();
    expect(nationFromFrenchPlace('')).toBeNull();
  });

  it('cruza nombres sin tildes ni signos', () => {
    expect(nameKey('Jugador Inventado')).toBe(nameKey('Jugador  INVENTADO'));
    expect(nameKey('Émile Ñúñez')).toBe('emilenunez');
    expect(nameKey("Jean N'Doye")).toBe('jeanndoye');
  });
});

describe('actas de Sportradar', () => {
  it('el estado de la temporada va y vuelve', () => {
    const state = widgetState('temporada-1');
    expect(state).not.toMatch(/[+/=]/);
    expect(decodeWidgetState(state)).toEqual({ s: 'temporada-1', l: 'fr-FR' });
    expect(decodeWidgetState('no-es-un-estado')).toBeNull();
  });

  it('el calendario, con el tanteo (0-0 si se dio por ganado)', () => {
    const fixtures = parseFixtures(fixture('sr-calendario.json'));
    expect(fixtures).toHaveLength(2);
    expect(fixtures[0]).toEqual({
      fixtureId: 'fx-1',
      homeId: 'uuid-sur',
      homeName: 'Villa Sur',
      awayId: 'uuid-norte',
      awayName: 'Villa Norte',
      homeScore: 80,
      awayScore: 75,
      start: '2025-09-27T20:00:00',
      venue: 'Palacio Inventado',
      status: 'CONFIRMED'
    });
    expect(fixtures[1]).toMatchObject({ homeScore: 0, awayScore: 0 });
  });

  it('las duraciones ISO en segundos', () => {
    expect(isoDurationSeconds('PT16M24S')).toBe(984);
    expect(isoDurationSeconds('PT1H2M3S')).toBe(3723);
    expect(isoDurationSeconds('PT40M')).toBe(2400);
    expect(isoDurationSeconds('PT12.6S')).toBe(13);
    expect(isoDurationSeconds(null)).toBe(0);
  });

  it('el acta: sólo quien jugó, con titularidad y valoración', () => {
    const lines = parseBoxScore(fixture('sr-acta.json'));
    expect(lines.map((line) => line.personId)).toEqual(['p-1', 'p-3']);
    expect(lines[0]).toEqual({
      teamId: 'uuid-sur',
      personId: 'p-1',
      name: 'Jugador Primero',
      starter: true,
      seconds: 984,
      points: 10,
      twoPointMade: 1,
      twoPointAttempted: 4,
      threePointMade: 2,
      threePointAttempted: 4,
      freeThrowMade: 2,
      freeThrowAttempted: 4,
      offensiveRebounds: 2,
      defensiveRebounds: 1,
      assists: 0,
      steals: 1,
      turnovers: 1,
      blocks: 0,
      blocksReceived: 1,
      fouls: 3,
      rating: 5
    });
  });

  it('suma las actas por jugador y equipo', () => {
    const lines = parseBoxScore(fixture('sr-acta.json'));
    const moved = { ...lines[0]!, teamId: 'uuid-norte', starter: false };
    const totals = aggregateBoxScores([...lines, lines[0]!, moved]);
    expect(totals).toHaveLength(3);
    const home = totals.find((entry) => entry.personId === 'p-1' && entry.teamId === 'uuid-sur');
    expect(home?.stats).toMatchObject({
      games: 2,
      starts: 2,
      seconds: 1968,
      points: 20,
      blocksReceived: 2,
      rating: 10,
      dunks: null,
      foulsDrawn: null
    });
    const away = totals.find((entry) => entry.personId === 'p-1' && entry.teamId === 'uuid-norte');
    expect(away?.stats).toMatchObject({ games: 1, starts: 0 });
  });

  it('de la tabla de totales, mates y faltas recibidas con el id de la persona', () => {
    const totals = parsePlayerTotals(fixture('sr-totales.json'));
    expect(totals).toEqual([
      { personId: 'p-1', name: 'x', teamName: 'Villa Sur', dunks: 4, foulsDrawn: 12 },
      { personId: 'p-3', name: 'x', teamName: 'Villa Norte', dunks: 0, foulsDrawn: 6 }
    ]);
  });
});
