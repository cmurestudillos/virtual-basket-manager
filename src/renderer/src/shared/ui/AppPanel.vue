<script setup lang="ts">
/**
 * La caja con borde que envuelve casi todo: tablas, fichas, formularios.
 *
 * `scroll` la convierte en un panel con desplazamiento propio, que es como se
 * comportan las tablas largas: la ventana del juego no se desplaza nunca.
 */

withDefaults(
  defineProps<{
    title?: string;
    /** Nota corta a la derecha del título: un contador, una fecha. */
    hint?: string;
    scroll?: boolean;
    /** Sin relleno: para cuando dentro va una tabla, que ya trae el suyo. */
    flush?: boolean;
  }>(),
  { title: '', hint: '', scroll: false, flush: false }
);
</script>

<template>
  <!--
    `overflow-hidden` sólo cuando el panel tiene desplazamiento propio: si no,
    dentro de una columna flexible el navegador lo aplasta hasta dejar sólo la
    cabecera. Un panel que se ajusta a su contenido no debe encogerse nunca.
  -->
  <section
    class="flex flex-col rounded border border-court-700"
    :class="scroll ? 'overflow-hidden' : 'shrink-0'"
  >
    <header
      v-if="title || $slots.actions"
      class="flex items-center gap-3 border-b border-court-700 bg-court-900 px-4 py-2"
    >
      <h2 class="text-sm text-court-300">{{ title }}</h2>
      <span v-if="hint" class="text-xs text-court-600">{{ hint }}</span>
      <div v-if="$slots.actions" class="ml-auto flex items-center gap-2">
        <slot name="actions" />
      </div>
    </header>

    <div :class="[scroll ? 'flex-1 overflow-auto' : '', flush ? '' : 'p-4']">
      <slot />
    </div>
  </section>
</template>
