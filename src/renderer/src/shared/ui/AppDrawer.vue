<script setup lang="ts">
import { computed, ref } from 'vue';
import { useDialogFocus } from './useDialogFocus';

/**
 * El cajón lateral: un panel que se abre encima de la pantalla, pegado a la
 * derecha, sin taparla entera. Nació para los mandos del banquillo en el
 * partido —sustituciones y tácticas—, donde el marcador y los comentarios se
 * tienen que seguir viendo mientras se decide el cambio.
 *
 * Rótulo añil con su «×» y cuerpo de papel. Es un diálogo: el foco entra al
 * abrirlo y vuelve al cerrarlo, y Escape o pulsar fuera lo cierran. Se monta y
 * se desmonta con un `v-if` de quien lo usa.
 */

defineProps<{ title: string }>();
const emit = defineEmits<{ close: [] }>();

const panel = ref<HTMLElement | null>(null);
useDialogFocus(
  panel,
  computed(() => true),
  () => emit('close')
);
</script>

<template>
  <div class="fixed inset-0 z-40 flex justify-end bg-black/40" @click.self="emit('close')">
    <aside
      ref="panel"
      class="flex h-full w-[32rem] max-w-full flex-col bg-tv-paper text-tv-ink"
      role="dialog"
      aria-modal="true"
      :aria-label="title"
      tabindex="-1"
    >
      <header
        class="flex items-center justify-between bg-linear-to-r from-tv-head-from to-tv-head-to px-4 py-3 text-white"
      >
        <h2 class="text-sm font-bold uppercase tracking-wide">{{ title }}</h2>
        <button
          type="button"
          class="px-2 text-lg leading-none text-white/80 hover:text-white"
          aria-label="Cerrar"
          @click="emit('close')"
        >
          ×
        </button>
      </header>
      <div class="flex-1 overflow-y-auto p-4">
        <slot />
      </div>
    </aside>
  </div>
</template>
