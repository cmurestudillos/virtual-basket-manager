<script setup lang="ts">
import { onMounted, ref } from 'vue';
import type { TeamSummary } from '@shared/contracts/teams.contract';

const teams = ref<TeamSummary[]>([]);

onMounted(async () => {
  teams.value = await window.api.teams.list();
});
</script>

<template>
  <div class="flex flex-col gap-4">
    <h1 class="text-2xl font-semibold">Competición</h1>
    <p class="text-sm text-court-600">
      Todavía no hay calendario ni clasificación: esto es el listado de equipos del dataset, para
      comprobar que la partida se ha sembrado bien.
    </p>

    <div class="overflow-auto rounded border border-court-700">
      <table class="data-table">
        <thead>
          <tr>
            <th>Equipo</th>
            <th>Ciudad</th>
            <th>Pabellón</th>
            <th class="numeric">Aforo</th>
            <th class="numeric">Reputación</th>
            <th class="numeric">Plantilla</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="team in teams" :key="team.id">
            <td>{{ team.name }}</td>
            <td class="text-court-300">{{ team.city }}</td>
            <td class="text-court-300">{{ team.pavilionName }}</td>
            <td class="numeric">{{ team.pavilionCapacity }}</td>
            <td class="numeric">{{ team.reputation }}</td>
            <td class="numeric">{{ team.rosterSize }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
