import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  coachSpells,
  nationFromLbaCountry,
  nationFromLbaPlace,
  parseClub as parseLbaClub,
  parseCoachProfile as parseLbaCoachProfile,
  parseMatchCoaches as parseLbaMatchCoaches,
  parsePlayerProfile as parseLbaPlayerProfile,
  parseRoster as parseLbaRoster,
  parseSchedule as parseLbaSchedule,
  parseTeamStats as parseLbaTeamStats,
  parseTeams as parseLbaTeams,
  POWER_FORWARD_CM,
  toLbaPosition,
  toSourceStats as lbaStats
} from '../sources/lba-parse';
import {
  parsePlayerPage as parseLnpPlayerPage,
  parseSchedule as parseLnpSchedule,
  parseStandings as parseLnpStandings,
  parseTeamStats as parseLnpTeamStats,
  splitArena,
  splitLnpName,
  statsHtmlFromAjax,
  toSourceStats as lnpStats
} from '../sources/lnp-parse';

/** Las fuentes de Italia: la Serie A (legabasket.it) y la Serie A2 (la LNP). */

const fixture = (name: string): string =>
  readFileSync(resolve(import.meta.dirname, 'fixtures', name), 'utf8');

describe('legabasket.it (Serie A)', () => {
  it('lee la plantilla, el entrenador de ahora y el puesto de la liga regular', () => {
    const roster = parseLbaRoster(fixture('lba-plantilla.json'));
    expect(roster).toMatchObject({ finalPosition: 4, wins: 18, losses: 10 });
    expect(roster.coach).toEqual({
      id: '501',
      firstName: 'Allenatore',
      lastName: 'Di Prova',
      birthDate: null,
      placeOfBirth: 'Italia'
    });
    expect(roster.players[0]).toMatchObject({
      id: '7001',
      birthDate: '1999-04-12',
      country: 'DNK',
      heightCm: 207,
      shirtNumber: '7',
      role: 'Ala',
      uefaRatio: 'C'
    });
    // Los canteranos: sin altura ni puesto («-»).
    expect(roster.players[1]).toMatchObject({ heightCm: null, weightKg: null, role: null });
  });

  it('las estadísticas de liga regular en el formato común; sin partidos, nada', () => {
    const lines = parseLbaTeamStats(fixture('lba-estadisticas.json'));
    expect(lines).toHaveLength(2);
    expect(lbaStats(lines[0]!)).toMatchObject({
      games: 26,
      starts: 20,
      seconds: 612 * 60,
      points: 301,
      threePointMade: 30,
      steals: 18,
      turnovers: 29,
      blocks: 12,
      blocksReceived: 9,
      dunks: 14,
      rating: 330
    });
    expect(lbaStats(lines[1]!)).toBeNull();
  });

  it('del calendario sólo la liga regular, por fecha y con los jugados marcados', () => {
    expect(parseLbaSchedule(fixture('lba-calendario.json'))).toEqual([
      { matchId: '2', date: '2025-10-05T16:00:00.000Z', played: true },
      { matchId: '3', date: '2025-10-12T18:00:00.000Z', played: true },
      { matchId: '5', date: '2026-01-18T18:00:00.000Z', played: false }
    ]);
  });

  it('en el acta manda quien se sentó en el banquillo, no el entrenador con contrato', () => {
    const coaches = parseLbaMatchCoaches(fixture('lba-acta.json'));
    // En casa, el ayudante: sin contrato con que cruzarlo, tal cual lo escribe el acta.
    expect(coaches.get('9001')).toEqual({ coachId: '502', name: 'Aiutante Mario' });
    expect(coaches.get('9002')).toEqual({ coachId: '601', name: 'Luca Ospite' });
  });

  it('el del inicio es el del primer partido; los demás, por orden de llegada', () => {
    const titular = { coachId: '1', name: 'Titular' };
    const interino = { coachId: '2', name: 'Interino' };
    const nuevo = { coachId: '3', name: 'Nuevo' };
    expect(coachSpells([titular, undefined, titular, interino, titular, nuevo, nuevo])).toEqual([
      { coachId: '1', name: 'Titular', games: 3 },
      { coachId: '2', name: 'Interino', games: 1 },
      { coachId: '3', name: 'Nuevo', games: 2 }
    ]);
  });

  it('lee el club: sede, pabellón y aforo', () => {
    expect(parseLbaClub(fixture('lba-club.json'))).toEqual({
      clubName: 'Pallacanestro Inventata',
      companyTown: 'Città Finta',
      plantName: 'PalaProva',
      plantTown: 'Paese Vicino',
      plantCapacity: 5200
    });
  });

  it('traduce los puestos italianos; «Ala» se parte por altura', () => {
    expect(toLbaPosition('Playmaker', 185)).toBe('PG');
    expect(toLbaPosition('Play/Guardia', 190)).toBe('PG');
    expect(toLbaPosition('Guardia', 195)).toBe('SG');
    expect(toLbaPosition('Guardia/Ala', 198)).toBe('SG');
    expect(toLbaPosition('Ala', 201)).toBe('SF');
    expect(toLbaPosition('Ala', POWER_FORWARD_CM)).toBe('PF');
    expect(toLbaPosition('Ala', null)).toBe('SF');
    expect(toLbaPosition('Ala/Centro', 203)).toBe('PF');
    expect(toLbaPosition('Centro', 210)).toBe('C');
    expect(toLbaPosition(null, 200)).toBeNull();
  });

  it('nacionalidades: códigos ISO de los jugadores y lugares de nacimiento de los técnicos', () => {
    expect(nationFromLbaCountry('DNK')).toBe('DEN');
    expect(nationFromLbaCountry('HRV')).toBe('CRO');
    expect(nationFromLbaCountry('NGA')).toBe('NGR');
    expect(nationFromLbaCountry('BRB')).toBe('BAR');
    expect(nationFromLbaCountry('ITA')).toBe('ITA');
    expect(nationFromLbaCountry(null)).toBeNull();
    expect(nationFromLbaPlace('Ciudad (CRO)')).toBe('CRO');
    expect(nationFromLbaPlace('Ciudad (BOS)')).toBe('BIH');
    expect(nationFromLbaPlace('Ciudad (ARG)')).toBe('ARG');
    expect(nationFromLbaPlace('Croazia')).toBe('CRO');
    expect(nationFromLbaPlace('Grecia')).toBe('GRE');
    expect(nationFromLbaPlace('Italia')).toBe('ITA');
    // Una ciudad sin país es italiana: la LBA sólo lo añade a las de fuera.
    expect(nationFromLbaPlace('Città Finta')).toBe('ITA');
    expect(nationFromLbaPlace('')).toBeNull();
    expect(nationFromLbaPlace(null)).toBeNull();
  });

  it('lee las fichas de entrenador y de jugador, y la lista de equipos', () => {
    const coach = parseLbaCoachProfile(
      JSON.stringify({
        coach: {
          id: 7,
          name: 'Nome',
          surname: 'Finto',
          birth_date: '1970-01-02',
          place_of_birth: 'Paese (GRE)'
        }
      })
    );
    expect(coach).toEqual({
      id: '7',
      firstName: 'Nome',
      lastName: 'Finto',
      birthDate: '1970-01-02',
      placeOfBirth: 'Paese (GRE)'
    });
    const player = parseLbaPlayerProfile(
      JSON.stringify({
        player: {
          id: 8,
          name: 'Altro',
          surname: 'Finto',
          birth_date: '2000-05-06',
          player_alpha3: 'SEN',
          height: 210,
          weight: 110,
          player_number: '35',
          player_role_description: 'Centro',
          uefa_ratio: 'E',
          year: 2026
        }
      })
    );
    expect(player).toMatchObject({
      id: '8',
      country: 'SEN',
      heightCm: 210,
      role: 'Centro',
      year: 2026
    });
    expect(
      parseLbaTeams(
        JSON.stringify({ teams: [{ id: 1, club_id: 2, club_code: 'AB', name: 'Uno' }] })
      )
    ).toEqual([{ teamId: '1', clubId: '2', clubCode: 'AB', name: 'Uno' }]);
  });
});

describe('legapallacanestro.com (Serie A2)', () => {
  it('lee la clasificación del servicio de estadísticas, en orden', () => {
    expect(parseLnpStandings(fixture('lnp-clasificacion.json'))).toEqual([
      { position: 1, teamId: '10', name: 'Squadra Prima', games: 36 },
      { position: 2, teamId: '20', name: 'Squadra Seconda', games: 36 }
    ]);
    expect(parseLnpStandings('{"error":{"code":"102"}}')).toEqual([]);
  });

  it('lee la jornada y parte el pabellón de la ciudad', () => {
    const [game] = parseLnpSchedule(fixture('lnp-calendario.json'));
    expect(game).toMatchObject({
      gameId: 'ita2_1',
      round: 1,
      homeId: '10',
      date: '2025-09-21',
      finished: true
    });
    expect(splitArena(game!.arena)).toEqual({ pavilion: 'PalaFinto Arena', city: 'Città Finta' });
    expect(splitArena('Palasport')).toEqual({ pavilion: 'Palasport', city: null });
  });

  it('lee los totales de la respuesta Ajax: nombres a un lado y números al otro', () => {
    const html = statsHtmlFromAjax(fixture('lnp-estadisticas.json'));
    expect(html).not.toBeNull();
    const lines = parseLnpTeamStats(html!);
    expect(lines.map((line) => [line.playerId, line.name, line.games])).toEqual([
      ['A100', 'Nome Baldi Finti', 20],
      ['A200', 'Altro Giocatore', 0]
    ]);
    expect(lnpStats(lines[0]!)).toMatchObject({
      games: 20,
      seconds: 500 * 60,
      points: 200,
      fouls: 40,
      foulsDrawn: 30,
      twoPointMade: 50,
      threePointAttempted: 60,
      freeThrowMade: 40,
      offensiveRebounds: 10,
      defensiveRebounds: 60,
      blocks: 3,
      blocksReceived: 2,
      turnovers: 25,
      steals: 15,
      assists: 45,
      starts: null,
      dunks: null,
      rating: null
    });
    expect(lnpStats(lines[1]!)).toBeNull();
  });

  it('lee la ficha del jugador y cruza los dos órdenes del nombre', () => {
    const page = parseLnpPlayerPage(fixture('lnp-jugador.html'));
    expect(page).toEqual({
      surnameFirst: 'Baldi Finti Nome',
      shirtNumber: '18',
      role: 'Play/Guardia',
      birth: '7/3/1999',
      nationality: 'CRO/ITA',
      height: '191 cm',
      weight: null
    });
    expect(splitLnpName('Nome Baldi Finti', page.surnameFirst)).toEqual({
      firstName: 'Nome',
      lastName: 'Baldi Finti'
    });
    // La ficha manda en las mayúsculas; si no casan, la primera palabra es el nombre.
    expect(splitLnpName('Uno Mcfinto', 'McFinto Uno')).toEqual({
      firstName: 'Uno',
      lastName: 'McFinto'
    });
    expect(splitLnpName('Uno Dos Tres', null)).toEqual({ firstName: 'Uno', lastName: 'Dos Tres' });
  });
});
