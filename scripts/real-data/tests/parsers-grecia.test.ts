import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  greekHomoglyphs,
  greekLongDate,
  greekNameToLatin,
  isGreekScript,
  nameSimilarity,
  nationFromGreek,
  transliterateGreek
} from '../lib/greek';
import { coachFromManual } from '../lib/manual';
import { plausibleBirthDate } from '../lib/normalize';
import type { SourceStats } from '../lib/source-types';
import {
  aggregateEsakeBoxScores,
  bbrefDistance,
  matchBbref,
  parseBbrefTotals,
  parseEsakeBio,
  parseEsakeBoxScore,
  parseEsakePlayers,
  parseEsakeResults,
  parseEsakeStandings,
  splitBbrefName
} from '../sources/esake-parse';
import {
  aggregateHbfBoxScores,
  hbfName,
  parseHbfGame,
  parseHbfGameIds,
  parseHbfStandings,
  parseHbfTeamPage,
  parseHbfTeams,
  splitSurnameFirst,
  toHbfPosition
} from '../sources/hbf-parse';
import { POWER_FORWARD_CM } from '../sources/lba-parse';

/** Las fuentes de Grecia: esake.gr (A1), basketball-reference (nombres) y la federación (A2). */

const fixture = (name: string): string =>
  readFileSync(resolve(import.meta.dirname, 'fixtures', name), 'utf8');

describe('griego', () => {
  it('translitera con ELOT 743, diptongos y diéresis incluidos', () => {
    expect(transliterateGreek('Ευάγγελος')).toBe('evangelos');
    expect(transliterateGreek('αυτό')).toBe('afto');
    expect(transliterateGreek('ΑΫΛΟΣ')).toBe('aylos');
    expect(transliterateGreek('ΜΠΑΣΚΕΤ')).toBe('mpasket');
    expect(transliterateGreek('Σφίγξ')).toBe('sfinx');
    expect(transliterateGreek('ΘΕΟΔΩΡΟΣ')).toBe('theodoros');
    expect(transliterateGreek('Χ-Ψ 3')).toBe('ch-ps 3');
  });

  it('las mayúsculas latinas dentro de una palabra griega pasan a griegas', () => {
    expect(greekHomoglyphs('ΓΚAΤΑ OK')).toBe('ΓΚΑΤΑ OK');
    expect(transliterateGreek('ΚΩΣΤAΣ')).toBe('kostas');
  });

  it('nombres en latino con mayúscula inicial, sin tocar los que ya lo están', () => {
    expect(greekNameToLatin('ΚΩΣΤΑΣ')).toBe('Kostas');
    expect(greekNameToLatin('ΝΙΚΟΣ - ΠΕΤΡΟΣ')).toBe('Nikos-Petros');
    expect(greekNameToLatin('PERSONA')).toBe('Persona');
    expect(isGreekScript('Άλφα')).toBe(true);
    expect(isGreekScript('Alfa')).toBe(false);
  });

  it('entiende los países escritos en griego', () => {
    expect(nationFromGreek('ΗΠΑ')).toBe('USA');
    expect(nationFromGreek('Ελλάδα')).toBe('GRE');
    expect(nationFromGreek('ΜΕΓΑΛΗ ΒΡΕΤΑΝΙΑ')).toBe('GBR');
    expect(nationFromGreek('ΛΙΘΟΥΑΝΙΑ')).toBe('LTU');
    expect(nationFromGreek('ΑΤΛΑΝΤΙΔΑ')).toBeNull();
    expect(nationFromGreek('Spain')).toBe('ESP');
    expect(nationFromGreek(null)).toBeNull();
  });

  it('las fechas largas en griego', () => {
    expect(greekLongDate('Σάββατο, 21 Μαρτίου 2026')).toBe('2026-03-21');
    expect(greekLongDate('Κυριακή, 4 Οκτωβρίου 2025')).toBe('2025-10-04');
    expect(greekLongDate('Τετάρτη, 13 Αυγούστου 2025')).toBe('2025-08-13');
    expect(greekLongDate('χθες')).toBeNull();
  });

  it('el parecido entre dos nombres', () => {
    expect(nameSimilarity('Ábcd', 'abcd')).toBe(1);
    expect(nameSimilarity('Vasilis', 'Vassilis')).toBeGreaterThan(0.8);
    expect(nameSimilarity('Tzonson', 'Johnson')).toBeLessThan(0.8);
  });

  it('una fecha de nacimiento imposible no vale', () => {
    expect(plausibleBirthDate('1999-04-12', 2025)).toBe('1999-04-12');
    expect(plausibleBirthDate('2025-10-02', 2025)).toBeNull();
    expect(plausibleBirthDate('1950-01-01', 2025)).toBeNull();
    expect(plausibleBirthDate(null, 2025)).toBeNull();
  });

  it('un entrenador a mano: nacionalidad del lugar o la que se diga', () => {
    expect(
      coachFromManual(
        { firstName: 'Nombre', lastName: 'Apellido', birth: '11/09/1974 Ciudad (Grecia)' },
        'x'
      )
    ).toEqual({
      sourceId: 'x',
      firstName: 'Nombre',
      lastName: 'Apellido',
      birthDate: '1974-09-11',
      age: null,
      nationality: 'GRE',
      nationalityRaw: 'Ciudad (Grecia)'
    });
    expect(
      coachFromManual({ firstName: 'N', lastName: 'A', age: 50, nationality: 'SRB' }, 'y')
    ).toMatchObject({ birthDate: null, age: 50, nationality: 'SRB' });
  });
});

describe('esake.gr (A1)', () => {
  it('la clasificación, sin las filas que no son de equipo', () => {
    expect(parseEsakeStandings(fixture('esake-clasificacion.html'))).toEqual([
      { rank: 1, teamId: '0000A001', name: 'ΠΟΛΗ ΒΟΡΡΑΣ', games: 2, wins: 2, losses: 0 },
      { rank: 2, teamId: '0000B002', name: 'ΠΟΛΗ ΝΟΤΟΣ Betsson', games: 2, wins: 0, losses: 2 }
    ]);
  });

  it('la plantilla: nombre tal cual, ficha y apellido doble partido por el salto', () => {
    const players = parseEsakePlayers(fixture('esake-plantilla.html'));
    expect(players).toHaveLength(3);
    expect(players[0]).toEqual({
      playerId: '00C0FFEE',
      lastName: 'ΠΡΩΤΟΣ',
      firstName: 'ΚΩΣΤAΣ',
      shirtNumber: 7,
      heightCm: 201,
      position: 'SF',
      birthDate: '1999-04-12',
      country: 'ΕΛΛΑΔΑ'
    });
    expect(players[1]).toMatchObject({
      lastName: 'SEGUNDO',
      firstName: 'JUGADOR',
      shirtNumber: null,
      heightCm: null,
      country: 'ΗΠΑ'
    });
    expect(players[2]).toMatchObject({ lastName: 'ΤΡΙΤΟΣ-ΔΙΠΛΟΣ', firstName: 'ΑΘΑΝΑΣΙΟΣ' });
  });

  it('la ficha de la página del jugador', () => {
    expect(parseEsakeBio(fixture('esake-jugador.html'))).toEqual({
      heightCm: 191,
      position: 'SG',
      birthDate: '1998-12-07',
      country: 'ΜΕΓΑΛΗ ΒΡΕΤΑΝΙΑ'
    });
  });

  it('los partidos de una jornada, con los equipos por su escudo', () => {
    expect(parseEsakeResults(fixture('esake-jornada.html'))).toEqual([
      {
        gameId: '0A0B0C0D',
        round: 1,
        homeId: '0000A001',
        awayId: '0000B002',
        homeScore: 85,
        awayScore: 80,
        venue: 'Κ.Γ. ΒΟΡΡΑ'
      }
    ]);
  });

  it('el acta: el equipo de la cabecera, las faltas en su sitio y sin quien no jugó', () => {
    const lines = parseEsakeBoxScore(fixture('esake-acta.html'));
    expect(lines).toHaveLength(2);
    expect(lines[0]).toEqual({
      teamId: '0000A001',
      playerId: '00C0FFEE',
      name: 'ΠΡΩΤΟΣ ΚΩΣΤAΣ',
      lastName: 'ΠΡΩΤΟΣ',
      firstName: 'ΚΩΣΤAΣ',
      seconds: 30 * 60 + 56,
      points: 17,
      twoPointMade: 3,
      twoPointAttempted: 6,
      threePointMade: 3,
      threePointAttempted: 5,
      freeThrowMade: 2,
      freeThrowAttempted: 2,
      defensiveRebounds: 4,
      offensiveRebounds: 2,
      assists: 8,
      blocks: 1,
      blocksReceived: 2,
      foulsDrawn: 5,
      fouls: 4,
      steals: 1,
      turnovers: 3,
      rating: 21
    });
    expect(lines[1]).toMatchObject({ teamId: '0000B002', playerId: '00BEEF01', rating: -2 });

    const [first] = aggregateEsakeBoxScores([...lines, lines[0]!]);
    expect(first?.stats).toMatchObject({
      games: 2,
      starts: null,
      seconds: 2 * (30 * 60 + 56),
      points: 34,
      blocksReceived: 4,
      foulsDrawn: 10,
      dunks: null
    });
  });
});

describe('basketball-reference (nombres en latino)', () => {
  const rows = parseBbrefTotals(fixture('bbref-totales.html'));

  it('lee la tabla de totales, una fila por jugador y equipo', () => {
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({
      name: 'Jugador Segundo',
      playerPath: '/international/players/jugador-segundo-1.html',
      teamSlug: 'polis-notos',
      games: 24,
      minutes: 512,
      points: 301,
      threePointMade: 20,
      freeThrowMade: 41,
      rebounds: 150,
      assists: 30
    });
  });

  it('empareja por estadísticas, cada fila una vez y sólo si se parecen', () => {
    const stats = (games: number, points: number, rebounds: number): SourceStats => ({
      games,
      starts: null,
      seconds: 512 * 60,
      points,
      twoPointMade: 0,
      twoPointAttempted: 0,
      threePointMade: 20,
      threePointAttempted: 0,
      freeThrowMade: 41,
      freeThrowAttempted: 0,
      offensiveRebounds: 0,
      defensiveRebounds: rebounds,
      assists: 30,
      steals: 0,
      turnovers: 0,
      blocks: 0,
      blocksReceived: null,
      dunks: null,
      fouls: 0,
      foulsDrawn: null,
      rating: null
    });
    const exact = { id: 'a', stats: stats(24, 301, 150) };
    const close = { id: 'b', stats: stats(24, 299, 151) };
    const far = { id: 'c', stats: stats(3, 90, 10) };
    expect(bbrefDistance(exact.stats, rows[0]!)).toBe(0);
    const matched = matchBbref([close, exact, far], rows);
    expect(matched.get(exact)?.name).toBe('Jugador Segundo');
    expect(matched.has(close)).toBe(false);
    expect(matched.has(far)).toBe(false);
  });

  it('parte el nombre con tantas palabras de apellido como esake, con el sufijo', () => {
    expect(splitBbrefName('Otro Jugador Jr.', 1)).toEqual({
      firstName: 'Otro',
      lastName: 'Jugador Jr.'
    });
    expect(splitBbrefName('José María López', 1)).toEqual({
      firstName: 'José María',
      lastName: 'López'
    });
    expect(splitBbrefName('Nombre Segundo Tercero Apellido', 1)).toEqual({
      firstName: 'Nombre',
      lastName: 'Apellido'
    });
    expect(splitBbrefName('Nombre De Sousa', 1)).toEqual({
      firstName: 'Nombre',
      lastName: 'De Sousa'
    });
    expect(splitBbrefName('Nombre De La Torre', 3)).toEqual({
      firstName: 'Nombre',
      lastName: 'De La Torre'
    });
    expect(splitBbrefName('Solo', 1)).toEqual({ firstName: '', lastName: 'Solo' });
  });
});

describe('stats.basket.gr (A2)', () => {
  it('los equipos inscritos, con el id en mayúsculas', () => {
    expect(parseHbfTeams(fixture('hbf-equipos.html'))).toEqual([
      { teamId: 'AAAAAAAA-0000-0000-0000-000000000001', name: 'ΑΟ ΠΡΩΤΗ ΠΟΛΗ' },
      { teamId: 'BBBBBBBB-0000-0000-0000-000000000002', name: 'ΓΣ ΔΕΥΤΕΡΗ & ΣΙΑ' }
    ]);
  });

  it('la clasificación de la liga regular', () => {
    expect(parseHbfStandings(fixture('hbf-clasificacion.html'))).toEqual([
      { rank: 1, name: 'ΑΟ ΠΡΩΤΗ ΠΟΛΗ', points: 3, wins: 1, losses: 1, games: 2 },
      { rank: 2, name: 'ΓΣ ΔΕΥΤΕΡΗ & ΣΙΑ', points: 3, wins: 1, losses: 1, games: 2 }
    ]);
  });

  it('la ficha del equipo: plantilla y partidos sin repetir', () => {
    const page = parseHbfTeamPage(fixture('hbf-equipo.html'));
    expect(page.gameIds).toEqual([
      'CCCCCCCC-0000-0000-0000-000000000001',
      'CCCCCCCC-0000-0000-0000-000000000002'
    ]);
    expect(page.roster).toEqual([
      {
        playerId: 'DDDDDDDD-0000-0000-0000-000000000001',
        fullName: 'ΠΡΩΤΟΣ ΙΩΑΝΝΗΣ',
        fatherName: 'ΓΕΩΡΓΙΟΣ',
        position: 'Σεντερ',
        heightCm: 209,
        birthDate: '1993-09-29',
        shirtNumber: 9
      },
      {
        playerId: 'DDDDDDDD-0000-0000-0000-000000000002',
        fullName: 'SEGUNDO III JUAN CARLOS',
        fatherName: 'PADRE',
        position: 'Φοργουορντ',
        heightCm: null,
        birthDate: '1997-04-12',
        shirtNumber: 2
      }
    ]);
    expect(parseHbfGameIds(fixture('hbf-calendario.html'))).toEqual([
      'CCCCCCCC-0000-0000-0000-000000000002'
    ]);
  });

  it('el acta: fecha, pabellón, entrenadores y las dos tablas del JavaScript', () => {
    const game = parseHbfGame(fixture('hbf-acta.html'), 'X');
    expect(game).toMatchObject({
      gameId: 'X',
      date: '2026-03-21',
      venue: 'ΔΑΚ ΠΡΩΤΗΣ',
      homeId: 'AAAAAAAA-0000-0000-0000-000000000001',
      awayId: 'BBBBBBBB-0000-0000-0000-000000000002',
      homeScore: 55,
      awayScore: 12,
      homeCoach: 'ΠΡΟΠΟΝΗΤΗΣ ΘΕΟΔΩΡΟΣ',
      awayCoach: null
    });
    // Quien no salió a pista no está.
    expect(game.lines).toHaveLength(2);
    expect(game.lines[0]).toEqual({
      teamId: 'AAAAAAAA-0000-0000-0000-000000000001',
      playerId: 'DDDDDDDD-0000-0000-0000-000000000001',
      name: 'ΠΡΩΤΟΣ ΙΩΑΝΝΗΣ',
      starter: true,
      seconds: 31 * 60 + 6,
      points: 55,
      freeThrowMade: 1,
      freeThrowAttempted: 2,
      twoPointMade: 18,
      twoPointAttempted: 20,
      threePointMade: 6,
      threePointAttempted: 9,
      offensiveRebounds: 2,
      defensiveRebounds: 3,
      assists: 4,
      steals: 2,
      blocks: 1,
      turnovers: 2,
      fouls: 3,
      foulsDrawn: 6,
      rating: 60
    });
    expect(game.lines[1]).toMatchObject({ starter: false, seconds: 750, rating: -1 });

    const [first] = aggregateHbfBoxScores(game.lines);
    expect(first?.stats).toMatchObject({
      games: 1,
      starts: 1,
      points: 55,
      blocksReceived: null,
      foulsDrawn: 6
    });
  });

  it('nombres: apellido delante, el de uso de los griegos y el primero de los extranjeros', () => {
    expect(hbfName('ΠΡΩΤΟΣ ΙΩΑΝΝΗΣ', { Ioannis: 'Giannis' })).toEqual({
      firstName: 'Giannis',
      lastName: 'Protos'
    });
    expect(hbfName('ΠΡΩΤΟΣ ΙΩΑΝΝΗΣ')).toEqual({ firstName: 'Ioannis', lastName: 'Protos' });
    expect(hbfName('SEGUNDO III JUAN CARLOS')).toEqual({
      firstName: 'Juan Carlos',
      lastName: 'Segundo III'
    });
    expect(hbfName('TERCERO PEDRO PABLO')).toEqual({ firstName: 'Pedro', lastName: 'Tercero' });
    expect(splitSurnameFirst('SOLO')).toEqual({ lastName: 'SOLO', givenNames: '' });
  });

  it('los puestos en griego; «forward» a secas se separa por altura', () => {
    expect(toHbfPosition('Πλειμακερ', null)).toBe('PG');
    expect(toHbfPosition('Ποιντ Γκαρντ', null)).toBe('PG');
    expect(toHbfPosition('Σουτινγκ Γκαρντ', null)).toBe('SG');
    expect(toHbfPosition('Γκαρντ', null)).toBe('SG');
    expect(toHbfPosition('Σμαλ Φοργουορντ', null)).toBe('SF');
    expect(toHbfPosition('Παουερ Φοργουορντ', null)).toBe('PF');
    expect(toHbfPosition('Σεντερ', null)).toBe('C');
    expect(toHbfPosition('Φοργουορντ', POWER_FORWARD_CM)).toBe('PF');
    expect(toHbfPosition('Φοργουορντ', POWER_FORWARD_CM - 1)).toBe('SF');
    expect(toHbfPosition('Φοργουορντ', null)).toBe('SF');
    expect(toHbfPosition('GUARD', null)).toBe('SG');
    expect(toHbfPosition('Κάτι', null)).toBeNull();
    expect(toHbfPosition(null, null)).toBeNull();
  });
});
