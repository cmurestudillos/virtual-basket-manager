<script setup lang="ts">
/**
 * El encabezado de sección: mayúsculas pequeñas y espaciadas.
 *
 * Es el patrón más repetido del juego —treinta y una veces escrito a mano— y
 * el que marca la diferencia entre «esto es un dato» y «esto es un apartado».
 */

withDefaults(defineProps<{ hint?: string; size?: 'sm' | 'xs' }>(), { hint: '', size: 'sm' });
</script>

<template>
  <h2 class="uppercase tracking-wide text-court-300" :class="size === 'xs' ? 'text-xs' : 'text-sm'">
    <slot />
    <span v-if="hint" class="ml-2 normal-case tracking-normal text-court-600">{{ hint }}</span>
  </h2>
</template>
