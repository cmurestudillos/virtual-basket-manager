<script setup lang="ts">
/**
 * Los botones de una pantalla en la barra de acciones de abajo: guardar,
 * ofertar, renovar. Alineados a la derecha, como IBM.
 *
 * Con que una pantalla lo use, la barra aparece; sin ninguno, no se pinta. Ver
 * `page-chrome.ts` para el mecanismo.
 */
import { ACTION_BAR_TARGET, useActionBarSlot, usePageChrome } from '../page-chrome';

const chrome = usePageChrome();
useActionBarSlot(chrome);
</script>

<template>
  <Teleport defer :to="`#${ACTION_BAR_TARGET}`" :disabled="!chrome">
    <slot />
  </Teleport>
</template>
