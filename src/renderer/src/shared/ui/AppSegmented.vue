<script setup lang="ts">
/**
 * El interruptor de dos o tres opciones excluyentes: 1 vs 1 o zonas, todo el
 * partido o la mitad.
 *
 * No es un desplegable ni son pestañas: las opciones se ven todas a la vez y se
 * eligen de una pulsada. En una pantalla de decisiones —la pizarra, el
 * entrenamiento— eso es lo que hace que se pruebe una y otra sin abrir nada.
 */

export interface SegmentOption {
  id: string;
  label: string;
}

defineProps<{ options: readonly SegmentOption[]; modelValue: string }>();
defineEmits<{ 'update:modelValue': [value: string] }>();
</script>

<template>
  <div class="inline-flex rounded border border-court-700 p-0.5" role="group">
    <button
      v-for="option in options"
      :key="option.id"
      type="button"
      class="rounded px-3 py-1 text-sm transition-colors"
      :class="
        modelValue === option.id
          ? 'bg-ball-600 font-semibold text-court-100'
          : 'text-court-300 hover:bg-court-800 hover:text-court-100'
      "
      :aria-pressed="modelValue === option.id"
      @click="$emit('update:modelValue', option.id)"
    >
      {{ option.label }}
    </button>
  </div>
</template>
