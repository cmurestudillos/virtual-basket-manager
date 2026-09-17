<script setup lang="ts">
import { computed } from 'vue';
import { TONE_TEXT, type Tone } from './tones';

/**
 * Una cifra en su caja: caja del club, confianza, media del equipo, asistencia.
 *
 * Es la caja de cifra de IBM: la etiqueta arriba en mayúsculas y, debajo, el
 * número grande y centrado en una caja gris (`tv-box`). Se busca el número; el
 * rótulo sólo hace falta la primera vez. Va sobre papel.
 *
 * `boxed` le pone la etiqueta en un subrótulo añil, para cuando la cifra va
 * suelta y no dentro de un panel que ya diga de qué se habla.
 *
 * `note` es la letra pequeña de debajo —«12.400 € al año», «3 de 5»—, que es
 * donde va el detalle que explica la cifra sin competir con ella.
 */

const props = withDefaults(
  defineProps<{
    label: string;
    /** `lg` para el dato principal de la pantalla; `md` para los de al lado. */
    size?: 'md' | 'lg';
    tone?: Tone | null;
    note?: string;
    /** Etiqueta en rótulo añil: para cuando el dato va suelto. */
    boxed?: boolean;
  }>(),
  { size: 'lg', tone: null, note: '', boxed: false }
);

const valueClass = computed(() => [
  'figure bg-tv-box px-3 text-center font-bold',
  props.size === 'lg' ? 'py-2 text-3xl' : 'py-1.5 text-xl',
  props.tone ? TONE_TEXT[props.tone] : 'text-tv-ink'
]);
</script>

<template>
  <article class="flex min-w-0 flex-col gap-1">
    <p
      class="truncate text-center text-xs font-bold uppercase tracking-wide"
      :class="
        boxed ? 'bg-linear-to-r from-tv-head-from to-tv-head-to py-1.5 text-white' : 'text-tv-ink'
      "
    >
      {{ label }}
    </p>
    <p :class="valueClass"><slot /></p>
    <p v-if="note || $slots.note" class="text-center text-xs text-tv-muted">
      <slot name="note">{{ note }}</slot>
    </p>
  </article>
</template>
