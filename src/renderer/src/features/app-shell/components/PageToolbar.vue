<script setup lang="ts">
/**
 * Lo que una pantalla pone en la barra de sección: sus pestañas propias
 * (`place="tabs"`, detrás de las de la sección) o sus controles (a la derecha:
 * un selector de liga, un paginador, un buscador).
 *
 * Ver `page-chrome.ts` para el mecanismo.
 */
import { SECTION_TABS_TARGET, SECTION_TOOLS_TARGET, usePageChrome } from '../page-chrome';

withDefaults(defineProps<{ place?: 'tabs' | 'tools' }>(), { place: 'tools' });

const chrome = usePageChrome();
</script>

<template>
  <Teleport
    defer
    :to="`#${place === 'tabs' ? SECTION_TABS_TARGET : SECTION_TOOLS_TARGET}`"
    :disabled="!chrome"
  >
    <slot />
  </Teleport>
</template>
