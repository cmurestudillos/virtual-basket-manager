<script setup lang="ts">
/**
 * La caja de la retransmisión: rótulo añil arriba y tabla clara debajo.
 *
 * Es la pieza que más se repite en las pantallas del partido —actas, comparativa,
 * comentarios, banquillo— y la que les da el aire de retransmisión de tele.
 * Vive en la feature y no en el kit porque sólo la usan el partido y su jornada.
 */
withDefaults(defineProps<{ title?: string; flush?: boolean }>(), {
  title: undefined,
  flush: false
});
</script>

<template>
  <section class="flex min-w-0 flex-col overflow-hidden shadow-lg shadow-black/40">
    <header
      v-if="title || $slots.header"
      class="flex items-center justify-center gap-3 bg-tv-800 px-4 py-2 text-sm font-semibold uppercase tracking-wide text-white"
    >
      <slot name="header">{{ title }}</slot>
    </header>
    <div class="flex-1 bg-tv-paper text-tv-ink" :class="flush ? '' : 'p-3'">
      <slot />
    </div>
  </section>
</template>
