import { describe, expect, it } from 'vitest';
import type { CourtEvent } from '@shared/contracts/match.contract';
import { FIBA_RULESET } from '@shared/domain/rulesets';
import { simulateGame, type EngineTeam, type GameEvent } from '@shared/engine/basketball';
import { buildTestTeam } from '@shared/engine/basketball/tests/test-teams';
import {
  AWAY_KIT,
  attacksRight,
  ballAt,
  COURT_LENGTH,
  COURT_WIDTH,
  CourtDirector,
  hoopFor,
  matchKits,
  shirtNumbers,
  shortPlayerName,
  THREE_POINT_RADIUS,
  type CourtBeat,
  type CourtRosterPlayer
} from '../court';

const REGULATION = FIBA_RULESET.periods;

function rosterOf(home: EngineTeam, away: EngineTeam): CourtRosterPlayer[] {
  return (
    [
      ['home', home],
      ['away', away]
    ] as const
  ).flatMap(([side, team]) =>
    team.players.map((player, index) => ({
      playerId: player.id,
      side,
      position: player.position,
      number: index + 4,
      shortName: player.name
    }))
  );
}

function toCourt(events: readonly GameEvent[], homeId: string): CourtEvent[] {
  return events.map((event) => ({
    period: event.period,
    clockSeconds: event.clockSeconds,
    type: event.type,
    side: event.teamId === null ? null : event.teamId === homeId ? 'home' : 'away',
    playerId: event.playerId,
    secondaryPlayerId: event.secondaryPlayerId ?? null,
    shotType: event.shotType ?? null,
    points: event.points ?? 0,
    homeScore: event.homeScore,
    awayScore: event.awayScore,
    ...(event.lineups ? { lineups: event.lineups } : {})
  }));
}

function playedGame(gameId: string): { events: CourtEvent[]; roster: CourtRosterPlayer[] } {
  const home = buildTestTeam('local', 60);
  const away = buildTestTeam('visitante', 60);
  const result = simulateGame({ gameId, home, away, ruleset: FIBA_RULESET });
  return { events: toCourt(result.events, home.id), roster: rosterOf(home, away) };
}

function direct(events: readonly CourtEvent[], roster: readonly CourtRosterPlayer[]): CourtBeat[] {
  const director = new CourtDirector(roster, events, REGULATION);
  return events.map((_, index) => director.apply(index));
}

function distance(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

describe('pista: lados y aros', () => {
  it('el local ataca a la derecha en la primera parte y cambia en la segunda', () => {
    expect(attacksRight('home', 1, 4)).toBe(true);
    expect(attacksRight('home', 2, 4)).toBe(true);
    expect(attacksRight('home', 3, 4)).toBe(false);
    expect(attacksRight('away', 3, 4)).toBe(true);
    // Las prórrogas siguen con los lados de la segunda parte.
    expect(attacksRight('home', 5, 4)).toBe(false);
    expect(hoopFor('home', 1, 4).x).toBeGreaterThan(COURT_LENGTH / 2);
    expect(hoopFor('away', 1, 4).x).toBeLessThan(COURT_LENGTH / 2);
  });
});

describe('CourtDirector', () => {
  const { events, roster } = playedGame('pista-1');
  const beats = direct(events, roster);

  it('siempre hay cinco por lado en pista, y son de su equipo', () => {
    const sideOf = new Map(roster.map((player) => [player.playerId, player.side]));
    for (const beat of beats) {
      expect(beat.lineups.home).toHaveLength(5);
      expect(beat.lineups.away).toHaveLength(5);
      expect(new Set(beat.lineups.home).size).toBe(5);
      expect(beat.lineups.home.every((id) => sideOf.get(id) === 'home')).toBe(true);
      expect(beat.lineups.away.every((id) => sideOf.get(id) === 'away')).toBe(true);
    }
  });

  it('aguanta partidos distintos sin perder a nadie', () => {
    for (const id of ['pista-2', 'pista-3', 'pista-4', 'pista-5']) {
      const game = playedGame(id);
      for (const beat of direct(game.events, game.roster)) {
        expect(new Set(beat.lineups.home).size).toBe(5);
        expect(new Set(beat.lineups.away).size).toBe(5);
      }
    }
  });

  it('empieza cada cuarto con los cinco que dice el motor', () => {
    events.forEach((event, index) => {
      if (event.type === 'periodStart' && event.lineups) {
        const beat = beats[index] as CourtBeat;
        expect([...beat.lineups.home].sort()).toEqual([...event.lineups.home].sort());
        expect([...beat.lineups.away].sort()).toEqual([...event.lineups.away].sort());
      }
    });
  });

  it('los cambios meten al que entra y sacan al que sale', () => {
    let checked = 0;
    events.forEach((event, index) => {
      if (event.type !== 'substitution' || !event.side || !event.playerId) return;
      const lineup = (beats[index] as CourtBeat).lineups[event.side];
      expect(lineup).toContain(event.playerId);
      if (event.secondaryPlayerId) expect(lineup).not.toContain(event.secondaryPlayerId);
      checked += 1;
    });
    expect(checked).toBeGreaterThan(0);
  });

  it('cada tiro sale de su zona y va al aro que toca', () => {
    let threes = 0;
    events.forEach((event, index) => {
      if (!/^(two|three)Point(Made|Missed)$/.test(event.type) || !event.side) return;
      const beat = beats[index] as CourtBeat;
      if (beat.ball.result === null) return; // taponado
      const hoop = hoopFor(event.side, event.period, REGULATION);
      const release = beat.ball.path.at(-3) as { x: number; y: number };
      const rim = beat.ball.path.at(-2) as { x: number; y: number };
      expect(rim).toMatchObject(hoop);
      if (event.shotType === 'threePoint') {
        expect(distance(release, hoop)).toBeGreaterThanOrEqual(THREE_POINT_RADIUS - 0.8);
        threes += 1;
      }
      if (event.shotType === 'close') {
        expect(distance(release, hoop)).toBeLessThan(2.2);
      }
      expect(beat.ball.result).toBe(event.type.endsWith('Made') ? 'made' : 'missed');
    });
    expect(threes).toBeGreaterThan(0);
  });

  it('nadie se sale del pabellón', () => {
    for (const beat of beats) {
      for (const point of Object.values(beat.targets)) {
        expect(point.x).toBeGreaterThanOrEqual(0);
        expect(point.x).toBeLessThanOrEqual(COURT_LENGTH);
        expect(point.y).toBeGreaterThanOrEqual(-1);
        expect(point.y).toBeLessThanOrEqual(COURT_WIDTH);
      }
    }
  });

  it('es determinista: la misma repetición se ve siempre igual', () => {
    expect(direct(events, roster)).toEqual(beats);
  });

  it('cuenta las canastas asistidas con el pase', () => {
    const assisted = events.findIndex(
      (event, index) =>
        event.type.endsWith('Made') &&
        !event.type.startsWith('freeThrow') &&
        events[index + 1]?.type === 'assist'
    );
    expect(assisted).toBeGreaterThanOrEqual(0);
    const beat = beats[assisted] as CourtBeat;
    expect(beat.caption).toContain('pase de');
    expect(beat.ball.path).toHaveLength(4);
  });

  it('en el directo sigue el registro según crece, igual que con el partido entero', () => {
    const director = new CourtDirector(roster, events.slice(0, 1), REGULATION);
    const growing = events.map((_, index) => {
      // La asistencia llega en la misma posesión que su canasta.
      director.extend(events.slice(0, index + 2));
      return director.apply(index);
    });
    expect(growing).toEqual(beats);
  });

  it('en partidos de antes de la pista, sin quintetos, los deduce', () => {
    const old = events.map((event) => {
      const copy: CourtEvent = { ...event, shotType: null };
      delete copy.lineups;
      return copy;
    });
    for (const beat of direct(old, roster)) {
      expect(beat.lineups.home).toHaveLength(5);
      expect(beat.lineups.away).toHaveLength(5);
    }
  });
});

describe('ballAt', () => {
  it('recorre el vuelo de principio a fin con su parábola', () => {
    const flight = {
      path: [
        { x: 0, y: 0, z: 2 },
        { x: 10, y: 0, z: 3 }
      ],
      arcs: [2],
      result: null
    };
    expect(ballAt(flight, 0)).toEqual({ x: 0, y: 0, z: 2 });
    expect(ballAt(flight, 0.5).z).toBeCloseTo(4.5);
    expect(ballAt(flight, 1).x).toBeCloseTo(10, 2);
  });
});

describe('equipaciones y dorsales', () => {
  it('los dorsales no se repiten y no dependen del orden', () => {
    const ids = Array.from({ length: 15 }, (_, index) => `jugador-${index}`);
    const numbers = shirtNumbers(ids);
    expect(new Set(numbers.values()).size).toBe(15);
    expect(shirtNumbers([...ids].reverse())).toEqual(numbers);
  });

  it('si los dos visten igual, el visitante va de blanco', () => {
    const kits = matchKits('mismo', 'mismo');
    expect(kits.away).toBe(AWAY_KIT);
  });

  it('abrevia el nombre de pila', () => {
    expect(shortPlayerName('Juan Carlos Navarro')).toBe('J. Carlos Navarro');
    expect(shortPlayerName('Sabonis')).toBe('Sabonis');
  });
});
