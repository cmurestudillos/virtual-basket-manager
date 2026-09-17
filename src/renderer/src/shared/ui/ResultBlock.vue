<script setup lang="ts">
import { computed } from 'vue';

/**
 * Un resultado en un bloque cuadrado: «V» en verde o «D» en granate, como los
 * últimos partidos de IBM (130241). Lo que se lee de un vistazo en una racha, en
 * el día del calendario o en la ficha de un club.
 *
 * El marcador es opcional y va al lado (`side`, el de una fila de partidos) o
 * debajo (`below`, el de una casilla estrecha), en el orden que le dé quien lo
 * usa: casa-fuera o propio-rival, lo que diga la fila. Para el lector de
 * pantalla dice la palabra entera: «Victoria 82-71».
 *
 * El bloque lleva su color y letra blanca, así que va sobre papel o sobre el
 * marco; el marcador hereda el color de la letra de alrededor.
 */

const props = withDefaults(
  defineProps<{
    won: boolean;
    /** Los dos tanteos, ya en el orden en que se leen. */
    score?: readonly [number, number] | null;
    size?: 'sm' | 'md';
    placement?: 'side' | 'below';
  }>(),
  { score: null, size: 'md', placement: 'side' }
);

const scoreText = computed(() => (props.score ? `${props.score[0]}-${props.score[1]}` : ''));
const spoken = computed(() =>
  [props.won ? 'Victoria' : 'Derrota', scoreText.value].filter(Boolean).join(' ')
);
</script>

<template>
  <span
    class="inline-flex shrink-0 items-center"
    :class="placement === 'below' ? 'flex-col gap-0.5' : size === 'sm' ? 'gap-1.5' : 'gap-2'"
  >
    <span class="sr-only">{{ spoken }}</span>
    <span
      aria-hidden="true"
      class="flex items-center justify-center font-bold text-white"
      :class="[
        won ? 'bg-tv-green' : 'bg-tv-red-deep',
        size === 'sm' ? 'h-6 w-6 text-xs' : 'h-10 w-10 text-lg'
      ]"
    >
      {{ won ? 'V' : 'D' }}
    </span>
    <span
      v-if="score"
      aria-hidden="true"
      class="figure whitespace-nowrap"
      :class="size === 'sm' ? 'text-xs' : 'text-sm'"
    >
      {{ score[0] }} - {{ score[1] }}
    </span>
  </span>
</template>
