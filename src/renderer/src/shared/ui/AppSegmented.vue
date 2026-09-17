<script setup lang="ts">
/**
 * El interruptor de dos o tres opciones excluyentes: 1 vs 1 o zonas, todo el
 * partido o la mitad.
 *
 * No es un desplegable ni son pestañas: las opciones se ven todas a la vez y se
 * eligen de una pulsada. En una pantalla de decisiones —la pizarra, el
 * entrenamiento— eso es lo que hace que se pruebe una y otra sin abrir nada.
 *
 * Como IBM: la elegida, azul rellena; las otras, añil con borde azul. Se lee
 * igual sobre papel que sobre el marco oscuro.
 */

export interface SegmentOption {
  id: string;
  label: string;
}

defineProps<{ options: readonly SegmentOption[]; modelValue: string }>();
defineEmits<{ 'update:modelValue': [value: string] }>();
</script>

<template>
  <div class="inline-flex gap-[3px]" role="group">
    <button
      v-for="option in options"
      :key="option.id"
      type="button"
      class="border-2 px-4 py-1 text-sm font-bold uppercase tracking-wide transition-colors"
      :class="
        modelValue === option.id
          ? 'border-tv-blue bg-tv-blue text-white'
          : 'border-tv-blue bg-tv-800 text-white/75 hover:text-white'
      "
      :aria-pressed="modelValue === option.id"
      @click="$emit('update:modelValue', option.id)"
    >
      {{ option.label }}
    </button>
  </div>
</template>
