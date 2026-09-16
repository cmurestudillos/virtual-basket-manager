/**
 * La pista: dónde está cada uno en cada jugada.
 *
 * El motor no sabe de coordenadas —decide quién tira, desde qué zona y si
 * entra— y la pista no decide nada: coloca. Este módulo convierte cada jugada
 * del registro en una **escena**: dónde van los diez, por dónde viaja el balón
 * y qué hay que contar. La pista 2D y la 3D dibujan la misma escena, así que
 * se ven igual y se equivocan igual.
 *
 * Todo en metros, con el origen en una esquina: la pista FIBA mide 28 × 15, los
 * aros están a 1,575 m de cada fondo y el triple a 6,75 m.
 *
 * Funciones puras: ni base de datos ni azar. Lo que parece variedad —el ángulo
 * de cada tiro, quién va al rebote— sale del número de jugada, así que la misma
 * repetición se ve siempre igual.
 */

import type { CourtEvent } from '@shared/contracts/match.contract';
import type { Position } from './positions';

export const COURT_LENGTH = 28;
export const COURT_WIDTH = 15;
export const HOOP_OFFSET = 1.575;
export const HOOP_HEIGHT = 3.05;
export const THREE_POINT_RADIUS = 6.75;
export const FREE_THROW_DISTANCE = 4.6;
export const LANE_WIDTH = 4.9;
export const LANE_LENGTH = 5.8;
export const CENTER_CIRCLE_RADIUS = 1.8;

export type CourtSide = 'home' | 'away';

export interface CourtPoint {
  x: number;
  y: number;
}

export interface BallPoint extends CourtPoint {
  /** Altura sobre el parqué. */
  z: number;
}

/** Un jugador de la plantilla tal y como lo necesita la pista. */
export interface CourtRosterPlayer {
  playerId: string;
  side: CourtSide;
  position: Position;
  /** Dorsal que se pinta. */
  number: number;
  /** «J. Pérez». */
  shortName: string;
}

/** El vuelo del balón en una jugada: puede pasar por un pase antes de llegar a su destino. */
export interface BallFlight {
  /** Puntos por los que pasa, en orden. */
  path: BallPoint[];
  /** Altura máxima de cada tramo por encima de la recta entre sus extremos. */
  arcs: number[];
  /** Cómo acaba un tiro: se pinta distinto un acierto de un fallo. */
  result: 'made' | 'missed' | null;
}

export interface CourtBeat {
  /** Hacia dónde va cada jugador en pista. */
  targets: Record<string, CourtPoint>;
  /** Los que están en pista después de la jugada, por lado. */
  lineups: Record<CourtSide, string[]>;
  ball: BallFlight;
  /** Quién ataca después de la jugada. */
  offense: CourtSide;
  /** Lo que se cuenta encima de la pista, si hay algo que contar. */
  caption: string | null;
  /** Quién protagoniza la jugada, para resaltarlo. */
  focusPlayerId: string | null;
  /** Segundos de animación que pide la jugada a velocidad normal. */
  duration: number;
}

const POSITION_ORDER: readonly Position[] = ['PG', 'SG', 'SF', 'PF', 'C'];
const CENTER: CourtPoint = { x: COURT_LENGTH / 2, y: COURT_WIDTH / 2 };

/**
 * Hacia qué aro ataca un equipo en un cuarto: el local ataca a la derecha en la
 * primera parte y a la izquierda en la segunda y en las prórrogas.
 */
export function attacksRight(side: CourtSide, period: number, regulationPeriods: number): boolean {
  const firstHalf = period <= Math.floor(regulationPeriods / 2);
  return side === 'home' ? firstHalf : !firstHalf;
}

/** El aro al que ataca un equipo. */
export function hoopFor(side: CourtSide, period: number, regulationPeriods: number): CourtPoint {
  return attacksRight(side, period, regulationPeriods)
    ? { x: COURT_LENGTH - HOOP_OFFSET, y: CENTER.y }
    : { x: HOOP_OFFSET, y: CENTER.y };
}

/** Número de 0 a 1 que sale de la jugada y de una sal: la «variedad» sin azar. */
export function variation(index: number, salt: number): number {
  const value = Math.sin((index + 1) * 12.9898 + salt * 78.233) * 43758.5453;
  return value - Math.floor(value);
}

function clampToCourt(point: CourtPoint): CourtPoint {
  return {
    x: Math.min(COURT_LENGTH - 0.3, Math.max(0.3, point.x)),
    y: Math.min(COURT_WIDTH - 0.3, Math.max(0.3, point.y))
  };
}

/** Un punto a una distancia y un ángulo del aro, mirando hacia el centro del campo. */
function fromHoop(hoop: CourtPoint, distance: number, angle: number): CourtPoint {
  const toCenter = hoop.x < CENTER.x ? 1 : -1;
  return clampToCourt({
    x: hoop.x + toCenter * Math.cos(angle) * distance,
    y: hoop.y + Math.sin(angle) * distance
  });
}

/** Los cinco puestos de un ataque estático: base arriba, aleros abiertos, pívot al poste. */
export function offensiveSpots(hoop: CourtPoint): CourtPoint[] {
  return [
    fromHoop(hoop, 8, 0.05),
    fromHoop(hoop, 7.2, 0.95),
    fromHoop(hoop, 6.6, -1.35),
    fromHoop(hoop, 5, -0.55),
    fromHoop(hoop, 2, 1.1)
  ];
}

/** Un defensor, entre su par y el aro. */
function guard(offender: CourtPoint, hoop: CourtPoint, tightness = 0.35): CourtPoint {
  return {
    x: offender.x + (hoop.x - offender.x) * tightness,
    y: offender.y + (hoop.y - offender.y) * tightness
  };
}

/** Desde dónde se lanza un tiro de esa zona. */
export function shotSpot(
  hoop: CourtPoint,
  zone: CourtEvent['shotType'],
  index: number
): CourtPoint {
  const angle = (variation(index, 1) - 0.5) * 2.6;
  const distance =
    zone === 'threePoint'
      ? THREE_POINT_RADIUS + 0.3 + variation(index, 2) * 1.2
      : zone === 'midRange'
        ? 3.4 + variation(index, 2) * 2.4
        : 0.6 + variation(index, 2) * 1.2;
  return fromHoop(hoop, distance, angle);
}

/** Los banquillos: el local a la izquierda de la mesa y el visitante a la derecha. */
function benchSpot(side: CourtSide, slot: number): CourtPoint {
  const start = side === 'home' ? 6 : 17;
  return { x: start + slot * 1.1, y: -0.9 };
}

/**
 * El director de la pista: lleva quién está en pista, quién ataca y dónde está
 * cada uno, y convierte cada jugada en su escena.
 */
export class CourtDirector {
  private lineups: Record<CourtSide, string[]> = { home: [], away: [] };
  private offense: CourtSide = 'home';
  private positions: Record<string, CourtPoint> = {};
  private ball: BallPoint = { ...CENTER, z: 1 };
  private readonly rosterById: Map<string, CourtRosterPlayer>;

  constructor(
    private readonly roster: readonly CourtRosterPlayer[],
    private events: readonly CourtEvent[],
    private readonly regulationPeriods: number
  ) {
    this.rosterById = new Map(roster.map((player) => [player.playerId, player]));
  }

  /**
   * En el directo el registro crece posesión a posesión y llega en una lista
   * nueva cada vez: se cambia sin perder lo ya aplicado. Tiene que empezar
   * igual que la anterior.
   */
  extend(events: readonly CourtEvent[]): void {
    this.events = events;
  }

  /** La escena de la jugada `index` del registro. Hay que aplicarlas en orden. */
  apply(index: number): CourtBeat {
    const event = this.events[index] as CourtEvent;
    const period = event.period;

    if (event.type === 'periodStart') {
      return this.periodStart(event, index);
    }
    if (this.lineups.home.length < 5 || this.lineups.away.length < 5) {
      this.fillLineups(index);
    }
    if (event.type !== 'substitution') {
      this.ensureOnCourt(event.playerId, event.side);
    }

    switch (event.type) {
      case 'twoPointMade':
      case 'twoPointMissed':
      case 'threePointMade':
      case 'threePointMissed':
        return this.shot(event, index);
      case 'freeThrowMade':
      case 'freeThrowMissed':
        return this.freeThrow(event, index);
      case 'offensiveRebound':
      case 'defensiveRebound':
        return this.rebound(event, index);
      case 'steal':
        return this.steal(event, period);
      case 'turnover':
        return this.turnover(event, index);
      case 'block':
        // El tapón se cuenta con el tiro que viene detrás.
        return this.still(null, event.playerId, 0);
      case 'substitution':
        return this.substitution(event, period);
      case 'timeout':
        return this.toBenches(`Tiempo muerto de ${this.teamLabel(event.side)}`, 1.2);
      case 'periodEnd':
        return this.toBenches('Final del cuarto', 1.4);
      case 'foul':
      case 'foulOut':
        return this.still(
          event.type === 'foulOut'
            ? `${this.name(event.playerId)}, eliminado`
            : `Falta de ${this.name(event.playerId)}`,
          event.playerId,
          0.6
        );
      default:
        // La asistencia ya se dibujó con su canasta.
        return this.still(null, event.playerId, 0);
    }
  }

  // --- Jugadas -----------------------------------------------------------------

  private periodStart(event: CourtEvent, index: number): CourtBeat {
    if (event.lineups) {
      this.lineups = { home: [...event.lineups.home], away: [...event.lineups.away] };
    } else {
      this.lineups = { home: [], away: [] };
      this.fillLineups(index + 1);
    }
    const targets: Record<string, CourtPoint> = {};
    for (const side of ['home', 'away'] as const) {
      const toLeft = attacksRight(side, event.period, this.regulationPeriods) ? -1 : 1;
      this.sorted(side).forEach((playerId, slot) => {
        const angle = (slot / 5) * Math.PI * 2;
        targets[playerId] = {
          x:
            CENTER.x +
            toLeft * (CENTER_CIRCLE_RADIUS + 0.4 + slot * 0.3) * Math.abs(Math.cos(angle)),
          y: CENTER.y + Math.sin(angle) * (CENTER_CIRCLE_RADIUS + 1)
        };
      });
    }
    this.positions = { ...this.positions, ...targets };
    this.ball = { ...CENTER, z: 3.2 };
    return this.beat(targets, { path: [this.ball], arcs: [], result: null }, null, null, 1);
  }

  private shot(event: CourtEvent, index: number): CourtBeat {
    const side = (event.side ?? this.offense) as CourtSide;
    this.offense = side;
    const hoop = hoopFor(side, event.period, this.regulationPeriods);
    const spot = shotSpot(hoop, event.shotType ?? this.guessZone(event, index), index);
    const targets = this.setPiece(side, hoop, event.playerId, spot);
    const made = event.type.endsWith('Made');

    // Si la canasta viene asistida, el balón llega antes al tirador.
    const next = this.events[index + 1];
    const assisted =
      made && next?.type === 'assist' && next.clockSeconds === event.clockSeconds
        ? next.playerId
        : null;
    const passer = assisted ? (targets[assisted] ?? null) : null;

    const release: BallPoint = { ...spot, z: 2.3 };
    const rim: BallPoint = { ...hoop, z: HOOP_HEIGHT };
    const end: BallPoint = made
      ? { ...hoop, z: 0.4 }
      : {
          x: hoop.x + (variation(index, 3) - 0.5) * 2,
          y: hoop.y + (variation(index, 4) - 0.5) * 2,
          z: 2.2
        };

    // Un tapón corta el vuelo: el balón no llega al aro y cae cerca del tirador.
    const previous = this.events[index - 1];
    const blocker =
      !made && previous?.type === 'block' && previous.clockSeconds === event.clockSeconds
        ? previous.playerId
        : null;
    if (blocker) {
      const fall: BallPoint = {
        x: spot.x + (hoop.x > spot.x ? -1 : 1) * 1.5,
        y: spot.y + (variation(index, 9) - 0.5) * 3,
        z: 0.3
      };
      targets[blocker] = { x: spot.x + (hoop.x - spot.x) * 0.15, y: spot.y + 0.35 };
      this.positions[blocker] = targets[blocker] as CourtPoint;
      this.ball = fall;
      return this.beat(
        targets,
        { path: [release, { ...release, z: 3.1 }, fall], arcs: [0.3, 0.4], result: null },
        `Tapón de ${this.name(blocker)} a ${this.name(event.playerId)}`,
        blocker,
        1
      );
    }

    const path = passer ? [{ ...passer, z: 1.5 }, release, rim, end] : [release, rim, end];
    const arcs = passer
      ? [0.6, event.type.startsWith('three') ? 2.4 : 1.6, 0.2]
      : [event.type.startsWith('three') ? 2.4 : 1.6, 0.2];
    this.ball = end;

    const label = event.type.startsWith('three')
      ? 'Triple'
      : event.shotType === 'close'
        ? 'Bandeja'
        : 'Tiro';
    const caption = made
      ? `${label} de ${this.name(event.playerId)}${assisted ? `, pase de ${this.name(assisted)}` : ''}`
      : `Falla ${this.name(event.playerId)}`;
    return this.beat(
      targets,
      { path, arcs, result: made ? 'made' : 'missed' },
      caption,
      event.playerId,
      passer ? 1.6 : 1.1
    );
  }

  private freeThrow(event: CourtEvent, index: number): CourtBeat {
    const side = (event.side ?? this.offense) as CourtSide;
    const hoop = hoopFor(side, event.period, this.regulationPeriods);
    const line = fromHoop(hoop, FREE_THROW_DISTANCE, 0);
    const targets: Record<string, CourtPoint> = {};
    const lane = [1.4, 2.4, 3.4];
    let spot = 0;
    for (const who of ['home', 'away'] as const) {
      for (const playerId of this.sorted(who)) {
        if (playerId === event.playerId) {
          targets[playerId] = line;
          continue;
        }
        const along = lane[spot % lane.length] as number;
        const upper = spot % 2 === 0;
        targets[playerId] = fromHoop(hoop, along + 0.4, upper ? 1.25 : -1.25);
        spot += 1;
      }
    }
    const made = event.type === 'freeThrowMade';
    const release: BallPoint = { ...line, z: 2.2 };
    const end: BallPoint = made
      ? { ...hoop, z: 0.4 }
      : { ...hoop, x: hoop.x + (variation(index, 5) - 0.5), z: 2.4 };
    this.positions = { ...this.positions, ...targets };
    this.ball = end;
    return this.beat(
      targets,
      {
        path: [release, { ...hoop, z: HOOP_HEIGHT }, end],
        arcs: [1.2, 0.1],
        result: made ? 'made' : 'missed'
      },
      `Tiro libre de ${this.name(event.playerId)}${made ? '' : ': fuera'}`,
      event.playerId,
      0.8
    );
  }

  private rebound(event: CourtEvent, index: number): CourtBeat {
    const side = (event.side ?? this.offense) as CourtSide;
    // El rebote se coge bajo el aro donde se tiró: el del equipo que atacaba.
    const shooting = event.type === 'offensiveRebound' ? side : other(side);
    const hoop = hoopFor(shooting, event.period, this.regulationPeriods);
    const spot = fromHoop(hoop, 1.4 + variation(index, 6) * 1.2, (variation(index, 7) - 0.5) * 2.2);
    const targets = this.setPiece(shooting, hoop, event.playerId, spot, true);
    this.offense = side;
    this.ball = { ...spot, z: 2.4 };
    return this.beat(
      targets,
      { path: [this.ball], arcs: [], result: null },
      event.type === 'offensiveRebound'
        ? `Rebote ofensivo de ${this.name(event.playerId)}`
        : `Rebote de ${this.name(event.playerId)}`,
      event.playerId,
      0.6
    );
  }

  private steal(event: CourtEvent, period: number): CourtBeat {
    const side = (event.side ?? other(this.offense)) as CourtSide;
    const at = (event.playerId && this.positions[event.playerId]) || this.ball;
    this.offense = side;
    // Tras el robo, a correr hacia el otro aro.
    const targets = this.formation(side, period);
    this.ball = { x: at.x, y: at.y, z: 1 };
    return this.beat(
      targets,
      {
        path: [this.ball, { ...(targets[event.playerId ?? ''] ?? at), z: 1 }],
        arcs: [0.3],
        result: null
      },
      `Robo de ${this.name(event.playerId)}`,
      event.playerId,
      1
    );
  }

  private turnover(event: CourtEvent, index: number): CourtBeat {
    const next = this.events[index + 1];
    if (next?.type === 'steal') {
      // El robo lo cuenta todo; la pérdida no mueve nada por sí sola.
      return this.still(null, event.playerId, 0);
    }
    const side = (event.side ?? this.offense) as CourtSide;
    const from = (event.playerId && this.positions[event.playerId]) || this.ball;
    const out: BallPoint = { x: from.x, y: from.y < CENTER.y ? -0.4 : COURT_WIDTH + 0.4, z: 0.5 };
    this.offense = other(side);
    this.ball = out;
    return this.beat(
      this.formation(this.offense, event.period),
      { path: [{ ...from, z: 1.2 }, out], arcs: [0.4], result: null },
      `Pérdida de ${this.name(event.playerId)}`,
      event.playerId,
      0.8
    );
  }

  private substitution(event: CourtEvent, period: number): CourtBeat {
    const side = event.side;
    if (!side || !event.playerId) {
      return this.still(null, null, 0);
    }
    const lineup = this.lineups[side];
    const out = event.secondaryPlayerId;
    const at = out ? lineup.indexOf(out) : -1;
    if (at >= 0) {
      lineup[at] = event.playerId;
    } else if (!lineup.includes(event.playerId)) {
      if (lineup.length < 5) lineup.push(event.playerId);
      else lineup[lineup.length - 1] = event.playerId;
    }
    this.positions[event.playerId] = benchSpot(side, 0);
    const targets = this.formation(this.offense, period);
    return this.beat(
      targets,
      { path: [this.ball], arcs: [], result: null },
      `Entra ${this.name(event.playerId)}${out ? ` por ${this.name(out)}` : ''}`,
      event.playerId,
      0.7
    );
  }

  private toBenches(caption: string, duration: number): CourtBeat {
    const targets: Record<string, CourtPoint> = {};
    for (const side of ['home', 'away'] as const) {
      this.sorted(side).forEach((playerId, slot) => {
        targets[playerId] = benchSpot(side, slot);
      });
    }
    this.positions = { ...this.positions, ...targets };
    return this.beat(
      targets,
      { path: [this.ball], arcs: [], result: null },
      caption,
      null,
      duration
    );
  }

  private still(caption: string | null, focus: string | null, duration: number): CourtBeat {
    return this.beat({}, { path: [this.ball], arcs: [], result: null }, caption, focus, duration);
  }

  // --- Por dentro --------------------------------------------------------------

  /** Ataque colocado con uno protagonista en su sitio y la defensa ajustada a él. */
  private setPiece(
    attacking: CourtSide,
    hoop: CourtPoint,
    protagonistId: string | null,
    protagonistSpot: CourtPoint,
    protagonistDefends = false
  ): Record<string, CourtPoint> {
    const targets: Record<string, CourtPoint> = {};
    const spots = offensiveSpots(hoop);
    const attackers = this.sorted(attacking);
    const defenders = this.sorted(other(attacking));

    attackers.forEach((playerId, slot) => {
      targets[playerId] = spots[slot] as CourtPoint;
    });
    defenders.forEach((playerId, slot) => {
      targets[playerId] = guard(spots[slot] as CourtPoint, hoop);
    });
    if (protagonistId) {
      targets[protagonistId] = protagonistSpot;
      // Su par le sale al paso.
      const attackerSlot = attackers.indexOf(protagonistId);
      const defenderSlot = defenders.indexOf(protagonistId);
      if (attackerSlot >= 0 && defenders[attackerSlot]) {
        targets[defenders[attackerSlot] as string] = guard(protagonistSpot, hoop, 0.18);
      }
      if (protagonistDefends && defenderSlot >= 0 && attackers[defenderSlot]) {
        targets[attackers[defenderSlot] as string] = guard(protagonistSpot, hoop, -0.4);
      }
    }
    this.positions = { ...this.positions, ...targets };
    return targets;
  }

  /** Los diez en su sitio con un equipo atacando. */
  private formation(attacking: CourtSide, period: number): Record<string, CourtPoint> {
    return this.setPiece(
      attacking,
      hoopFor(attacking, period, this.regulationPeriods),
      null,
      CENTER
    );
  }

  private beat(
    targets: Record<string, CourtPoint>,
    ball: BallFlight,
    caption: string | null,
    focusPlayerId: string | null,
    duration: number
  ): CourtBeat {
    return {
      targets,
      lineups: { home: [...this.lineups.home], away: [...this.lineups.away] },
      ball,
      offense: this.offense,
      caption,
      focusPlayerId,
      duration
    };
  }

  /** Los de un lado en pista, ordenados de base a pívot: así cada uno va a su puesto. */
  private sorted(side: CourtSide): string[] {
    return [...this.lineups[side]].sort(
      (a, b) =>
        POSITION_ORDER.indexOf(this.rosterById.get(a)?.position ?? 'SF') -
        POSITION_ORDER.indexOf(this.rosterById.get(b)?.position ?? 'SF')
    );
  }

  /**
   * Sin quintetos guardados —partidos de antes de la pista—, se deducen: los
   * primeros cinco de cada lado que aparecen en las jugadas del cuarto.
   */
  private fillLineups(fromIndex: number): void {
    const period = this.events[fromIndex]?.period ?? this.events[fromIndex - 1]?.period;
    for (let index = fromIndex; index < this.events.length; index += 1) {
      const event = this.events[index] as CourtEvent;
      if (event.period !== period) break;
      if (event.type === 'substitution') continue;
      for (const playerId of [event.playerId, event.secondaryPlayerId]) {
        const player = playerId ? this.rosterById.get(playerId) : undefined;
        if (
          player &&
          this.lineups[player.side].length < 5 &&
          !this.lineups[player.side].includes(player.playerId)
        ) {
          this.lineups[player.side].push(player.playerId);
        }
      }
      if (this.lineups.home.length >= 5 && this.lineups.away.length >= 5) break;
    }
    for (const side of ['home', 'away'] as const) {
      for (const player of this.roster) {
        if (this.lineups[side].length >= 5) break;
        if (player.side === side && !this.lineups[side].includes(player.playerId)) {
          this.lineups[side].push(player.playerId);
        }
      }
    }
  }

  /** Un jugador que aparece sin estar en pista entra por el que lleva más rato sin salir en nada. */
  private ensureOnCourt(playerId: string | null, side: CourtSide | null): void {
    const player = playerId ? this.rosterById.get(playerId) : undefined;
    if (!player || !side || player.side !== side) return;
    const lineup = this.lineups[side];
    if (lineup.includes(player.playerId)) return;
    if (lineup.length < 5) {
      lineup.push(player.playerId);
    } else {
      lineup[lineup.length - 1] = player.playerId;
    }
  }

  private guessZone(event: CourtEvent, index: number): CourtEvent['shotType'] {
    if (event.type.startsWith('three')) return 'threePoint';
    return variation(index, 8) < 0.6 ? 'close' : 'midRange';
  }

  private name(playerId: string | null): string {
    return (playerId && this.rosterById.get(playerId)?.shortName) || '—';
  }

  private teamLabel(side: CourtSide | null): string {
    return side === 'away' ? 'los visitantes' : 'los locales';
  }
}

function other(side: CourtSide): CourtSide {
  return side === 'home' ? 'away' : 'home';
}

/** Un punto del vuelo del balón en el instante `t` (0-1) de la jugada. */
export function ballAt(flight: BallFlight, t: number): BallPoint {
  const { path, arcs } = flight;
  if (path.length === 0) {
    return { ...CENTER, z: 1 };
  }
  if (path.length === 1) {
    return path[0] as BallPoint;
  }
  const segments = path.length - 1;
  const scaled = Math.min(0.9999, Math.max(0, t)) * segments;
  const segment = Math.floor(scaled);
  const local = scaled - segment;
  const from = path[segment] as BallPoint;
  const to = path[segment + 1] as BallPoint;
  const arc = arcs[segment] ?? 0;
  return {
    x: from.x + (to.x - from.x) * local,
    y: from.y + (to.y - from.y) * local,
    z: from.z + (to.z - from.z) * local + Math.sin(local * Math.PI) * arc
  };
}

// --- Equipaciones y dorsales -------------------------------------------------

export interface Kit {
  /** Camiseta. */
  shirt: string;
  /** Dorsal, legible sobre la camiseta. */
  number: string;
}

/** Equipaciones posibles: cada club lleva siempre la misma. */
export const KITS: readonly Kit[] = [
  { shirt: '#f97316', number: '#111827' },
  { shirt: '#2563eb', number: '#ffffff' },
  { shirt: '#16a34a', number: '#ffffff' },
  { shirt: '#dc2626', number: '#ffffff' },
  { shirt: '#facc15', number: '#1f2937' },
  { shirt: '#7c3aed', number: '#ffffff' },
  { shirt: '#0f766e', number: '#ffffff' },
  { shirt: '#be185d', number: '#ffffff' },
  { shirt: '#1e3a8a', number: '#fde68a' },
  { shirt: '#6b7280', number: '#ffffff' }
];

/** Camiseta blanca de visitante, para cuando las dos coinciden. */
export const AWAY_KIT: Kit = { shirt: '#f1f5f9', number: '#0f172a' };

function hashOf(text: string): number {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/** Las equipaciones de un partido: si chocan, el visitante se viste de blanco. */
export function matchKits(homeTeamId: string, awayTeamId: string): Record<CourtSide, Kit> {
  const home = KITS[hashOf(homeTeamId) % KITS.length] as Kit;
  const away = KITS[hashOf(awayTeamId) % KITS.length] as Kit;
  return { home, away: away === home ? AWAY_KIT : away };
}

/**
 * Dorsales de una plantilla: cada jugador lleva siempre el mismo —sale de su
 * identificador— y no se repiten dentro del equipo.
 */
export function shirtNumbers(playerIds: readonly string[]): Map<string, number> {
  const numbers = new Map<string, number>();
  const taken = new Set<number>();
  for (const playerId of [...playerIds].sort()) {
    let number = hashOf(playerId) % 56;
    while (taken.has(number)) {
      number = (number + 1) % 100;
    }
    taken.add(number);
    numbers.set(playerId, number);
  }
  return numbers;
}

/** «Juan Pérez» → «J. Pérez». */
export function shortPlayerName(fullName: string): string {
  const [first, ...rest] = fullName.trim().split(/\s+/);
  if (!first || rest.length === 0) return fullName;
  return `${first.charAt(0)}. ${rest.join(' ')}`;
}
