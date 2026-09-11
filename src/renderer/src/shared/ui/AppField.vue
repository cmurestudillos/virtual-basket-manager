<script setup lang="ts">
/**
 * Etiqueta y control, juntos y siempre igual.
 *
 * `hint` es para la explicación corta que hace falta debajo de casi todo campo
 * de un manager: qué significa el número que estás cambiando.
 */

withDefaults(defineProps<{ label: string; hint?: string }>(), { hint: '' });
</script>

<template>
  <label class="flex flex-col gap-1 text-sm">
    <span class="text-court-300">{{ label }}</span>
    <slot />
    <span v-if="hint" class="text-xs text-court-600">{{ hint }}</span>
  </label>
</template>
