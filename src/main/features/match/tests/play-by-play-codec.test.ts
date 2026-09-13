import { describe, expect, it } from 'vitest';
import { FIBA_RULESET } from '@shared/domain/rulesets';
import { simulateGame, type GameEvent } from '@shared/engine/basketball';
import { buildTestTeam } from '@shared/engine/basketball/tests/test-teams';
import { decodePlayByPlay, encodePlayByPlay } from '../play-by-play-codec';

const TEAMS = { homeTeamId: 'local', awayTeamId: 'visitante' };

/** Lo que el motor deja sin poner y el códec rellena: se compara lo que significa. */
function normalized(events: readonly GameEvent[]): GameEvent[] {
  return events.map((event) => ({
    ...event,
    secondaryPlayerId: event.secondaryPlayerId ?? null,
    points: event.points ?? 0
  }));
}

describe('play-by-play-codec', () => {
  const result = simulateGame({
    gameId: 'codec',
    home: buildTestTeam('local', 60),
    away: buildTestTeam('visitante', 60),
    ruleset: FIBA_RULESET
  });

  it('devuelve exactamente las jugadas que guardó, marcador incluido', () => {
    const decoded = decodePlayByPlay(encodePlayByPlay(result.events, TEAMS), TEAMS);

    expect(normalized(decoded ?? [])).toEqual(normalized(result.events));
  });

  it('ocupa bastante menos que el registro tal cual', () => {
    const packed = encodePlayByPlay(result.events, TEAMS).length;
    const raw = JSON.stringify(result.events).length;

    expect(packed).toBeLessThan(raw / 3);
  });

  it('un registro vacío o ilegible no revienta: no hay retransmisión', () => {
    expect(decodePlayByPlay(null, TEAMS)).toBeNull();
    expect(decodePlayByPlay('{roto', TEAMS)).toBeNull();
    expect(decodePlayByPlay(JSON.stringify({ v: 99, players: [], events: [] }), TEAMS)).toBeNull();
  });
});
