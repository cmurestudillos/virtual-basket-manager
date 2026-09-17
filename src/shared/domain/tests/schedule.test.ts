import { describe, expect, it } from 'vitest';
import {
  generateDoubleRoundRobin,
  generateRoundRobin,
  generateSingleRoundRobin,
  homeGamesPerSeason,
  matchdayDate,
  roundRobinLaps,
  type ScheduledPairing
} from '../schedule';

const TEAMS = Array.from({ length: 18 }, (_, index) => `team-${index + 1}`);

function allPairings(rounds: ScheduledPairing[][]): ScheduledPairing[] {
  return rounds.flat();
}

describe('generateSingleRoundRobin', () => {
  it('genera n-1 jornadas con todos los equipos jugando una vez cada una', () => {
    const rounds = generateSingleRoundRobin(TEAMS);

    expect(rounds).toHaveLength(17);
    for (const round of rounds) {
      expect(round).toHaveLength(9);
      const playing = round.flatMap((pairing) => [pairing.homeTeamId, pairing.awayTeamId]);
      expect(new Set(playing).size).toBe(18);
    }
  });

  it('empareja a cada equipo con cada rival exactamente una vez', () => {
    const pairs = allPairings(generateSingleRoundRobin(TEAMS)).map((pairing) =>
      [pairing.homeTeamId, pairing.awayTeamId].sort().join('|')
    );

    expect(pairs).toHaveLength(153); // 18 * 17 / 2
    expect(new Set(pairs).size).toBe(153);
  });

  it('reparte los campos sin dejar a nadie jugándolo casi todo fuera', () => {
    const rounds = generateSingleRoundRobin(TEAMS);
    const homeGames = new Map<string, number>();

    for (const pairing of allPairings(rounds)) {
      homeGames.set(pairing.homeTeamId, (homeGames.get(pairing.homeTeamId) ?? 0) + 1);
    }

    for (const teamId of TEAMS) {
      const home = homeGames.get(teamId) ?? 0;
      // Con 17 jornadas el reparto exacto es imposible: 8 o 9 en casa.
      expect(home).toBeGreaterThanOrEqual(8);
      expect(home).toBeLessThanOrEqual(9);
    }
  });

  it('con número par sale el mismo calendario de siempre, sin descansos', () => {
    const rounds = generateSingleRoundRobin(TEAMS.slice(0, 4));

    expect(rounds).toEqual([
      [
        { homeTeamId: 'team-1', awayTeamId: 'team-2' },
        { homeTeamId: 'team-4', awayTeamId: 'team-3' }
      ],
      [
        { homeTeamId: 'team-4', awayTeamId: 'team-1' },
        { homeTeamId: 'team-3', awayTeamId: 'team-2' }
      ],
      [
        { homeTeamId: 'team-1', awayTeamId: 'team-3' },
        { homeTeamId: 'team-2', awayTeamId: 'team-4' }
      ]
    ]);
  });
});

describe('generateSingleRoundRobin con número impar de equipos', () => {
  const ODD_TEAMS = TEAMS.slice(0, 17);

  it('genera n jornadas de ocho partidos: cada jornada descansa uno', () => {
    const rounds = generateSingleRoundRobin(ODD_TEAMS);

    expect(rounds).toHaveLength(17);
    const resting: string[] = [];
    for (const round of rounds) {
      expect(round).toHaveLength(8);
      const playing = round.flatMap((pairing) => [pairing.homeTeamId, pairing.awayTeamId]);
      // Nadie juega dos veces el mismo día.
      expect(new Set(playing).size).toBe(16);
      resting.push(...ODD_TEAMS.filter((teamId) => !playing.includes(teamId)));
    }

    // Y cada equipo descansa exactamente una vez por vuelta.
    expect(resting).toHaveLength(17);
    expect(new Set(resting).size).toBe(17);
  });

  it('empareja a cada equipo con cada rival exactamente una vez', () => {
    const pairs = allPairings(generateSingleRoundRobin(ODD_TEAMS)).map((pairing) =>
      [pairing.homeTeamId, pairing.awayTeamId].sort().join('|')
    );

    expect(pairs).toHaveLength(136); // 17 * 16 / 2
    expect(new Set(pairs).size).toBe(136);
  });

  it('reparte los campos a partes iguales: ocho en casa y ocho fuera', () => {
    const home = new Map<string, number>();
    const away = new Map<string, number>();
    for (const pairing of allPairings(generateSingleRoundRobin(ODD_TEAMS))) {
      home.set(pairing.homeTeamId, (home.get(pairing.homeTeamId) ?? 0) + 1);
      away.set(pairing.awayTeamId, (away.get(pairing.awayTeamId) ?? 0) + 1);
    }

    for (const teamId of ODD_TEAMS) {
      expect(home.get(teamId)).toBe(8);
      expect(away.get(teamId)).toBe(8);
    }
  });

  it('a dos vueltas son 34 jornadas, con 16 partidos en casa y 16 fuera', () => {
    const rounds = generateRoundRobin(ODD_TEAMS, 2);
    const home = new Map<string, number>();
    const away = new Map<string, number>();

    expect(rounds).toHaveLength(34);
    for (const round of rounds) {
      const playing = round.flatMap((pairing) => [pairing.homeTeamId, pairing.awayTeamId]);
      expect(new Set(playing).size).toBe(16);
    }
    for (const pairing of allPairings(rounds)) {
      home.set(pairing.homeTeamId, (home.get(pairing.homeTeamId) ?? 0) + 1);
      away.set(pairing.awayTeamId, (away.get(pairing.awayTeamId) ?? 0) + 1);
    }
    for (const teamId of ODD_TEAMS) {
      expect(home.get(teamId)).toBe(16);
      expect(away.get(teamId)).toBe(16);
    }
  });
});

describe('roundRobinLaps', () => {
  it('dieciocho y diecisiete juegan dos vueltas; diez y nueve, tres', () => {
    expect(roundRobinLaps(18)).toBe(2);
    expect(roundRobinLaps(17)).toBe(2);
    expect(roundRobinLaps(10)).toBe(3);
    expect(roundRobinLaps(9)).toBe(3);
  });
});

describe('homeGamesPerSeason', () => {
  it('la mitad de los partidos de cada equipo', () => {
    expect(homeGamesPerSeason(18)).toBe(17);
    expect(homeGamesPerSeason(17)).toBe(16);
  });
});

describe('generateDoubleRoundRobin', () => {
  it('genera 34 jornadas para 18 equipos', () => {
    expect(generateDoubleRoundRobin(TEAMS)).toHaveLength(34);
  });

  it('da a cada equipo 17 partidos en casa y 17 fuera', () => {
    const rounds = generateDoubleRoundRobin(TEAMS);
    const home = new Map<string, number>();
    const away = new Map<string, number>();

    for (const pairing of allPairings(rounds)) {
      home.set(pairing.homeTeamId, (home.get(pairing.homeTeamId) ?? 0) + 1);
      away.set(pairing.awayTeamId, (away.get(pairing.awayTeamId) ?? 0) + 1);
    }

    for (const teamId of TEAMS) {
      expect(home.get(teamId)).toBe(17);
      expect(away.get(teamId)).toBe(17);
    }
  });

  it('la vuelta invierte el campo de la ida', () => {
    const rounds = generateDoubleRoundRobin(TEAMS);
    const ida = rounds[0]![0]!;
    const vuelta = rounds[17]![0]!;

    expect(vuelta.homeTeamId).toBe(ida.awayTeamId);
    expect(vuelta.awayTeamId).toBe(ida.homeTeamId);
  });
});

describe('matchdayDate', () => {
  it('empieza en domingo, a finales de septiembre', () => {
    const first = matchdayDate(2025, 1);

    expect(first.getUTCDay()).toBe(0);
    expect(first.getUTCMonth()).toBe(8);
    expect(first.getUTCDate()).toBeGreaterThanOrEqual(28);
  });

  it('pone una jornada por semana', () => {
    const first = matchdayDate(2025, 1);
    const second = matchdayDate(2025, 2);

    expect(second.getTime() - first.getTime()).toBe(7 * 24 * 60 * 60 * 1000);
  });

  it('acaba la temporada de 34 jornadas en mayo', () => {
    const last = matchdayDate(2025, 34);

    expect(last.getUTCFullYear()).toBe(2026);
    expect(last.getUTCMonth()).toBe(4);
  });
});
