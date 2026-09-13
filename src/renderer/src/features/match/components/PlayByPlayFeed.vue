<script setup lang="ts">
/**
 * La retransmisión escrita: la última jugada arriba, como en un directo.
 *
 * La barra de la izquierda dice de quién es cada jugada, y sólo la tuya va en
 * naranja: en un partido de quinientas líneas es lo que permite seguir a tu
 * equipo sin leer los nombres.
 */
import { computed, ref } from 'vue';
import {
  formatGameClock,
  isHighlight,
  type PlayLine,
  type PlaySide
} from '@shared/domain/play-by-play';
import { AppEmpty, AppPanel, AppSegmented } from '@renderer/shared/ui';
import { TONE_FILL, TONE_TEXT } from '@renderer/shared/ui/tones';

const props = defineProps<{
  lines: readonly PlayLine[];
  managedSide: PlaySide | null;
}>();

const filter = ref('all');
const FILTERS = [
  { id: 'all', label: 'Todo' },
  { id: 'highlights', label: 'Canastas' }
] as const;

const shown = computed(() => {
  const lines = filter.value === 'all' ? props.lines : props.lines.filter(isHighlight);
  return [...lines].reverse();
});

function markerClass(line: PlayLine): string {
  if (line.side === null) return 'bg-transparent';
  return line.side === props.managedSide ? TONE_FILL.accent : TONE_FILL.neutral;
}

function textClass(line: PlayLine): string {
  // El naranja marca lo tuyo: el parcial del rival se destaca, pero no en naranja.
  if (line.kind === 'run') {
    return `${line.side === props.managedSide ? TONE_TEXT.accent : 'text-court-100'} font-semibold`;
  }
  if (line.kind === 'score') return 'text-court-100';
  return TONE_TEXT.neutral;
}
</script>

<template>
  <AppPanel title="Retransmisión" :hint="`${lines.length} jugadas`" flush>
    <template #actions>
      <AppSegmented v-model="filter" :options="FILTERS" />
    </template>

    <AppEmpty v-if="shown.length === 0" class="p-4">
      Todavía no ha pasado nada en la pista.
    </AppEmpty>

    <ol v-else class="max-h-96 overflow-y-auto text-sm" aria-live="polite">
      <template v-for="(line, index) in shown" :key="`${shown.length - index}`">
        <li
          v-if="line.kind === 'period'"
          class="bg-court-900 px-4 py-1.5 text-center text-xs uppercase tracking-wide text-court-300"
        >
          {{ line.text }}
        </li>
        <li v-else class="flex items-stretch gap-3 px-4 py-1">
          <span class="w-11 shrink-0 text-court-600 tabular-nums">
            {{ formatGameClock(line.clockSeconds) }}
          </span>
          <span class="w-1 shrink-0 rounded" :class="markerClass(line)" />
          <span class="flex-1" :class="textClass(line)">{{ line.text }}</span>
          <span v-if="line.points > 0" class="shrink-0 font-semibold tabular-nums text-court-100">
            {{ line.homeScore }}-{{ line.awayScore }}
          </span>
        </li>
      </template>
    </ol>
  </AppPanel>
</template>
