<script setup lang="ts">
import { ref, toRef, useId } from 'vue';
import { useDialogFocus } from './useDialogFocus';

/**
 * El diálogo que para la pantalla: cargar una partida, confirmar un despido,
 * el avance de días.
 *
 * Como IBM: velo negro sobre todo, caja con rótulo añil, título centrado y «✕»,
 * cuerpo de papel y, bajo una raya negra, los botones centrados (hueco
 * `actions`). Se pinta encima de todo (`Teleport` al `body`), así que da igual
 * sobre qué fondo se abra.
 *
 * Es un diálogo de verdad: `role="dialog"` con su título, el foco entra al
 * abrir y vuelve al cerrar, el tabulador no sale de él y Escape lo cierra, igual
 * que pulsar fuera. Lo abre y lo cierra quien lo usa, con `open` y `close`.
 *
 * Con `dismissible` a falso no hay «✕» y ni Escape ni pulsar fuera lo cierran:
 * es el aviso de algo que está pasando (el avance de días) y se va solo al
 * acabar; un aspa que no hace nada sería peor que no tenerla.
 */

const props = withDefaults(
  defineProps<{
    open: boolean;
    title: string;
    size?: 'sm' | 'md' | 'lg';
    dismissible?: boolean;
  }>(),
  { size: 'md', dismissible: true }
);

const emit = defineEmits<{ close: [] }>();

const titleId = useId();
const box = ref<HTMLElement | null>(null);
useDialogFocus(box, toRef(props, 'open'), dismiss);

function dismiss(): void {
  if (props.dismissible) {
    emit('close');
  }
}

const WIDTHS = { sm: 'max-w-md', md: 'max-w-2xl', lg: 'max-w-5xl' } as const;
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      @click.self="dismiss"
    >
      <div
        ref="box"
        role="dialog"
        aria-modal="true"
        :aria-labelledby="titleId"
        tabindex="-1"
        class="flex max-h-full w-full flex-col bg-tv-paper text-tv-ink outline-none"
        :class="WIDTHS[size]"
      >
        <header
          class="grid grid-cols-[2rem_1fr_2rem] items-center bg-linear-to-r from-tv-head-from to-tv-head-to px-2 py-2 text-white"
        >
          <span></span>
          <h2 :id="titleId" class="text-center text-sm font-bold uppercase tracking-wide">
            {{ title }}
          </h2>
          <span v-if="!dismissible"></span>
          <button
            v-else
            type="button"
            class="flex h-8 w-8 items-center justify-center text-white hover:text-tv-blue"
            aria-label="Cerrar"
            @click="emit('close')"
          >
            <svg viewBox="0 0 16 16" class="h-4 w-4" aria-hidden="true">
              <path d="M3 3 L13 13 M13 3 L3 13" stroke="currentColor" stroke-width="3" />
            </svg>
          </button>
        </header>

        <div class="flex-1 overflow-y-auto p-4">
          <slot />
        </div>

        <footer
          v-if="$slots.actions"
          class="mx-4 flex justify-center gap-6 border-t border-black py-4"
        >
          <slot name="actions" />
        </footer>
      </div>
    </div>
  </Teleport>
</template>
