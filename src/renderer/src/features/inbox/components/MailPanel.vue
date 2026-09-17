<script setup lang="ts">
/**
 * El panel del correo: el de siempre, pero con el rótulo **azul**, que es la
 * única excepción al añil de IBM (131054). Lo usan la bandeja y el panel de
 * correo del inicio, para que el correo se reconozca esté donde esté.
 *
 * No es una variante de `AppPanel` a propósito: el azul es cosa del correo, no
 * del kit. El resto se comporta igual —`hint` a la izquierda, `actions` a la
 * derecha, `scroll` para el desplazamiento propio— y `envelope` pone el sobre
 * delante, como en la lista de correos.
 */

withDefaults(
  defineProps<{
    title: string;
    hint?: string;
    envelope?: boolean;
    scroll?: boolean;
    flush?: boolean;
  }>(),
  { hint: '', envelope: false, scroll: false, flush: false }
);
</script>

<template>
  <section class="flex min-w-0 flex-col" :class="scroll ? 'overflow-hidden' : 'shrink-0'">
    <header
      class="grid grid-cols-[1fr_auto_1fr] items-center gap-3 bg-linear-to-r from-tv-mail-from to-tv-mail-to px-4 py-2 text-white"
    >
      <span class="flex min-w-0 items-center gap-2">
        <svg v-if="envelope" viewBox="0 0 24 24" class="h-5 w-6 shrink-0" aria-hidden="true">
          <rect
            x="2"
            y="5"
            width="20"
            height="14"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          />
          <path d="M2 6 L12 13 L22 6" fill="none" stroke="currentColor" stroke-width="2" />
        </svg>
        <span class="figure truncate text-xs font-semibold text-white/80">{{ hint }}</span>
      </span>
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
