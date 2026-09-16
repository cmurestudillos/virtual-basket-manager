<script setup lang="ts">
import { AppAvatar } from '@renderer/shared/ui';
import { onMounted, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useGameStateStore } from '@renderer/shared/game-state.store';
import { formatGameDate } from '@renderer/shared/format';
import { useInboxStore } from '@renderer/features/inbox/inbox.store';

const store = useGameStateStore();
const inbox = useInboxStore();
const router = useRouter();
const route = useRoute();

const sections = [
  { name: 'dashboard', label: 'Club' },
  { name: 'inbox', label: 'Bandeja' },
  { name: 'squad', label: 'Plantilla' },
  { name: 'lineup', label: 'Alineación' },
  { name: 'training', label: 'Entrenamiento' },
  { name: 'youth', label: 'Cantera' },
  { name: 'stats', label: 'Estadísticas' },
  { name: 'market', label: 'Mercado' },
  { name: 'finances', label: 'Finanzas' },
  { name: 'competition', label: 'Competición' },
  { name: 'history', label: 'Historial' }
];

onMounted(async () => {
  await store.refresh();
  // Entrar a una pantalla de juego sin partida cargada (recarga en caliente,
  // enlace directo) devuelve al menú en vez de pintar una cabecera vacía.
  if (!store.state) {
    await router.replace({ name: 'main-menu' });
    return;
  }
  await inbox.refresh();
});

// El contador se pone al día cuando puede haber pasado algo: al moverse el reloj
// —una lesión, un fichaje— o al cambiar de pantalla, que es cuando se vuelve de
// jugar un partido y puede haber rueda de prensa esperando.
watch(
  () => store.state?.currentDate,
  () => void inbox.refresh()
);
watch(
  () => route.fullPath,
  () => void inbox.refresh()
);
</script>

<template>
  <div class="grid h-screen grid-cols-[13rem_1fr] grid-rows-[3.5rem_1fr]">
    <header
      class="col-span-2 flex items-center justify-between border-b border-court-700 bg-court-900 px-5"
    >
      <div class="flex items-center gap-3">
        <span class="text-lg font-semibold text-ball-500">{{
          store.state?.teamName ?? 'Sin equipo'
        }}</span>
        <span v-if="store.state" class="inline-flex items-center gap-2 text-sm text-court-300">
          <AppAvatar kind="coach" :seed="store.state.managerName" :size="24" />
          {{ store.state.managerName }}
        </span>
      </div>
      <div class="flex items-center gap-4 text-sm text-court-300">
        <span v-if="store.state">Temporada {{ store.state.seasonNumber }}</span>
        <span v-if="store.state">{{ formatGameDate(store.state.currentDate) }}</span>
      </div>
    </header>

    <nav class="flex flex-col gap-1 border-r border-court-700 bg-court-900 p-3">
      <RouterLink
        v-for="section in sections"
        :key="section.name"
        :to="{ name: section.name }"
        class="rounded px-3 py-2 text-sm text-court-300 hover:bg-court-800 hover:text-court-100"
        active-class="bg-court-800 text-ball-400"
      >
        <span class="flex items-center justify-between">
          {{ section.label }}
          <span
            v-if="section.name === 'inbox' && inbox.unread > 0"
            class="rounded-full bg-ball-500 px-1.5 text-xs font-semibold text-court-950"
          >
            {{ inbox.unread }}
          </span>
        </span>
      </RouterLink>

      <RouterLink
        :to="{ name: 'settings' }"
        class="mt-auto rounded px-3 py-2 text-sm text-court-300 hover:bg-court-800"
      >
        Ajustes
      </RouterLink>
      <RouterLink
        :to="{ name: 'main-menu' }"
        class="rounded px-3 py-2 text-sm text-court-300 hover:bg-court-800"
      >
        Salir al menú
      </RouterLink>
    </nav>

    <main class="overflow-auto p-6">
      <RouterView />
    </main>
  </div>
</template>
