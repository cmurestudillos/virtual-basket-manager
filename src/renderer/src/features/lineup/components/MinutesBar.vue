<script setup lang="ts">
import { computed } from 'vue';

/**
 * Los minutos de un jugador en la barra segmentada de IBM: cinco tramos azules
 * sobre negro que se llenan de izquierda a derecha. En una columna de doce filas
 * se ve de un vistazo quién carga con el partido, cosa que una columna de cifras
 * no enseña; la cifra exacta va al lado, en el paso a paso que la cambia.
 *
 * Es sólo dibujo (`aria-hidden`): el número lo lee el lector en el control.
 */

const props = withDefaults(defineProps<{ minutes: number; max: number; segments?: number }>(), {
  segments: 5
});

/** Cuánto de cada tramo está lleno, de 0 a 100. */
const fills = computed(() => {
  const span = props.max / props.segments;
  return Array.from(
    { length: props.segments },
    (_, index) => Math.max(0, Math.min(1, (props.minutes - index * span) / span)) * 100
  );
});
</script>

<template>
  <span class="inline-flex w-24 items-center gap-[3px]" aria-hidden="true">
    <span v-for="(fill, index) in fills" :key="index" class="h-2 flex-1 bg-tv-slab">
      <span class="block h-full bg-tv-blue" :style="{ width: `${fill}%` }" />
    </span>
  </span>
</template>
