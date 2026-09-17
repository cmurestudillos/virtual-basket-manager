<script setup lang="ts">
/**
 * La barra de sección (IBM: ~50 px, `tv-bar`): el TÍTULO de la sección, una
 * raya y las pestañas con las pantallas de la sección. A la derecha, el hueco
 * donde cada pantalla mete sus controles con `PageToolbar`.
 *
 * Las pestañas son enlaces del router con el mismo aspecto que `AppTabs`
 * `underline` (negrita blanca, la activa subrayada en azul): aquí cambiar de
 * pestaña es cambiar de ruta, y un enlace se abre, se marca y se lee como tal.
 */
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import { SECTION_TABS_TARGET, SECTION_TOOLS_TARGET } from '../page-chrome';
import { sectionForRoute } from '../sections';

const route = useRoute();
const section = computed(() => sectionForRoute(route.name as string | undefined));
/** Con una sola pantalla la pestaña repetiría el título: no se pinta. */
const tabs = computed(() =>
  section.value && section.value.tabs.length > 1 ? section.value.tabs : []
);
</script>

<template>
  <div class="flex min-w-0 items-stretch gap-4 border-b border-white/10 bg-tv-bar pl-6 pr-4">
    <p class="flex shrink-0 items-center text-lg font-bold uppercase tracking-wide text-white">
      {{ section?.label ?? '' }}
    </p>
    <span aria-hidden="true" class="my-3 w-0.5 shrink-0 bg-white/70"></span>

    <nav
      :aria-label="`Pantallas de ${section?.label ?? 'la sección'}`"
      class="flex min-w-0 items-stretch gap-1 overflow-x-auto"
    >
      <RouterLink
        v-for="tab in tabs"
        :key="tab.route"
        :to="{ name: tab.route }"
        class="flex items-center whitespace-nowrap border-b-[3px] px-2.5 pt-[3px] text-sm font-bold transition-colors"
        :class="
          route.name === tab.route
            ? 'border-tv-blue text-white'
            : 'border-transparent text-white/70 hover:text-tv-blue'
        "
      >
        {{ tab.label }}
      </RouterLink>
      <div :id="SECTION_TABS_TARGET" class="flex items-stretch gap-1"></div>
    </nav>

    <!-- Si no cabe todo, cede sobre todo esta parte (un selector se estrecha; una
         pestaña cortada no se lee), por eso encoge cien veces más que las pestañas. -->
    <div
      :id="SECTION_TOOLS_TARGET"
      class="ml-auto flex min-w-0 shrink-100 items-center gap-2"
    ></div>
  </div>
</template>
