<script setup lang="ts">
/**
 * La barra lateral de iconos (IBM: 48 px de ancho, casi negra).
 *
 * Un icono por sección; el de la sección en la que estás lleva la barra azul a
 * la izquierda. Sin texto a la vista, así que cada uno dice su nombre dos veces:
 * `aria-label` para el lector de pantalla y una etiqueta que sale al pasar por
 * encima o al llegar con el tabulador. Correo lleva el contador de no leídos.
 */
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import { useInboxStore } from '@renderer/features/inbox/inbox.store';
import { GAME_SECTIONS, RAIL_EXITS, sectionForRoute } from '../sections';
import GameIcon from './GameIcon.vue';

const route = useRoute();
const inbox = useInboxStore();

const current = computed(() => sectionForRoute(route.name as string | undefined));

function labelOf(sectionId: string, label: string): string {
  return sectionId === 'inbox' && inbox.unread > 0 ? `${label} (${inbox.unread} sin leer)` : label;
}
</script>

<template>
  <nav aria-label="Secciones del juego" class="flex flex-col bg-tv-rail py-1">
    <RouterLink
      v-for="section in GAME_SECTIONS"
      :key="section.id"
      :to="{ name: section.tabs[0]?.route }"
      :aria-label="labelOf(section.id, section.label)"
      :aria-current="current?.id === section.id ? 'page' : undefined"
      class="group relative flex h-12 w-12 items-center justify-center transition-colors"
      :class="current?.id === section.id ? 'text-white' : 'text-white/60 hover:text-white'"
    >
      <span
        v-if="current?.id === section.id"
        aria-hidden="true"
        class="absolute inset-y-1.5 left-0 w-[3px] bg-tv-blue"
      ></span>
      <GameIcon :name="section.icon" />
      <span
        v-if="section.id === 'inbox' && inbox.unread > 0"
        aria-hidden="true"
        class="figure absolute right-1 top-1.5 min-w-4 bg-tv-red px-1 text-center text-[10px] font-bold leading-4 text-white"
      >
        {{ inbox.unread > 99 ? '99+' : inbox.unread }}
      </span>
      <span
        aria-hidden="true"
        class="pointer-events-none absolute left-full top-1/2 z-40 ml-1 hidden -translate-y-1/2 whitespace-nowrap bg-tv-footer px-2.5 py-1 text-xs font-bold uppercase tracking-wide text-white group-hover:block group-focus-visible:block"
      >
        {{ section.label }}
      </span>
    </RouterLink>

    <div class="mt-auto border-t border-white/10 pt-1">
      <RouterLink
        v-for="exit in RAIL_EXITS"
        :key="exit.route"
        :to="{ name: exit.route }"
        :aria-label="exit.label"
        class="group relative flex h-12 w-12 items-center justify-center text-white/60 transition-colors hover:text-white"
      >
        <GameIcon :name="exit.icon" />
        <span
          aria-hidden="true"
          class="pointer-events-none absolute left-full top-1/2 z-40 ml-1 hidden -translate-y-1/2 whitespace-nowrap bg-tv-footer px-2.5 py-1 text-xs font-bold uppercase tracking-wide text-white group-hover:block group-focus-visible:block"
        >
          {{ exit.label }}
        </span>
      </RouterLink>
    </div>
  </nav>
</template>
