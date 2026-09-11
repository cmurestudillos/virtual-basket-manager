<script setup lang="ts">
/**
 * La barra de pestañas, en sus dos formas.
 *
 * `underline` es la de dentro de una pantalla —Clasificación, Calendario,
 * Copa— y `pills` la de elegir entre cosas del mismo rango —una liga, una
 * competición europea—. Son la misma decisión con distinta pinta, así que
 * comparten componente: lo que las distingue es el peso que tienen dentro de
 * la pantalla, no lo que hacen.
 */

export interface TabOption {
  id: string;
  label: string;
  /** Nota pequeña detrás del nombre: «· tu liga», «· juegas». */
  hint?: string;
}

withDefaults(
  defineProps<{
    options: readonly TabOption[];
    modelValue: string;
    variant?: 'underline' | 'pills';
  }>(),
  { variant: 'underline' }
);

defineEmits<{ 'update:modelValue': [value: string] }>();
</script>

<template>
  <nav
    :class="
      variant === 'underline' ? 'flex gap-1 border-b border-court-700' : 'flex flex-wrap gap-2'
    "
  >
    <button
      v-for="option in options"
      :key="option.id"
      type="button"
      :class="[
        variant === 'underline'
          ? 'border-b-2 px-4 py-2 text-sm'
          : 'rounded border px-3 py-1 text-sm',
        modelValue === option.id
          ? 'border-ball-500 text-ball-400'
          : variant === 'underline'
            ? 'border-transparent text-court-300 hover:text-court-100'
            : 'border-court-700 text-court-300 hover:text-court-100'
      ]"
      @click="$emit('update:modelValue', option.id)"
    >
      {{ option.label }}
      <span v-if="option.hint" class="text-xs text-court-500">{{ option.hint }}</span>
    </button>
  </nav>
</template>
