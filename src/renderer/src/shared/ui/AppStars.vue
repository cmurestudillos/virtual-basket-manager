<script setup lang="ts">
import { computed } from 'vue';

/**
 * Categoría en estrellas: el pabellón, la reputación del club, el potencial,
 * el nivel de la cantera.
 *
 * Un número del 1 al 100 dice cuánto; cinco estrellas dicen **de qué clase**.
 * Para lo que se compara —«¿me llega el pabellón para la Euroliga?»— la clase
 * se lee antes que la cifra, y por eso conviven las dos.
 *
 * Como IBM: llenas en ámbar y vacías en petróleo, dentro de su caja negra, que
 * es lo que las deja leer igual sobre papel que sobre el marco. Admite medias
 * estrellas (se redondea a la media más cercana). Sin caja (`boxed` a falso)
 * sólo van bien sobre fondo oscuro o en una fila de papel que ya las separe.
 */

const props = withDefaults(
  defineProps<{
    value: number;
    max?: number;
    label?: string;
    boxed?: boolean;
    /** Lado de cada estrella, en píxeles. */
    size?: number;
  }>(),
  { max: 5, label: '', boxed: true, size: 14 }
);

/** En medias estrellas: 2,4 → 2,5. */
const rounded = computed(() => Math.max(0, Math.min(props.max, Math.round(props.value * 2) / 2)));

function fill(star: number): 'full' | 'half' | 'empty' {
  if (rounded.value >= star) return 'full';
  if (rounded.value >= star - 0.5) return 'half';
  return 'empty';
}

const STAR = 'M12 1.5l3.1 6.6 7.2.9-5.3 5 1.4 7.1L12 17.6l-6.4 3.5 1.4-7.1-5.3-5 7.2-.9z';
const spoken = computed(() => String(rounded.value).replace('.', ','));
</script>

<template>
  <span
    role="img"
    class="inline-flex items-center gap-0.5"
    :class="boxed ? 'bg-tv-star-box px-1.5 py-1' : ''"
    :aria-label="`${label || 'Categoría'}: ${spoken} de ${max} estrellas`"
  >
    <svg
      v-for="star in max"
      :key="star"
      viewBox="0 0 24 24"
      :width="size"
      :height="size"
      aria-hidden="true"
    >
      <path :d="STAR" class="fill-tv-star-off" />
      <path
        v-if="fill(star) !== 'empty'"
        :d="STAR"
        class="fill-tv-amber"
        :style="fill(star) === 'half' ? { clipPath: 'inset(0 50% 0 0)' } : undefined"
      />
    </svg>
  </span>
</template>
