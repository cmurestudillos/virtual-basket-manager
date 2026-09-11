<script setup lang="ts">
import { TONE_CHIP, type Tone } from './tones';

/**
 * La etiqueta pequeña: puesto, zona de la tabla, estado de una ficha.
 *
 * Siempre con borde y nunca con fondo lleno: en una tabla con doce filas, doce
 * pastillas de color sólido tapan el dato en vez de acompañarlo.
 */

withDefaults(defineProps<{ tone?: Tone }>(), { tone: 'neutral' });
</script>

<template>
  <span class="rounded border px-1.5 py-0.5 text-xs" :class="TONE_CHIP[tone]">
    <slot />
  </span>
</template>
