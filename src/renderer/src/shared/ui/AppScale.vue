<script setup lang="ts">
/**
 * Un deslizador con los extremos con nombre.
 *
 * Un 1-10 pelado no dice nada: lo que el entrenador decide no es «siete», es
 * «más agresivo que normal». Poner nombre a los extremos —y al centro— es lo
 * que convierte el número en una decisión.
 *
 * Como IBM: carril azul y pulgar rectangular pequeño. Va sobre papel.
 *
 * `update:modelValue` sale con cada paso del arrastre; `change`, sólo al
 * soltar, para quien no quiera mandar un cambio por paso (el partido en vivo).
 */

withDefaults(
  defineProps<{
    modelValue: number;
    min?: number;
    max?: number;
    label: string;
    /** Los rótulos de los extremos, y del medio si se pasan tres. */
    stops: readonly string[];
    hint?: string;
    disabled?: boolean;
  }>(),
  { min: 1, max: 10, hint: '', disabled: false }
);

defineEmits<{ 'update:modelValue': [value: number]; change: [value: number] }>();
</script>

<template>
  <div class="flex flex-col gap-1 text-tv-ink">
    <div class="flex items-baseline justify-between">
      <span class="text-sm font-semibold">{{ label }}</span>
      <span class="figure bg-tv-slab px-2 text-sm font-bold text-white">{{ modelValue }}</span>
    </div>

    <input
      type="range"
      :min="min"
      :max="max"
      step="1"
      class="scale-input"
      :value="modelValue"
      :aria-label="label"
      :disabled="disabled"
      @input="$emit('update:modelValue', Number(($event.target as HTMLInputElement).value))"
      @change="$emit('change', Number(($event.target as HTMLInputElement).value))"
    />

    <div class="flex justify-between text-xs text-tv-muted">
      <span v-for="stop in stops" :key="stop">{{ stop }}</span>
    </div>
    <span v-if="hint" class="text-xs text-tv-muted">{{ hint }}</span>
  </div>
</template>

<style scoped>
/* El deslizador nativo, a la manera de IBM. Sólo el de Chromium: es lo que
   lleva Electron. */
.scale-input {
  appearance: none;
  width: 100%;
  height: 1.25rem;
  background: transparent;
  cursor: pointer;
}

.scale-input::-webkit-slider-runnable-track {
  height: 0.375rem;
  background: var(--color-tv-blue);
}

.scale-input::-webkit-slider-thumb {
  appearance: none;
  width: 0.625rem;
  height: 1.125rem;
  margin-top: -0.375rem;
  background: var(--color-tv-slab);
  border: 2px solid white;
  outline: 1px solid var(--color-tv-slab);
}

.scale-input:focus-visible {
  outline: 2px solid var(--color-tv-blue);
  outline-offset: 2px;
}

.scale-input:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}
</style>
