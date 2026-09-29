<script setup lang="ts">
/**
 * Lo que una pantalla pone en la barra de sección: sus pestañas propias
 * (`place="tabs"`, detrás de las de la sección) o sus controles (a la derecha:
 * un selector de liga, un paginador, un buscador).
 *
 * Las pestañas de la pantalla llevan delante una raya fina cuando hay pestañas
 * de la sección antes que ellas, para que se lean como otro nivel. Se pone aquí,
 * una vez, y no en cada pantalla.
 *
 * Ver `page-chrome.ts` para el mecanismo.
 */
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import { SECTION_TABS_TARGET, SECTION_TOOLS_TARGET, usePageChrome } from '../page-chrome';
import { sectionHasTabs } from '../sections';

const props = withDefaults(defineProps<{ place?: 'tabs' | 'tools' }>(), { place: 'tools' });

const chrome = usePageChrome();
const route = useRoute();
const divider = computed(
  () =>
    props.place === 'tabs' && chrome !== null && sectionHasTabs(route.name as string | undefined)
);
</script>

<template>
  <Teleport
    defer
    :to="`#${place === 'tabs' ? SECTION_TABS_TARGET : SECTION_TOOLS_TARGET}`"
    :disabled="!chrome"
  >
    <span v-if="divider" aria-hidden="true" class="my-3 w-px shrink-0 bg-white/30"></span>
    <slot />
  </Teleport>
</template>
