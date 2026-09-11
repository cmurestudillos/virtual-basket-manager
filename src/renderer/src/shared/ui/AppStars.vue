<script setup lang="ts">
import { computed } from 'vue';

/**
 * Categoría en estrellas: el pabellón, la reputación del club, el nivel de la
 * cantera.
 *
 * Un número del 1 al 100 dice cuánto; cinco estrellas dicen **de qué clase**.
 * Para lo que se compara —«¿me llega el pabellón para la Euroliga?»— la clase
 * se lee antes que la cifra, y por eso conviven las dos.
 */

const props = withDefaults(defineProps<{ value: number; max?: number; label?: string }>(), {
  max: 5,
  label: ''
});

const filled = computed(() => Math.max(0, Math.min(props.max, Math.round(props.value))));
</script>

<template>
  <span
    class="inline-flex items-center gap-1"
    :aria-label="`${label || 'Categoría'}: ${filled} de ${max}`"
  >
    <span
      v-for="star in max"
      :key="star"
      aria-hidden="true"
      :class="star <= filled ? 'text-line-500' : 'text-court-700'"
    >
      ★
    </span>
  </span>
</template>
