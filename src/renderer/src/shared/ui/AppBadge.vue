<script setup lang="ts">
import { TONE_CHIP, type Tone } from './tones';

/**
 * La etiqueta pequeña: zona de la tabla, estado de una ficha, categoría de un
 * aviso. Va sobre papel.
 *
 * Rellena, como las de IBM, y pequeña: letra de 12 px en negrita y un relleno
 * mínimo, para que en una tabla de doce filas acompañe al dato sin taparlo. Las
 * esquinas, casi rectas, como el chip de posición.
 */

withDefaults(defineProps<{ tone?: Tone }>(), { tone: 'neutral' });
</script>

<template>
  <span
    class="inline-block rounded-[3px] px-1.5 py-px text-xs font-bold leading-4"
    :class="TONE_CHIP[tone]"
  >
    <slot />
  </span>
</template>
