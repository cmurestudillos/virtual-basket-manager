<script setup lang="ts">
/**
 * El «+» del rótulo de un panel del inicio, como IBM (125858): lleva a la
 * pantalla completa de lo que el panel sólo resume. Va sobre el rótulo, así que
 * es blanco; el `label` es lo que oye un lector de pantalla y lo que sale al
 * pasar por encima.
 */
import type { RouteLocationRaw } from 'vue-router';

defineProps<{ to: RouteLocationRaw; label: string }>();
</script>

<template>
  <RouterLink
    :to="to"
    :aria-label="label"
    :title="label"
    class="flex h-6 w-6 items-center justify-center text-white transition-colors hover:text-tv-cyan"
  >
    <svg viewBox="0 0 24 24" class="h-4 w-4" aria-hidden="true">
      <path d="M12 3 V21 M3 12 H21" stroke="currentColor" stroke-width="3.5" fill="none" />
    </svg>
  </RouterLink>
</template>
