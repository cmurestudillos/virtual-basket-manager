<script setup lang="ts">
/**
 * Un deslizador con los extremos con nombre.
 *
 * Un 1-10 pelado no dice nada: lo que el entrenador decide no es «siete», es
 * «más agresivo que normal». Poner nombre a los extremos —y al centro— es lo
 * que convierte el número en una decisión.
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
  }>(),
  { min: 1, max: 10, hint: '' }
);

defineEmits<{ 'update:modelValue': [value: number] }>();
</script>

<template>
  <div class="flex flex-col gap-1">
    <div class="flex items-baseline justify-between">
      <span class="text-sm">{{ label }}</span>
      <span class="figure text-sm font-semibold text-ball-400">{{ modelValue }}</span>
    </div>

    <input
      type="range"
      :min="min"
      :max="max"
      step="1"
      class="accent-ball-500"
      :value="modelValue"
      :aria-label="label"
      @input="$emit('update:modelValue', Number(($event.target as HTMLInputElement).value))"
    />

    <div class="flex justify-between text-xs text-court-600">
      <span v-for="stop in stops" :key="stop">{{ stop }}</span>
    </div>
    <span v-if="hint" class="text-xs text-court-600">{{ hint }}</span>
  </div>
</template>
