<script setup lang="ts">
import { computed } from 'vue';
import { TONE_TEXT, type Tone } from './tones';

/**
 * Una cifra con su etiqueta: caja, confianza, media del equipo, asistencia.
 *
 * Es el bloque con el que se lee un manager de un vistazo, y por eso la
 * etiqueta va arriba en mayúsculas pequeñas y el número debajo en grande: se
 * busca el número, y el rótulo sólo hace falta la primera vez.
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
    /** Con marco propio: para cuando el dato va suelto y no dentro de un panel. */
    boxed?: boolean;
  }>(),
  { size: 'lg', tone: null, note: '', boxed: false }
);

const valueClass = computed(() => [
  'figure mt-1',
  props.size === 'lg' ? 'text-2xl font-semibold' : 'text-lg',
  props.tone ? TONE_TEXT[props.tone] : ''
]);
</script>

<template>
  <article :class="boxed ? 'rounded border border-court-700 p-4' : ''">
    <p class="text-xs uppercase tracking-wide text-court-300">{{ label }}</p>
    <p :class="valueClass"><slot /></p>
    <p v-if="note || $slots.note" class="text-xs text-court-600">
      <slot name="note">{{ note }}</slot>
    </p>
  </article>
</template>
