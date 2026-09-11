<script setup lang="ts">
/**
 * La cabecera de una pantalla: el título grande y, a su lado, el dato que
 * explica dónde estás —la jornada, el campeón, la fecha—.
 *
 * Al lado y no debajo a propósito: en un manager ese dato se consulta tantas
 * veces como el título, y bajarlo a una segunda línea lo esconde.
 */

withDefaults(defineProps<{ title: string }>(), {});
</script>

<template>
  <header class="flex flex-wrap items-baseline gap-4">
    <h1 class="text-2xl font-semibold">{{ title }}</h1>
    <slot />
    <div v-if="$slots.actions" class="ml-auto flex items-center gap-2">
      <slot name="actions" />
    </div>
  </header>
</template>
