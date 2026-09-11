<script setup lang="ts">
import { onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useGameStateStore } from '@renderer/shared/game-state.store';
import { formatGameDate } from '@renderer/shared/format';

const store = useGameStateStore();
const router = useRouter();

const sections = [
  { name: 'dashboard', label: 'Club' },
  { name: 'squad', label: 'Plantilla' },
  { name: 'lineup', label: 'Alineación' },
  { name: 'training', label: 'Entrenamiento' },
  { name: 'youth', label: 'Cantera' },
  { name: 'stats', label: 'Estadísticas' },
  { name: 'market', label: 'Mercado' },
  { name: 'finances', label: 'Finanzas' },
  { name: 'competition', label: 'Competición' }
];

onMounted(async () => {
  await store.refresh();
  // Entrar a una pantalla de juego sin partida cargada (recarga en caliente,
  // enlace directo) devuelve al menú en vez de pintar una cabecera vacía.
  if (!store.state) {
    await router.replace({ name: 'main-menu' });
  }
});
</script>

<template>
  <div class="grid h-screen grid-cols-[13rem_1fr] grid-rows-[3.5rem_1fr]">
    <header
      class="col-span-2 flex items-center justify-between border-b border-court-700 bg-court-900 px-5"
    >
      <div class="flex items-baseline gap-3">
        <span class="text-lg font-semibold text-ball-500">{{
          store.state?.teamName ?? 'Sin equipo'
        }}</span>
        <span class="text-sm text-court-300">{{ store.state?.managerName }}</span>
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
        {{ section.label }}
      </RouterLink>

      <RouterLink
        :to="{ name: 'main-menu' }"
        class="mt-auto rounded px-3 py-2 text-sm text-court-300 hover:bg-court-800"
      >
        Salir al menú
      </RouterLink>
    </nav>

    <main class="overflow-auto p-6">
      <RouterView />
    </main>
  </div>
</template>
