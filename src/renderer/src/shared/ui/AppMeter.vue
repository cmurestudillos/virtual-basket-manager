<script setup lang="ts">
import { computed } from 'vue';
import { RATING_FILL, TONE_FILL, bandForValue, type Tone } from './tones';

/**
 * Una barra de 0 a 100 con su número al lado: forma física, confianza del
 * consejo, moral, nivel de instalaciones. Va sobre papel.
 *
 * El color sale del valor por defecto, con la escala de cuatro tramos de todo
 * el juego, porque así el jugador aprende a leer el color una vez y le vale
 * para todas las pantallas. Quien necesite otra lectura pasa un tono a mano.
 * El número va siempre en negro: el color ya lo lleva la barra.
 */

const props = withDefaults(
  defineProps<{ value: number; max?: number; tone?: Tone | null; label?: string }>(),
  { max: 100, tone: null, label: '' }
);

const percent = computed(() =>
  Math.max(0, Math.min(100, (props.value / (props.max || 100)) * 100))
);
const fill = computed(() =>
  props.tone ? TONE_FILL[props.tone] : RATING_FILL[bandForValue(percent.value)]
);
</script>

<template>
  <div class="flex items-center gap-2">
    <span v-if="label" class="w-24 shrink-0 truncate text-xs font-semibold uppercase">
      {{ label }}
    </span>
    <div class="h-2 flex-1 overflow-hidden bg-tv-cell-strong">
      <div class="h-full" :class="fill" :style="{ width: `${percent}%` }" />
    </div>
    <span class="figure w-8 text-right text-sm font-bold text-tv-ink">{{ Math.round(value) }}</span>
  </div>
</template>
