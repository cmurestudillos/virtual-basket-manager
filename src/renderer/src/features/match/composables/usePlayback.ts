import { computed, onUnmounted, ref, watch, type Ref } from 'vue';
import { visibleLineCount, type PlayLine } from '@shared/domain/play-by-play';

/**
 * El reloj de la retransmisión.
 *
 * El cuarto ya está jugado cuando llega a la pantalla —el resultado no depende
 * de si alguien lo mira—, así que esto no simula nada: hace correr un reloj de
 * partido y va destapando las jugadas cuyo segundo ya ha pasado. Por eso
 * saltar al final del cuarto es gratis y no cambia nada.
 */

export type PlaybackSpeed = 'slow' | 'normal' | 'fast';

/** Segundos de partido que pasan por cada segundo real. */
export const PLAYBACK_RATE: Record<PlaybackSpeed, number> = {
  slow: 10,
  normal: 25,
  fast: 60
};

const TICK_MS = 100;
const STORAGE_KEY = 'match.playbackSpeed';

function readSpeed(): PlaybackSpeed {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === 'slow' || stored === 'fast' ? stored : 'normal';
  } catch {
    return 'normal';
  }
}

/** Compartida entre partidos: quien la pone en rápida no quiere repetirlo cada cuarto. */
const speed = ref<PlaybackSpeed>(readSpeed());
watch(speed, (value) => {
  try {
    localStorage.setItem(STORAGE_KEY, value);
  } catch {
    // Sin almacenamiento se sigue jugando; sólo se olvida la preferencia.
  }
});

export interface Playback {
  speed: Ref<PlaybackSpeed>;
  /** Hay un cuarto corriendo. */
  running: Ref<boolean>;
  /** Cuarto que se está viendo, o `null` si no corre ninguno. */
  period: Ref<number | null>;
  /** Segundos restantes del cuarto en el reloj de la retransmisión. */
  clockSeconds: Ref<number>;
  /** Líneas ya vistas, contadas desde el principio del partido. */
  visibleCount: Ref<number>;
  /** Hace correr el cuarto `period` de estas líneas. */
  play: (lines: readonly PlayLine[], period: number) => void;
  /** Destapa lo que queda del cuarto de golpe. */
  skip: () => void;
}

export function usePlayback(onFinished: () => void): Playback {
  const running = ref(false);
  const period = ref<number | null>(null);
  const clockSeconds = ref(0);
  const lines = ref<readonly PlayLine[]>([]);
  const visibleCount = computed(() =>
    period.value === null
      ? lines.value.length
      : visibleLineCount(lines.value, period.value, clockSeconds.value)
  );

  let timer: ReturnType<typeof setInterval> | null = null;

  function stopTimer(): void {
    if (timer !== null) {
      clearInterval(timer);
      timer = null;
    }
  }

  function finish(): void {
    stopTimer();
    running.value = false;
    period.value = null;
    onFinished();
  }

  function play(all: readonly PlayLine[], playedPeriod: number): void {
    stopTimer();
    lines.value = all;
    const start = all.find((line) => line.period === playedPeriod);
    if (!start) {
      finish();
      return;
    }

    period.value = playedPeriod;
    // La primera línea del cuarto es su inicio, con el reloj entero.
    clockSeconds.value = start.clockSeconds;
    running.value = true;

    timer = setInterval(() => {
      clockSeconds.value = Math.max(
        0,
        clockSeconds.value - (PLAYBACK_RATE[speed.value] * TICK_MS) / 1000
      );
      if (clockSeconds.value <= 0) {
        finish();
      }
    }, TICK_MS);
  }

  function skip(): void {
    if (running.value) {
      finish();
    }
  }

  onUnmounted(stopTimer);

  return { speed, running, period, clockSeconds, visibleCount, play, skip };
}
