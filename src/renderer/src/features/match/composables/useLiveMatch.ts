import { computed, onUnmounted, ref, type Ref } from 'vue';
import type { LiveBenchPlayer, LiveTick } from '@shared/contracts/match.contract';
import type { PlayLine } from '@shared/domain/play-by-play';
import { PLAYBACK_RATE, type PlaybackSpeed } from './usePlayback';

/**
 * El partido en vivo.
 *
 * A diferencia de la retransmisión diferida —donde el cuarto ya estaba jugado y
 * esto sólo destapaba jugadas— aquí **nada está decidido todavía**: la pantalla
 * pide una posesión, la reproduce con su reloj y pide la siguiente. Entre una y
 * otra caben las órdenes del banquillo, y por eso no se pide con antelación: si
 * hubiera posesiones jugadas por delante, el cambio que ordenases llegaría
 * tarde y dirigir dejaría de significar nada.
 *
 * El precio es una llamada por posesión —unas ciento cuarenta por partido— que
 * a través del puente de Electron no se nota.
 */

const TICK_MS = 100;

export interface LiveMatch {
  /** Corre el reloj: el partido está en juego y sin pausar. */
  running: Ref<boolean>;
  /** Hay un partido en vivo empezado (aunque esté pausado). */
  active: Ref<boolean>;
  paused: Ref<boolean>;
  period: Ref<number>;
  /** Reloj del cuarto, en segundos. Baja según la velocidad elegida. */
  clockSeconds: Ref<number>;
  homeScore: Ref<number>;
  awayScore: Ref<number>;
  lines: Ref<PlayLine[]>;
  bench: Ref<LiveBenchPlayer[]>;
  timeoutsLeft: Ref<number>;
  rivalTimeoutsLeft: Ref<number>;
  autoRotation: Ref<boolean>;
  /** El cuarto ha terminado y espera a que el entrenador siga. */
  periodEnded: Ref<boolean>;
  finished: Ref<boolean>;
  /** Lo último que el banquillo no ha podido hacer, para decirlo en pantalla. */
  lastRefusal: Ref<string | null>;
  onCourt: Ref<LiveBenchPlayer[]>;
  benched: Ref<LiveBenchPlayer[]>;

  /** Arranca (o reanuda) el partido en vivo. */
  start: (gameId: string) => void;
  pause: () => void;
  resume: () => void;
  /** Juega lo que queda del cuarto de golpe, sin reloj. */
  skipPeriod: () => Promise<void>;
  substitute: (outgoingId: string, incomingId: string) => Promise<boolean>;
  callTimeout: () => Promise<boolean>;
  setTactics: (patch: Record<string, unknown>) => Promise<boolean>;
  setAutoRotation: (enabled: boolean) => Promise<boolean>;
  stop: () => void;
}

export function useLiveMatch(
  speed: Ref<PlaybackSpeed>,
  onFinished: () => void,
  onPeriodEnded: () => void
): LiveMatch {
  const running = ref(false);
  const active = ref(false);
  const paused = ref(false);
  const period = ref(1);
  const clockSeconds = ref(0);
  const homeScore = ref(0);
  const awayScore = ref(0);
  const lines = ref<PlayLine[]>([]);
  const bench = ref<LiveBenchPlayer[]>([]);
  const timeoutsLeft = ref(0);
  const rivalTimeoutsLeft = ref(0);
  const autoRotation = ref(true);
  const periodEnded = ref(false);
  const finished = ref(false);
  const lastRefusal = ref<string | null>(null);

  const onCourt = computed(() => bench.value.filter((player) => player.onCourt));
  const benched = computed(() => bench.value.filter((player) => !player.onCourt));

  let gameId = '';
  let timer: ReturnType<typeof setInterval> | null = null;
  /** Reloj al que llega la posesión que se está reproduciendo ahora mismo. */
  let target = 0;
  /** Hay una posesión pedida y sin contestar: el reloj espera, no pide otra. */
  let waiting = false;

  function stopTimer(): void {
    if (timer !== null) {
      clearInterval(timer);
      timer = null;
    }
    running.value = false;
  }

  /** Mete en pantalla lo que ha dejado una posesión. */
  function absorb(tick: LiveTick): void {
    period.value = tick.period;
    homeScore.value = tick.homeScore;
    awayScore.value = tick.awayScore;
    if (tick.lines.length > 0) {
      lines.value = [...lines.value, ...tick.lines];
    }
    if (tick.bench) {
      bench.value = tick.bench;
    }
    timeoutsLeft.value = tick.timeoutsLeft;
    rivalTimeoutsLeft.value = tick.rivalTimeoutsLeft;
    autoRotation.value = tick.autoRotation;
    target = tick.clockSeconds;
  }

  /** Pide una posesión y la deja lista para reproducirse. */
  async function requestPossession(): Promise<void> {
    if (waiting || finished.value || periodEnded.value) {
      return;
    }
    waiting = true;
    try {
      const tick = await window.api.match.advancePossession(gameId);
      absorb(tick);

      if (tick.finished) {
        clockSeconds.value = 0;
        finished.value = true;
        periodEnded.value = true;
        stopTimer();
        onFinished();
        return;
      }
      if (tick.periodEnded) {
        clockSeconds.value = 0;
        periodEnded.value = true;
        stopTimer();
        onPeriodEnded();
      }
    } finally {
      waiting = false;
    }
  }

  function tick(): void {
    if (waiting) {
      return;
    }
    const rate = PLAYBACK_RATE[speed.value];
    clockSeconds.value = Math.max(target, clockSeconds.value - (rate * TICK_MS) / 1000);

    // Alcanzada la posesión que se estaba viendo, toca jugar la siguiente.
    if (clockSeconds.value <= target) {
      void requestPossession();
    }
  }

  function startTimer(): void {
    stopTimer();
    running.value = true;
    paused.value = false;
    timer = setInterval(tick, TICK_MS);
  }

  function start(id: string): void {
    gameId = id;
    active.value = true;
    finished.value = false;
    periodEnded.value = false;
    // Al empezar un cuarto nuevo el reloj arranca entero; la primera posesión
    // que llegue pondrá el objetivo.
    target = clockSeconds.value;
    startTimer();
  }

  function pause(): void {
    if (!running.value) {
      return;
    }
    stopTimer();
    paused.value = true;
  }

  function resume(): void {
    if (finished.value || periodEnded.value) {
      return;
    }
    startTimer();
  }

  /** El resto del cuarto de una tacada: se juega sin reloj y se enseña entero. */
  async function skipPeriod(): Promise<void> {
    stopTimer();
    paused.value = false;

    for (let guard = 0; guard < 400; guard += 1) {
      if (finished.value || periodEnded.value) {
        break;
      }
      const result = await window.api.match.advancePossession(gameId);
      absorb(result);
      if (result.finished) {
        finished.value = true;
        periodEnded.value = true;
        clockSeconds.value = 0;
        onFinished();
        return;
      }
      if (result.periodEnded) {
        periodEnded.value = true;
        clockSeconds.value = 0;
        onPeriodEnded();
        return;
      }
    }
    clockSeconds.value = target;
  }

  /** Camino común de las órdenes: aplicar lo que vuelva y guardar el motivo del «no». */
  function applyOrder(result: {
    ok: boolean;
    reason: string | null;
    tick: LiveTick | null;
  }): boolean {
    lastRefusal.value = result.ok ? null : result.reason;
    if (result.tick) {
      // La orden no mueve el reloj: se respeta el que va corriendo en pantalla.
      const clock = clockSeconds.value;
      absorb(result.tick);
      target = Math.min(target, clock);
      clockSeconds.value = clock;
    }
    return result.ok;
  }

  async function substitute(outgoingId: string, incomingId: string): Promise<boolean> {
    return applyOrder(await window.api.match.substitute(gameId, outgoingId, incomingId));
  }

  async function callTimeout(): Promise<boolean> {
    return applyOrder(await window.api.match.callTimeout(gameId));
  }

  async function setTactics(patch: Record<string, unknown>): Promise<boolean> {
    return applyOrder(await window.api.match.setLiveTactics(gameId, patch));
  }

  async function setAutoRotation(enabled: boolean): Promise<boolean> {
    return applyOrder(await window.api.match.setAutoRotation(gameId, enabled));
  }

  function stop(): void {
    stopTimer();
    active.value = false;
  }

  onUnmounted(stopTimer);

  return {
    running,
    active,
    paused,
    period,
    clockSeconds,
    homeScore,
    awayScore,
    lines,
    bench,
    timeoutsLeft,
    rivalTimeoutsLeft,
    autoRotation,
    periodEnded,
    finished,
    lastRefusal,
    onCourt,
    benched,
    start,
    pause,
    resume,
    skipPeriod,
    substitute,
    callTimeout,
    setTactics,
    setAutoRotation,
    stop
  };
}
