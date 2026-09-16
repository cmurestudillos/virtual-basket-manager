import { onUnmounted, ref, shallowRef, type Ref } from 'vue';
import type { CourtEvent } from '@shared/contracts/match.contract';
import {
  ballAt,
  COURT_LENGTH,
  COURT_WIDTH,
  CourtDirector,
  type BallPoint,
  type CourtBeat,
  type CourtPoint,
  type CourtRosterPlayer,
  type CourtSide
} from '@shared/domain/court';
import { PLAYBACK_RATE, type PlaybackSpeed } from './usePlayback';

/**
 * La escena de la pista, en movimiento.
 *
 * El reloj de la retransmisión —o el del directo— dice cuántas jugadas se han
 * destapado; esto las va aplicando de una en una y anima el paso de la escena
 * anterior a la siguiente. Si la pantalla se queda atrás —velocidad rápida, un
 * salto al final del cuarto, abrir un partido ya jugado—, se ponen al día de
 * golpe las jugadas viejas y sólo se animan las últimas: la pista nunca cuenta
 * con retraso lo que el marcador ya ha cantado.
 *
 * Lo que expone es lo que dibujan la pista 2D y la 3D, así que las dos se ven
 * exactamente igual.
 */

export interface ScenePlayer extends CourtPoint {
  playerId: string;
  side: CourtSide;
  number: number;
  shortName: string;
  focus: boolean;
}

export interface CourtScene {
  players: Ref<ScenePlayer[]>;
  ball: Ref<BallPoint>;
  caption: Ref<string | null>;
  /** El último tiro que ha llegado al aro, para pintar el acierto o el fallo. */
  shotResult: Ref<'made' | 'missed' | null>;
  offense: Ref<CourtSide>;
  /** Periodo de la última jugada aplicada: la 3D lo usa para saber a qué aro mirar. */
  period: Ref<number>;
}

/** A partir de cuántas jugadas pendientes se pone al día sin animar. */
const MAX_ANIMATED_BACKLOG = 3;

function keyOf(roster: readonly CourtRosterPlayer[]): string {
  return roster.map((player) => player.playerId).join(',');
}

/** Las listas llegan nuevas en cada cuarto: se comparan por lo que dicen, no por identidad. */
function sameEvent(a: CourtEvent | undefined, b: CourtEvent | undefined): boolean {
  return (
    a?.type === b?.type &&
    a?.period === b?.period &&
    a?.clockSeconds === b?.clockSeconds &&
    a?.playerId === b?.playerId
  );
}

function ease(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
}

export function useCourtScene(
  events: Ref<readonly CourtEvent[]>,
  visibleCount: Ref<number>,
  roster: Ref<readonly CourtRosterPlayer[]>,
  regulationPeriods: Ref<number>,
  speed: Ref<PlaybackSpeed>
): CourtScene {
  const players = shallowRef<ScenePlayer[]>([]);
  const ball = shallowRef<BallPoint>({ x: COURT_LENGTH / 2, y: COURT_WIDTH / 2, z: 1 });
  const caption = ref<string | null>(null);
  const shotResult = ref<'made' | 'missed' | null>(null);
  const offense = ref<CourtSide>('home');
  const period = ref(1);

  let director: CourtDirector | null = null;
  let firstEvent: CourtEvent | undefined;
  /** La plantilla con la que se montó el director: si cambia de verdad, se vuelve a montar. */
  let rosterKey = '';
  let applied = 0;
  let positions: Record<string, CourtPoint> = {};
  let from: Record<string, CourtPoint> = {};
  let beat: CourtBeat | null = null;
  let beatStart = 0;
  let beatLength = 0;
  let frame: number | null = null;

  const rosterById = (): Map<string, CourtRosterPlayer> =>
    new Map(roster.value.map((player) => [player.playerId, player]));

  function reset(): void {
    director = new CourtDirector(roster.value, events.value, regulationPeriods.value);
    firstEvent = events.value[0];
    rosterKey = keyOf(roster.value);
    applied = 0;
    positions = {};
    from = {};
    beat = null;
    caption.value = null;
    shotResult.value = null;
  }

  /** Aplica la jugada siguiente; `animate` decide si se ve el paso o se salta. */
  function step(now: number, animate: boolean, backlog: number): void {
    if (!director) return;
    director.extend(events.value);
    const index = applied;
    const next = director.apply(index);
    applied += 1;
    period.value = events.value[index]?.period ?? period.value;

    // Quien entra en pista sin sitio previo aparece desde la banda.
    for (const [playerId, target] of Object.entries(next.targets)) {
      if (!positions[playerId]) {
        positions[playerId] = { x: target.x, y: -1 };
      }
    }
    from = { ...positions };
    for (const [playerId, target] of Object.entries(next.targets)) {
      positions[playerId] = target;
    }
    if (next.caption !== null || next.duration > 0) {
      caption.value = next.caption ?? caption.value;
    }
    offense.value = next.offense;

    beat = next;
    beatStart = now;
    // A velocidad normal la jugada dura lo que pide; a otra velocidad, en proporción.
    const rate = PLAYBACK_RATE.normal / PLAYBACK_RATE[speed.value];
    beatLength = animate ? (next.duration * 1000 * rate * 0.6) / Math.max(1, backlog) : 0;
  }

  function render(now: number): void {
    const current = beat;
    const t = current && beatLength > 0 ? Math.min(1, (now - beatStart) / beatLength) : 1;
    const eased = ease(t);
    const byId = rosterById();
    const onCourt = current ? [...current.lineups.home, ...current.lineups.away] : [];

    players.value = onCourt.flatMap((playerId) => {
      const player = byId.get(playerId);
      const target = positions[playerId];
      if (!player || !target) return [];
      const start = from[playerId] ?? target;
      return [
        {
          playerId,
          side: player.side,
          number: player.number,
          shortName: player.shortName,
          focus: current?.focusPlayerId === playerId,
          x: start.x + (target.x - start.x) * eased,
          y: start.y + (target.y - start.y) * eased
        }
      ];
    });
    if (current) {
      ball.value = ballAt(current.ball, t);
      shotResult.value = t >= 0.7 ? current.ball.result : null;
    }
  }

  function tick(now: number): void {
    frame = requestAnimationFrame(tick);

    const list = events.value;
    // Otra lista —otro partido, una repetición que vuelve atrás—: se empieza de cero.
    if (
      !director ||
      !sameEvent(list[0], firstEvent) ||
      visibleCount.value < applied ||
      keyOf(roster.value) !== rosterKey
    ) {
      reset();
    }
    const target = Math.min(visibleCount.value, list.length);
    const animating = beat !== null && beatLength > 0 && now - beatStart < beatLength;

    if (!animating && applied < target) {
      // Las viejas, de golpe; las últimas, animadas y más deprisa cuanto más atrás se va.
      while (target - applied > MAX_ANIMATED_BACKLOG) {
        step(now, false, 1);
      }
      step(now, true, target - applied + 1);
      // Las que no mueven nada (una asistencia ya dibujada) no gastan tiempo.
      while (beat && beatLength === 0 && applied < target) {
        step(now, true, target - applied + 1);
      }
    }
    render(now);
  }

  frame = requestAnimationFrame(tick);
  onUnmounted(() => {
    if (frame !== null) cancelAnimationFrame(frame);
  });

  return { players, ball, caption, shotResult, offense, period };
}
