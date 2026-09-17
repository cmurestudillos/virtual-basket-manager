<script setup lang="ts">
/**
 * El panel: rótulo añil arriba y cuerpo de papel claro. Envuelve casi todo
 * —tablas, fichas, formularios, las actas del partido— y es lo que más se ve de
 * la piel de IBM.
 *
 * Va sobre el marco oscuro o sobre el fondo; dentro, todo es papel (`tv-paper`)
 * con letra `tv-ink`. Esquinas rectas y sin sombra.
 *
 * El rótulo lleva el título centrado en mayúsculas, `hint` a la izquierda (un
 * contador: «17 / 17») y `actions` a la derecha. Si hace falta otro rótulo
 * —columnas, filtros, botones de cuarto—, el hueco `header` lo sustituye entero.
 *
 * `scroll` lo convierte en un panel con desplazamiento propio, que es como se
 * comportan las tablas largas: la ventana del juego no se desplaza nunca.
 */

withDefaults(
  defineProps<{
    title?: string;
    /** Dato corto a la izquierda del rótulo: un contador, una fecha. */
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
  <section class="flex min-w-0 flex-col" :class="scroll ? 'overflow-hidden' : 'shrink-0'">
    <header
      v-if="$slots.header"
      class="flex items-center justify-center gap-3 bg-linear-to-r from-tv-head-from to-tv-head-to px-4 py-2 text-sm font-bold uppercase tracking-wide text-white"
    >
      <slot name="header" />
    </header>
    <header
      v-else-if="title || hint || $slots.actions"
      class="grid grid-cols-[1fr_auto_1fr] items-center gap-3 bg-linear-to-r from-tv-head-from to-tv-head-to px-4 py-2 text-white"
    >
      <span class="figure truncate text-xs font-semibold text-white/75">{{ hint }}</span>
      <h2 class="text-center text-sm font-bold uppercase tracking-wide">{{ title }}</h2>
      <div class="flex items-center justify-end gap-2">
        <slot name="actions" />
      </div>
    </header>

    <div
      class="flex-1 bg-tv-paper text-tv-ink"
      :class="[scroll ? 'overflow-auto' : '', flush ? '' : 'p-3']"
    >
      <slot />
    </div>
  </section>
</template>
