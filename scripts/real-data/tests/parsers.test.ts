import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { NATION_NAMES } from '../../../src/shared/domain/national-teams';
import { formAction, hiddenInputs } from '../lib/html';
import { toNationCode } from '../lib/nationalities';
import {
  extractFlightPayload,
  findObjects,
  flightDataOf,
  parseFlightRows
} from '../lib/next-flight';
import {
  canonicalTeamSlug,
  cityFromAcbAddress,
  parsePlayerProfile,
  parseRoster,
  parseStandings as parseAcbStandings,
  parseTeamStats,
  playerSlugs,
  toSourceStats as acbStats
} from '../sources/acb-parse';
import {
  cityFromAddress,
  parseAccumulatedStats,
  parsePlayerPage,
  parseStandings as parseFebStandings,
  parseTeamPage,
  selectOptions,
  toSourceStats as febStats
} from '../sources/feb-parse';

const fixture = (name: string): string =>
  readFileSync(resolve(import.meta.dirname, 'fixtures', name), 'utf8');

describe('nacionalidades del juego', () => {
  it('reconoce todos los códigos y nombres de país que ya usa el juego', () => {
    for (const [code, name] of Object.entries(NATION_NAMES)) {
      expect(toNationCode(code), code).toBe(code);
      expect(toNationCode(name), name).toBe(code);
    }
  });
});

describe('payload de Next.js (acb.com)', () => {
  const html = fixture('acb-flight.html');

  it('junta los trozos de self.__next_f aunque corten una fila por la mitad', () => {
    const payload = extractFlightPayload(html);
    expect(payload.startsWith('1:"$Sreact.fragment"\n')).toBe(true);
    expect(payload).toContain('"nationalityCountry":"España"');
  });

  it('salta las filas de texto por su longitud en bytes, con saltos de línea y eñes', () => {
    const rows = parseFlightRows(extractFlightPayload(html));
    // La fila de texto «a» no es JSON y no aparece; las de datos siguen enteras detrás.
    expect(rows.has('a')).toBe(false);
    expect([...rows.keys()]).toEqual(['29', '2b', '2c', '2d', '2e']);
  });

  it('resuelve los punteros $id:ruta a los objetos a los que apuntan', () => {
    const standings = parseAcbStandings(html);
    expect(standings.season).toBe(90);
    expect(standings.totalRounds).toBe(34);
    expect(standings.standings.map((row) => [row.position, row.clubId, row.fullName])).toEqual([
      [1, '9', 'Equipo Uno'],
      [2, '13', 'Equipo Dos']
    ]);
  });

  it('encuentra cada objeto una sola vez aunque cuelgue de varios sitios', () => {
    const found = findObjects(flightDataOf(html), (o) => o.nationalityCountry === 'España');
    // Jugador y técnico de 2b y de 2c: cuatro objetos distintos, ninguno repetido.
    expect(found).toHaveLength(4);
    expect(new Set(found).size).toBe(4);
  });
});

describe('acb.com', () => {
  const html = fixture('acb-flight.html');

  it('lee la plantilla sin los técnicos', () => {
    const roster = parseRoster(html);
    expect(roster).toHaveLength(2);
    expect(roster[0]).toMatchObject({
      licensing: 'JFL',
      age: 27,
      nationalityCountry: 'España',
      heightCm: 199,
      player: {
        id: '30000001',
        firstName: 'Nombre',
        lastName: 'de Prueba',
        shirtNumber: '7',
        gameRole: 'Ala-pívot',
        editionId: 90
      }
    });
  });

  it('lee las fases y los totales, con el jugador por puntero', () => {
    const stats = parseTeamStats(html);
    expect(stats.phases.map((phase) => [phase.id, phase.abbreviation])).toEqual([
      ['107', 'LR'],
      ['111', 'PO']
    ]);
    expect(stats.players).toHaveLength(1);
    expect(stats.players[0]?.player.id).toBe('30000001');
    expect(acbStats(stats.players[0]!.totals)).toEqual({
      games: 30,
      starts: 12,
      seconds: 33811,
      points: 196,
      twoPointMade: 70,
      twoPointAttempted: 120,
      threePointMade: 10,
      threePointAttempted: 30,
      freeThrowMade: 26,
      freeThrowAttempted: 40,
      offensiveRebounds: 50,
      defensiveRebounds: 76,
      assists: 27,
      steals: 17,
      turnovers: 20,
      blocks: 16,
      blocksReceived: 6,
      dunks: 38,
      fouls: 69,
      foulsDrawn: 63,
      rating: 289
    });
  });

  it('lee la ficha del jugador, el slug canónico del equipo y los enlaces a jugadores', () => {
    expect(parsePlayerProfile(html)).toMatchObject({
      birthDate: '15-10-1997',
      nationality: 'España',
      height: '1,99',
      licensing: 'JFL'
    });
    expect(canonicalTeamSlug(html)).toBe('equipo-dos-13');
    expect(playerSlugs(html).get('30000001')).toBe('nombre-de-prueba-30000001');
  });

  it('saca la ciudad de la dirección sólo si la lleva', () => {
    expect(cityFromAcbAddress('Ángel Villena, 16 Accesorio, (Roig Arena, Puerta L1)')).toBeNull();
    expect(cityFromAcbAddress('Calle Falsa 1, 46013 València')).toBe('València');
  });
});

describe('baloncestoenvivo.feb.es', () => {
  it('lee la plantilla por clases, con los guiones y huecos como null', () => {
    const page = parseTeamPage(fixture('feb-equipo.html'));
    expect(page.clubName).toBe('CLUB DE PRUEBA S.A.D.');
    expect(page.pavilionName).toBe('PABELLÓN MUNICIPAL DE DEPORTES (PALENCIA)');
    expect(page.roster).toEqual([
      {
        playerId: '1000001',
        fullName: 'JOHN MICHAEL PRUEBA',
        position: 'Ala-Pívot',
        shirtNumber: '5',
        birth: '01/02/1990 CIUDAD INVENTADA',
        nationality: 'ESTADOS UNIDOS',
        homegrown: 'NO',
        height: '203',
        weight: null
      },
      {
        playerId: '1000002',
        fullName: 'JUAN JOSE DE LA PRUEBA EJEMPLO',
        position: null,
        shirtNumber: null,
        birth: '15/12/2004 Ciudad (Provincia)',
        nationality: 'ESPAÑA',
        homegrown: 'SI',
        height: null,
        weight: '95'
      }
    ]);
  });

  it('prepara el postback con todos los campos ocultos y la URL del formulario', () => {
    const html = fixture('feb-equipo.html');
    expect(hiddenInputs(html)).toEqual({
      __EVENTTARGET: '',
      __EVENTARGUMENT: '',
      __VIEWSTATE: '/wEPDwUKLTg3OTcz&MzgwMA9k',
      __VIEWSTATEGENERATOR: 'A1B2C3D4',
      __EVENTVALIDATION: '/wEdAAk=',
      '_ctl0:token': 'abc123'
    });
    expect(formAction(html, 'https://baloncestoenvivo.feb.es/Equipo.aspx?i=900001')).toBe(
      'https://baloncestoenvivo.feb.es/equipo/900001'
    );
  });

  it('saca la ciudad del último código postal y da la vuelta al artículo', () => {
    const page = parseTeamPage(fixture('feb-equipo.html'));
    expect(cityFromAddress(page.pavilionAddress)).toBe('Oviedo');
    expect(cityFromAddress(page.clubAddress)).toBe('A Coruña');
    expect(cityFromAddress('Camí de Bintaufa 18 07702 Mahón (Illes Balears)')).toBe('Mahón');
    expect(cityFromAddress('SIN CÓDIGO POSTAL')).toBeNull();
  });

  it('lee las estadísticas acumuladas por fase, con las filas sin nombre del jugador anterior', () => {
    const players = parseAccumulatedStats(fixture('feb-estadisticas.html'));
    expect(players.map((player) => [player.playerId, player.commaName])).toEqual([
      ['1000001', 'PRUEBA, JOHN MICHAEL'],
      ['1000003', 'DÍAZ DEL EJEMPLO, RODRIGO']
    ]);
    expect([...players[0]!.phases.keys()]).toEqual(['LR', 'PO']);
    expect(febStats(players[0]!.phases.get('LR')!)).toEqual({
      games: 31,
      starts: null,
      seconds: 548 * 60 + 54,
      points: 156,
      twoPointMade: 23,
      twoPointAttempted: 28,
      threePointMade: 25,
      threePointAttempted: 76,
      freeThrowMade: 35,
      freeThrowAttempted: 44,
      offensiveRebounds: 20,
      defensiveRebounds: 59,
      assists: 18,
      steals: 16,
      turnovers: 13,
      blocks: 17,
      blocksReceived: 2,
      dunks: 3,
      fouls: 77,
      foulsDrawn: 38,
      rating: 171
    });
    expect(players[0]!.phases.get('PO')?.games).toBe(3);
    expect(players[1]!.phases.get('LR')?.rating).toBe(-1);
  });

  it('lee la ficha de un jugador', () => {
    expect(parsePlayerPage(fixture('feb-jugador.html'))).toEqual({
      commaName: 'DÍAZ DEL EJEMPLO, RODRIGO',
      shirtNumber: '12',
      position: 'Base',
      height: '188 cm',
      weight: null,
      birth: '03/03/2006 Ciudad (Provincia)',
      nationality: 'ESPAÑA'
    });
  });

  it('lee la clasificación de la jornada y no la final, y los desplegables', () => {
    const html = fixture('feb-clasificacion.html');
    expect(parseFebStandings(html)).toEqual([
      { position: 1, teamId: '900001', name: 'EQUIPO UNO', played: 32 },
      { position: 2, teamId: '900002', name: 'CLOUD.GAL EQUIPO DOS CB', played: 32 }
    ]);
    expect(selectOptions(html, 'gruposDropDownList')).toEqual([
      { value: '88874', label: 'Play-offs Final', selected: false },
      { value: '88871', label: 'Liga Regular Único', selected: true }
    ]);
    expect(selectOptions(html, 'jornadasDropDownList').at(-1)?.selected).toBe(true);
  });
});
