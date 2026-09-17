<script setup lang="ts">
/**
 * La barra de pestañas, en sus dos formas.
 *
 * `underline` es la de dentro de una sección —Clasificación, Calendario,
 * Copa— y `pills` la de elegir entre cosas del mismo rango —una liga, una
 * competición europea—. Son la misma decisión con distinta pinta, así que
 * comparten componente: lo que las distingue es el peso que tienen dentro de
 * la pantalla, no lo que hacen.
 *
 * `underline` va sobre el marco oscuro (la barra de sección, `tv-bar`, que ya
 * trae de fondo): letra blanca en negrita y la activa subrayada en azul, como
 * IBM. `pills` va sobre papel: botones rectos, el elegido en azul.
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
  <nav v-if="variant === 'underline'" class="flex shrink-0 gap-1 bg-tv-bar px-2">
    <button
      v-for="option in options"
      :key="option.id"
      type="button"
      class="whitespace-nowrap border-b-[3px] px-3 pb-2 pt-2.5 text-sm font-bold transition-colors"
      :class="
        modelValue === option.id
          ? 'border-tv-blue text-white'
          : 'border-transparent text-white/70 hover:text-tv-blue'
      "
      :aria-pressed="modelValue === option.id"
      @click="$emit('update:modelValue', option.id)"
    >
      {{ option.label }}
      <span v-if="option.hint" class="text-xs font-normal text-white/60">{{ option.hint }}</span>
    </button>
  </nav>

  <nav v-else class="flex flex-wrap gap-[3px]">
    <button
      v-for="option in options"
      :key="option.id"
      type="button"
      class="px-3 py-1.5 text-sm font-semibold transition-colors"
      :class="
        modelValue === option.id
          ? 'bg-tv-blue text-white'
          : 'bg-tv-cell text-tv-ink hover:bg-tv-cell-strong'
      "
      :aria-pressed="modelValue === option.id"
      @click="$emit('update:modelValue', option.id)"
    >
      {{ option.label }}
      <span
        v-if="option.hint"
        class="text-xs font-normal"
        :class="modelValue === option.id ? 'text-white/80' : 'text-tv-muted'"
        >{{ option.hint }}</span
      >
    </button>
  </nav>
</template>
