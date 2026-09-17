<script setup lang="ts">
import { computed } from 'vue';
import { RATING_STROKE, bandForValue } from './tones';

/**
 * El aro: un 0-100 en forma de anillo, con el número dentro. Es el anillo de
 * media de IBM: aro grueso del color de la escala de cuatro tramos, interior
 * blanco y número oscuro, así que se lee igual sobre papel que sobre el marco.
 *
 * Hace algo que una barra no hace: ocupa poco, se lee de lejos y aguanta tres o
 * cuatro juntos en fila sin que la pantalla parezca un ecualizador. La barra
 * sigue siendo mejor cuando hay una lista larga de valores comparables.
 *
 * `unknown` es el aro de lo que no se ha ojeado: círculo negro con una «?». No
 * enseña un número que el club todavía no sabe.
 */

const props = withDefaults(
  defineProps<{
    value?: number | null;
    label?: string;
    /** 28 en una tabla, 72 en una tarjeta, 80 o más en la ficha. */
    size?: number;
    unknown?: boolean;
  }>(),
  { value: null, label: '', size: 72, unknown: false }
);

const RADIUS = 40;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

const hidden = computed(() => props.unknown || props.value === null);
const percent = computed(() => Math.max(0, Math.min(100, props.value ?? 0)));
const band = computed(() => bandForValue(percent.value));
const dash = computed(() => `${(percent.value / 100) * CIRCUMFERENCE} ${CIRCUMFERENCE}`);
const ariaLabel = computed(() =>
  hidden.value
    ? `${props.label || 'Valor'}: sin ojear`
    : `${props.label || 'Valor'}: ${Math.round(percent.value)} de 100`
);
</script>

<template>
  <figure class="m-0 inline-flex flex-col items-center gap-1">
    <svg
      :width="size"
      :height="size"
      viewBox="0 0 100 100"
      role="img"
      :aria-label="ariaLabel"
      class="max-w-full"
    >
      <template v-if="hidden">
        <circle cx="50" cy="50" r="48" class="fill-tv-star-box" />
        <text
          x="50"
          y="52"
          text-anchor="middle"
          dominant-baseline="central"
          fill="white"
          font-size="52"
          font-weight="700"
        >
          ?
        </text>
      </template>
      <template v-else>
        <circle cx="50" cy="50" r="48" fill="white" />
        <circle
          cx="50"
          cy="50"
          :r="RADIUS"
          fill="none"
          stroke-width="12"
          class="stroke-tv-cell-strong"
        />
        <!-- Arranca arriba y crece a la derecha, como cualquier medidor. -->
        <circle
          cx="50"
          cy="50"
          :r="RADIUS"
          fill="none"
          stroke="currentColor"
          stroke-width="12"
          :stroke-dasharray="dash"
          transform="rotate(-90 50 50)"
          :class="RATING_STROKE[band]"
        />
        <text
          x="50"
          y="52"
          text-anchor="middle"
          dominant-baseline="central"
          font-size="36"
          font-weight="700"
          class="figure fill-tv-ink"
        >
          {{ Math.round(percent) }}
        </text>
      </template>
    </svg>
    <figcaption v-if="label" class="text-xs font-bold uppercase tracking-wide">
      {{ label }}
    </figcaption>
  </figure>
</template>
