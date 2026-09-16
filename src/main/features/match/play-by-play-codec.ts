import type { GameEvent, GameEventType } from '@shared/engine/basketball';

/**
 * El registro de jugadas, compactado para guardarlo.
 *
 * Un partido son unas quinientas jugadas y, tal cual salen del motor, cada una
 * repite nombres de campo, ids de jugador de veinte letras y el marcador. En
 * JSON plano eso son 60 KB por partido; con esto, unos 10. La diferencia no se
 * nota en uno, pero sí en diez temporadas de partidas guardadas.
 *
 * - Los ids van una sola vez, en una lista, y cada jugada lleva su posición.
 * - El marcador no se guarda: se vuelve a sumar con los puntos de cada jugada,
 *   que es de donde sale en el motor.
 */

const FORMAT_VERSION = 1;

const TYPES: readonly GameEventType[] = [
  'twoPointMade',
  'twoPointMissed',
  'threePointMade',
  'threePointMissed',
  'freeThrowMade',
  'freeThrowMissed',
  'offensiveRebound',
  'defensiveRebound',
  'assist',
  'steal',
  'block',
  'turnover',
  'foul',
  'foulOut',
  'substitution',
  'periodStart',
  'periodEnd',
  // Los tipos nuevos van **al final**: la posición en esta lista es lo que se
  // guarda, así que colarlo en medio le cambiaría el significado a todas las
  // retransmisiones ya guardadas.
  'timeout'
];

/** `[cuarto, reloj, tipo, lado, jugador, segundo jugador, puntos]`; -1 es «nadie». */
type PackedEvent = [number, number, number, number, number, number, number];

interface PackedPlayByPlay {
  v: number;
  players: string[];
  events: PackedEvent[];
}

export interface TeamIds {
  homeTeamId: string;
  awayTeamId: string;
}

export function encodePlayByPlay(events: readonly GameEvent[], teams: TeamIds): string {
  const players: string[] = [];
  const indexes = new Map<string, number>();
  const indexOf = (playerId: string | null | undefined): number => {
    if (!playerId) {
      return -1;
    }
    let index = indexes.get(playerId);
    if (index === undefined) {
      index = players.length;
      players.push(playerId);
      indexes.set(playerId, index);
    }
    return index;
  };

  const packed = events.map((event): PackedEvent => [
    event.period,
    event.clockSeconds,
    TYPES.indexOf(event.type),
    event.teamId === teams.homeTeamId ? 0 : event.teamId === teams.awayTeamId ? 1 : -1,
    indexOf(event.playerId),
    indexOf(event.secondaryPlayerId),
    event.points ?? 0
  ]);

  const payload: PackedPlayByPlay = { v: FORMAT_VERSION, players, events: packed };
  return JSON.stringify(payload);
}

/**
 * Devuelve `null` si lo guardado no se puede leer: un acta sin retransmisión
 * sigue siendo un acta, y es mejor enseñarla así que reventar la pantalla.
 */
export function decodePlayByPlay(stored: string | null, teams: TeamIds): GameEvent[] | null {
  if (!stored) {
    return null;
  }

  let payload: PackedPlayByPlay;
  try {
    payload = JSON.parse(stored) as PackedPlayByPlay;
  } catch {
    return null;
  }
  if (payload?.v !== FORMAT_VERSION || !Array.isArray(payload.events)) {
    return null;
  }

  const playerAt = (index: number): string | null => payload.players[index] ?? null;
  let homeScore = 0;
  let awayScore = 0;

  return payload.events.map(([period, clockSeconds, type, side, player, secondary, points]) => {
    if (side === 0) homeScore += points;
    if (side === 1) awayScore += points;

    const event: GameEvent = {
      period,
      clockSeconds,
      type: TYPES[type] ?? 'periodEnd',
      teamId: side === 0 ? teams.homeTeamId : side === 1 ? teams.awayTeamId : '',
      playerId: playerAt(player),
      homeScore,
      awayScore
    };
    if (secondary >= 0) {
      event.secondaryPlayerId = playerAt(secondary);
    }
    if (points > 0) {
      event.points = points;
    }
    return event;
  });
}
