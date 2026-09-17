<script setup lang="ts">
/**
 * El encabezado de un apartado dentro de un panel: el subrótulo de IBM, la
 * misma barra añil del panel pero más estrecha («OBJETIVO», «EN PISTA»).
 *
 * Es el patrón más repetido del juego —treinta y una veces escrito a mano— y
 * el que marca la diferencia entre «esto es un dato» y «esto es un apartado».
 * Va sobre papel; la barra ya trae su color.
 */

withDefaults(defineProps<{ hint?: string; size?: 'sm' | 'xs' }>(), { hint: '', size: 'sm' });
</script>

<template>
  <h2
    class="flex items-baseline justify-center gap-2 bg-tv-800 px-3 text-center font-bold uppercase tracking-wide text-white"
    :class="size === 'xs' ? 'py-0.5 text-xs' : 'py-1 text-sm'"
  >
    <slot />
    <span v-if="hint" class="text-xs font-normal normal-case tracking-normal text-white/70">
      {{ hint }}
    </span>
  </h2>
</template>
