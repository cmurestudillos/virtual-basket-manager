<script setup lang="ts">
/**
 * Etiqueta y control, juntos y siempre igual. Va sobre papel.
 *
 * `hint` es para la explicación corta que hace falta debajo de casi todo campo
 * de un manager: qué significa el número que estás cambiando.
 */

withDefaults(defineProps<{ label: string; hint?: string }>(), { hint: '' });
</script>

<template>
  <label class="flex flex-col gap-1 text-sm text-tv-ink">
    <span class="text-xs font-bold uppercase tracking-wide">{{ label }}</span>
    <slot />
    <span v-if="hint" class="text-xs text-tv-muted">{{ hint }}</span>
  </label>
</template>
