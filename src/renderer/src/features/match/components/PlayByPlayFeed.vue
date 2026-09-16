<script setup lang="ts">
/**
 * La retransmisión escrita entera: la pestaña «Texto», con la última jugada
 * arriba como en un directo.
 *
 * La barra de la izquierda lleva el color de la camiseta de quien hace la
 * jugada: en un partido de quinientas líneas es lo que permite seguir a un
 * equipo sin leer los nombres. Lo tuyo va además en negrita.
 */
import { computed, ref } from 'vue';
import type { Kit } from '@shared/domain/court';
import {
  formatGameClock,
  isHighlight,
  type PlayLine,
  type PlaySide
} from '@shared/domain/play-by-play';
import BroadcastPanel from './BroadcastPanel.vue';

const props = defineProps<{
  lines: readonly PlayLine[];
  managedSide: PlaySide | null;
  kits: Record<PlaySide, Kit>;
}>();

const filter = ref<'all' | 'highlights'>('all');
const FILTERS = [
  { id: 'all', label: 'Todo' },
  { id: 'highlights', label: 'Canastas' }
] as const;

const shown = computed(() => {
  const lines = filter.value === 'all' ? props.lines : props.lines.filter(isHighlight);
  return [...lines].reverse();
});
</script>

<template>
  <BroadcastPanel flush>
    <template #header>
      <span class="flex w-full items-center justify-between">
        <span>Retransmisión · {{ lines.length }} jugadas</span>
        <span class="flex gap-1 normal-case">
          <button
            v-for="option in FILTERS"
            :key="option.id"
            type="button"
            class="px-3 py-0.5 text-xs font-semibold"
            :class="filter === option.id ? 'bg-tv-blue text-white' : 'bg-tv-700 text-white/75'"
            :aria-pressed="filter === option.id"
            @click="filter = option.id"
          >
            {{ option.label }}
          </button>
        </span>
      </span>
    </template>

    <p v-if="shown.length === 0" class="p-6 text-center text-sm text-tv-muted">
      Todavía no ha pasado nada en la pista.
    </p>
    <ol v-else class="max-h-[60vh] overflow-y-auto text-sm" aria-live="polite">
      <template v-for="(line, index) in shown" :key="`${shown.length - index}`">
        <li
          v-if="line.kind === 'period'"
          class="bg-tv-800 px-4 py-1.5 text-center text-xs font-semibold uppercase tracking-wide text-white"
        >
          {{ line.text }}
        </li>
        <li v-else class="flex items-stretch gap-3 border-t border-tv-cell px-4 py-1">
          <span class="figure w-11 shrink-0 text-tv-muted">
            {{ formatGameClock(line.clockSeconds) }}
          </span>
          <span
            class="w-1 shrink-0 rounded"
            :style="{ backgroundColor: line.side ? kits[line.side].shirt : 'transparent' }"
          />
          <span
            class="flex-1"
            :class="[
              line.side === managedSide && line.side !== null ? 'font-semibold' : '',
              line.kind === 'run' ? 'text-tv-green font-semibold' : ''
            ]"
          >
            {{ line.text }}
          </span>
          <span v-if="line.points > 0" class="figure shrink-0 font-semibold">
            {{ line.homeScore }}-{{ line.awayScore }}
          </span>
        </li>
      </template>
    </ol>
  </BroadcastPanel>
</template>
