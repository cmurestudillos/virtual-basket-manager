<script setup lang="ts">
import { onMounted, ref } from 'vue';
import type { TeamSummary } from '@shared/contracts/teams.contract';
import { useGameStateStore } from '@renderer/shared/game-state.store';
import { formatMoney } from '@renderer/shared/format';

const store = useGameStateStore();
const team = ref<TeamSummary | null>(null);

onMounted(async () => {
  if (!store.state) {
    await store.refresh();
  }
  if (store.state) {
    team.value = await window.api.teams.get(store.state.teamId);
  }
});
</script>

<template>
  <div v-if="team" class="flex flex-col gap-6">
    <h1 class="text-2xl font-semibold">{{ team.name }}</h1>

    <div class="grid grid-cols-4 gap-4">
      <article class="rounded border border-court-700 p-4">
        <p class="text-xs uppercase tracking-wide text-court-300">Competición</p>
        <p class="mt-1 text-lg">{{ team.competitionName }}</p>
      </article>
      <article class="rounded border border-court-700 p-4">
        <p class="text-xs uppercase tracking-wide text-court-300">Pabellón</p>
        <p class="mt-1 text-lg">{{ team.pavilionName }}</p>
        <p class="text-sm text-court-300">{{ team.pavilionCapacity }} espectadores</p>
      </article>
      <article class="rounded border border-court-700 p-4">
        <p class="text-xs uppercase tracking-wide text-court-300">Presupuesto</p>
        <p class="mt-1 text-lg">{{ formatMoney(team.budgetCents) }}</p>
      </article>
      <article class="rounded border border-court-700 p-4">
        <p class="text-xs uppercase tracking-wide text-court-300">Plantilla</p>
        <p class="mt-1 text-lg">{{ team.rosterSize }} jugadores</p>
      </article>
    </div>

    <p class="text-sm text-court-600">
      Esqueleto: las secciones de temporada, mercado, entrenamiento y finanzas todavía no existen.
    </p>
  </div>
</template>
