<script setup lang="ts">
/**
 * El cajón lateral de los mandos del banquillo: sustituciones y tácticas.
 *
 * No para el partido. En IBM estos botones abren una pantalla aparte; aquí se
 * abre encima, pegado a la derecha, para que el marcador y los comentarios se
 * sigan viendo mientras se decide el cambio.
 */
import { onMounted, onUnmounted } from 'vue';

defineProps<{ title: string }>();
const emit = defineEmits<{ close: [] }>();

function onKey(event: KeyboardEvent): void {
  if (event.key === 'Escape') emit('close');
}

onMounted(() => window.addEventListener('keydown', onKey));
onUnmounted(() => window.removeEventListener('keydown', onKey));
</script>

<template>
  <div class="fixed inset-0 z-40 flex justify-end bg-black/40" @click.self="emit('close')">
    <aside
      class="flex h-full w-[32rem] max-w-full flex-col bg-tv-paper shadow-2xl"
      role="dialog"
      :aria-label="title"
    >
      <header class="flex items-center justify-between bg-tv-800 px-4 py-3 text-white">
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
