<script setup lang="ts">
/**
 * La cabecera de una pantalla: el título y, a su lado, el dato que explica
 * dónde estás —la jornada, el campeón, la fecha—.
 *
 * Al lado y no debajo a propósito: en un manager ese dato se consulta tantas
 * veces como el título, y bajarlo a una segunda línea lo esconde.
 *
 * Va sobre el marco oscuro, como el título de la barra de sección de IBM:
 * MAYÚSCULAS en negrita blanca y una raya antes del dato.
 */

withDefaults(defineProps<{ title: string }>(), {});
</script>

<template>
  <header class="flex flex-wrap items-center gap-x-4 gap-y-2 text-white">
    <h1 class="text-lg font-bold uppercase tracking-wide">{{ title }}</h1>
    <template v-if="$slots.default">
      <span aria-hidden="true" class="h-6 w-0.5 bg-white/70"></span>
      <div class="flex flex-wrap items-center gap-3 text-sm text-white/75">
        <slot />
      </div>
    </template>
    <div v-if="$slots.actions" class="ml-auto flex items-center gap-2">
      <slot name="actions" />
    </div>
  </header>
</template>
