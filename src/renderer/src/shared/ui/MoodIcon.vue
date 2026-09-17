<script setup lang="ts">
import { computed } from 'vue';
import { MORALE_LEVEL_LABELS, moraleLevel, type MoraleLevel } from '@shared/domain/morale';

/**
 * El ánimo en un icono: un círculo de color con una flecha que dice hacia dónde
 * va. Cinco niveles, los mismos cortes que la palabra de `moraleLabel`
 * —Eufórico, Contento, Normal, Descontento, Enfadado—, con los colores medidos
 * en IBM: verde, verde claro, amarillo, salmón y rojo.
 *
 * La flecha gira con el ánimo —arriba, en diagonal, de lado, en diagonal hacia
 * abajo y abajo— para que no dependa sólo del color. El dibujo es propio.
 *
 * Se le pasa el valor 0-100 (`value`) o el nivel ya calculado (`level`). Con
 * `labelled` lleva la palabra al lado. Se lee sobre papel y sobre el marco.
 */

const props = withDefaults(
  defineProps<{
    value?: number | null;
    level?: MoraleLevel | null;
    labelled?: boolean;
    size?: number;
  }>(),
  { value: null, level: null, labelled: false, size: 20 }
);

const current = computed<MoraleLevel>(() => props.level ?? moraleLevel(props.value ?? 70));

const FILL: Record<MoraleLevel, string> = {
  great: 'fill-tv-mood-great',
  good: 'fill-tv-mood-good',
  normal: 'fill-tv-mood-normal',
  low: 'fill-tv-mood-low',
  bad: 'fill-tv-mood-bad'
};

/** Hacia dónde apunta la flecha, en grados desde «arriba». */
const ROTATION: Record<MoraleLevel, number> = {
  great: 0,
  good: 45,
  normal: 90,
  low: 135,
  bad: 180
};

const label = computed(() => MORALE_LEVEL_LABELS[current.value]);
</script>

<template>
  <span class="inline-flex items-center gap-1.5">
    <svg
      :width="size"
      :height="size"
      viewBox="0 0 24 24"
      role="img"
      :aria-label="`Ánimo: ${label}`"
      class="shrink-0"
    >
      <title>{{ label }}</title>
      <circle cx="12" cy="12" r="11" :class="FILL[current]" />
      <path
        d="M7 14 L12 9 L17 14"
        fill="none"
        stroke="white"
        stroke-width="2.6"
        stroke-linecap="square"
        :transform="`rotate(${ROTATION[current]} 12 12)`"
      />
    </svg>
    <span v-if="labelled" class="text-sm">{{ label }}</span>
  </span>
</template>
