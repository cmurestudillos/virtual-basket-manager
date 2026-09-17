<script setup lang="ts">
/**
 * Los comentarios del partido, en tarjetas: reloj, equipo y marcador a la
 * izquierda y la jugada a la derecha. Lo que cambia un partido se pinta de
 * color —verde un triple o un parcial, rojo una pérdida— para que se vea sin
 * leer, que es como se mira una retransmisión con el rabillo del ojo.
 *
 * Están **todas** las jugadas de lo que va de partido, con la última arriba y
 * un rótulo por cuarto, en una lista con scroll: se puede bajar a repasar cómo
 * fue el primer cuarto sin que el directo se pare. Los botones de la cabecera
 * llevan a cada cuarto y, si uno se ha ido lejos, «Última jugada» le devuelve
 * arriba. Mientras se lee más abajo, lo nuevo entra por arriba sin mover lo
 * que se está leyendo.
 */
import { computed, nextTick, ref } from 'vue';
import type { Kit } from '@shared/domain/court';
import { formatGameClock, periodName, type PlayLine } from '@shared/domain/play-by-play';
import { AppPanel } from '@renderer/shared/ui';

const props = withDefaults(
  defineProps<{
    lines: readonly PlayLine[];
    homeName: string;
    awayName: string;
    kits: { home: Kit; away: Kit };
    regulationPeriods?: number;
    /** Alto de la lista antes de que salga el scroll. */
    maxHeight?: string;
  }>(),
  { regulationPeriods: 4, maxHeight: '26rem' }
);

interface PeriodGroup {
  period: number;
  label: string;
  short: string;
  lines: { line: PlayLine; key: number }[];
}

/** Las jugadas por cuarto: el cuarto en juego arriba y, dentro, la última primero. */
const groups = computed<PeriodGroup[]>(() => {
  const byPeriod = new Map<number, PeriodGroup>();
  props.lines.forEach((line, index) => {
    if (line.kind === 'period') return;
    let group = byPeriod.get(line.period);
    if (!group) {
      const name = periodName(line.period, props.regulationPeriods);
      group = {
        period: line.period,
        label: `${name.charAt(0).toUpperCase()}${name.slice(1)}`,
        short: line.period > props.regulationPeriods ? 'PR' : `${line.period}º`,
        lines: []
      };
      byPeriod.set(line.period, group);
    }
    group.lines.push({ line, key: index });
  });
  return [...byPeriod.values()]
    .sort((a, b) => b.period - a.period)
    .map((group) => ({ ...group, lines: [...group.lines].reverse() }));
});

const total = computed(() => groups.value.reduce((sum, group) => sum + group.lines.length, 0));

const scroller = ref<HTMLElement | null>(null);
const awayFromTop = ref(false);

function onScroll(): void {
  awayFromTop.value = (scroller.value?.scrollTop ?? 0) > 40;
}

async function goTo(period: number | null): Promise<void> {
  await nextTick();
  const container = scroller.value;
  if (!container) return;
  if (period === null) {
    container.scrollTo({ top: 0, behavior: 'smooth' });
    return;
  }
  const target = container.querySelector<HTMLElement>(`[data-period="${period}"]`);
  if (target) {
    container.scrollTo({ top: target.offsetTop - container.offsetTop, behavior: 'smooth' });
  }
}

/** «Club Baloncesto Norte» → «NOR»: las tres letras de la palabra con más peso. */
function code(name: string): string {
  const words = name.split(/\s+/).filter((word) => word.length > 3);
  return (words.at(-1) ?? name).slice(0, 3).toUpperCase();
}

function tone(line: PlayLine): 'good' | 'bad' | 'plain' {
  if (line.kind === 'run' || (line.kind === 'score' && line.points >= 3)) return 'good';
  if (line.kind === 'turnover') return 'bad';
  return 'plain';
}
</script>

<template>
  <AppPanel flush>
    <template #header>
      <span class="flex w-full items-center justify-between gap-2">
        <span>Comentarios</span>
        <span class="flex items-center gap-1 normal-case" role="group" aria-label="Ir al cuarto">
          <button
            v-for="group in [...groups].reverse()"
            :key="group.period"
            type="button"
            class="bg-tv-700 px-2 py-0.5 text-xs font-semibold hover:bg-tv-600"
            :title="group.label"
            @click="goTo(group.period)"
          >
            {{ group.short }}
          </button>
          <button
            v-if="awayFromTop"
            type="button"
            class="ml-1 bg-tv-blue px-2 py-0.5 text-xs font-semibold hover:brightness-110"
            @click="goTo(null)"
          >
            Última jugada
          </button>
        </span>
      </span>
    </template>

    <div
      ref="scroller"
      class="relative overflow-y-auto"
      :style="{ maxHeight }"
      aria-live="polite"
      :aria-label="`Comentarios del partido, ${total} jugadas`"
      @scroll.passive="onScroll"
    >
      <p v-if="total === 0" class="p-4 text-center text-sm text-tv-muted">
        Todavía no ha pasado nada en la pista.
      </p>
      <section v-for="group in groups" :key="group.period" :data-period="group.period">
        <h3
          class="sticky top-0 z-10 bg-tv-800 px-3 py-1 text-center text-xs font-semibold uppercase tracking-wide text-white"
        >
          {{ group.label }} · {{ group.lines.length }} jugadas
        </h3>
        <ol class="flex flex-col gap-2 p-2">
          <li
            v-for="{ line, key } in group.lines"
            :key="key"
            class="grid grid-cols-[4.5rem_1fr] overflow-hidden text-xs shadow"
          >
            <span
              class="figure flex flex-col items-center justify-center bg-tv-900 py-1 font-bold leading-tight text-white [clip-path:polygon(0_0,85%_0,100%_50%,85%_100%,0_100%)]"
            >
              <span>{{ formatGameClock(line.clockSeconds) }}</span>
              <span v-if="line.side">{{ code(line.side === 'home' ? homeName : awayName) }}</span>
              <span class="text-tv-amber">{{ line.homeScore }} - {{ line.awayScore }}</span>
            </span>
            <span
              class="flex items-center gap-2 border-l-4 px-3 py-2"
              :class="{
                'bg-tv-green text-white': tone(line) === 'good',
                'bg-tv-red text-white': tone(line) === 'bad',
                'bg-white text-tv-ink': tone(line) === 'plain'
              }"
              :style="{ borderLeftColor: line.side ? kits[line.side].shirt : 'transparent' }"
            >
              {{ line.text }}
            </span>
          </li>
        </ol>
      </section>
    </div>
  </AppPanel>
</template>
