<script setup lang="ts">
import { computed } from 'vue';
import { TONE_FILL, TONE_TEXT, toneForLevel, type Tone } from './tones';

/**
 * Una barra de 0 a 100 con su número al lado: forma física, confianza del
 * consejo, moral, nivel de instalaciones.
 *
 * El tono sale del valor por defecto —más es mejor— porque así el jugador
 * aprende a leer el color una vez y le vale para todas las pantallas. Quien
 * necesite otra lectura lo pasa a mano.
 */

const props = withDefaults(
  defineProps<{ value: number; max?: number; tone?: Tone | null; label?: string }>(),
  { max: 100, tone: null, label: '' }
);

const percent = computed(() =>
  Math.max(0, Math.min(100, (props.value / (props.max || 100)) * 100))
);
const tone = computed(() => props.tone ?? toneForLevel(percent.value));
</script>

<template>
  <div class="flex items-center gap-2">
    <span v-if="label" class="text-xs text-court-300">{{ label }}</span>
    <div class="h-1.5 flex-1 overflow-hidden rounded-full bg-court-800">
      <div class="h-full rounded-full" :class="TONE_FILL[tone]" :style="{ width: `${percent}%` }" />
    </div>
    <span class="figure w-8 text-right text-xs" :class="TONE_TEXT[tone]">{{
      Math.round(value)
    }}</span>
  </div>
</template>
