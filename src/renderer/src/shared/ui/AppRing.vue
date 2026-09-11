<script setup lang="ts">
import { computed } from 'vue';
import { TONE_TEXT, toneForLevel, type Tone } from './tones';

/**
 * El aro: un 0-100 en forma de anillo, con el número dentro.
 *
 * Es lo que usan los managers de verdad para la confianza y las valoraciones, y
 * hace algo que una barra no hace: ocupa poco, se lee de lejos y aguanta tres o
 * cuatro juntos en fila sin que la pantalla parezca un ecualizador. La barra
 * sigue siendo mejor cuando hay una lista larga de valores comparables.
 */

const props = withDefaults(
  defineProps<{ value: number; label?: string; tone?: Tone | null; size?: number }>(),
  { label: '', tone: null, size: 72 }
);

const RADIUS = 42;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

const percent = computed(() => Math.max(0, Math.min(100, props.value)));
const tone = computed(() => props.tone ?? toneForLevel(percent.value));
const dash = computed(() => `${(percent.value / 100) * CIRCUMFERENCE} ${CIRCUMFERENCE}`);
</script>

<template>
  <figure class="m-0 flex flex-col items-center gap-1">
    <svg
      :width="size"
      :height="size"
      viewBox="0 0 100 100"
      role="img"
      :aria-label="`${label || 'Valor'}: ${Math.round(value)} de 100`"
      class="max-w-full"
    >
      <circle
        cx="50"
        cy="50"
        :r="RADIUS"
        fill="none"
        stroke="currentColor"
        stroke-width="8"
        class="text-court-800"
      />
      <!-- Arranca arriba y crece a la derecha, como cualquier medidor. -->
      <circle
        cx="50"
        cy="50"
        :r="RADIUS"
        fill="none"
        stroke="currentColor"
        stroke-width="8"
        stroke-linecap="round"
        :stroke-dasharray="dash"
        transform="rotate(-90 50 50)"
        :class="TONE_TEXT[tone]"
      />
      <text
        x="50"
        y="50"
        text-anchor="middle"
        dominant-baseline="central"
        fill="currentColor"
        font-size="30"
        font-weight="600"
        :class="TONE_TEXT[tone]"
      >
        {{ Math.round(value) }}
      </text>
    </svg>
    <figcaption v-if="label" class="text-xs uppercase tracking-wide text-court-300">
      {{ label }}
    </figcaption>
  </figure>
</template>
