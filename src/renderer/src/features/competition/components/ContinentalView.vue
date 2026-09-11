<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import type { ContinentalSummary, ContinentalView } from '@shared/contracts/season.contract';
import { AppEmpty, AppPanel, AppSectionTitle, AppTabs } from '@renderer/shared/ui';
import SeriesCard from '@renderer/features/competition/components/SeriesCard.vue';

/**
 * Europa —o América— en una pantalla: la tabla de la fase de liga arriba y el
 * cuadro debajo. Se leen juntas porque una explica a la otra: la tabla dice
 * quién va a entrar en el cuadro y el cuadro dice qué pasó después.
 */

const competitions = ref<ContinentalSummary[]>([]);
const selected = ref<string | null>(null);
const view = ref<ContinentalView | null>(null);
const loaded = ref(false);

const options = computed(() =>
  competitions.value.map((row) => ({
    id: row.competitionId,
    label: row.name,
    hint: row.involvesManaged ? ' · juegas' : ''
  }))
);

onMounted(async () => {
  competitions.value = await window.api.season.listContinental();
  selected.value =
    competitions.value.find((row) => row.involvesManaged)?.competitionId ??
    competitions.value[0]?.competitionId ??
    null;
  await load();
  loaded.value = true;
});

watch(selected, load);

async function load(): Promise<void> {
  view.value = await window.api.season.getContinental(selected.value ?? undefined);
}
</script>

<template>
  <div v-if="loaded" class="flex flex-col gap-4">
    <AppEmpty v-if="!view">
      Las competiciones continentales se sortean al empezar la temporada, con los mejores clubes de
      cada liga del continente. Hace falta un pabellón a la altura para entrar en la primera.
    </AppEmpty>

    <template v-else>
      <AppTabs
        v-if="options.length > 1"
        :model-value="selected ?? ''"
        :options="options"
        variant="pills"
        @update:model-value="selected = $event"
      />

      <p v-if="view.championTeamName" class="text-lg">
        <span class="text-court-300">Campeón de {{ view.name }}:</span>
        <span class="ml-2 font-semibold text-ball-400">{{ view.championTeamName }}</span>
      </p>

      <AppPanel title="Fase de liga" hint="pasan los ocho primeros" flush>
        <table class="data-table">
          <thead>
            <tr>
              <th class="numeric">#</th>
              <th>Equipo</th>
              <th class="numeric">J</th>
              <th class="numeric">G</th>
              <th class="numeric">P</th>
              <th class="numeric">Dif</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="row in view.group"
              :key="row.teamId"
              :class="row.isManaged ? 'bg-court-800 text-ball-400' : ''"
            >
              <td
                class="numeric border-l-4"
                :class="row.zone === 'playoffs' ? 'border-ball-500' : 'border-transparent'"
              >
                {{ row.position }}
              </td>
              <td>{{ row.teamName }}</td>
              <td class="numeric">{{ row.played }}</td>
              <td class="numeric font-semibold">{{ row.won }}</td>
              <td class="numeric">{{ row.lost }}</td>
              <td class="numeric" :class="row.pointsDifference >= 0 ? 'text-good-400' : ''">
                {{ row.pointsDifference > 0 ? '+' : '' }}{{ row.pointsDifference }}
              </td>
            </tr>
          </tbody>
        </table>
      </AppPanel>

      <AppEmpty v-if="view.knockout.rounds.length === 0">
        El cuadro se monta al acabar la fase de liga: cuartos al mejor de tres y Final Four a
        partido único en sede neutral.
      </AppEmpty>

      <section v-for="round in view.knockout.rounds" :key="round.round" class="flex flex-col gap-2">
        <AppSectionTitle
          :hint="round.bestOf > 1 ? `· al mejor de ${round.bestOf}` : '· a partido único'"
        >
          {{ round.name }}
        </AppSectionTitle>

        <ul class="grid gap-2 md:grid-cols-2">
          <SeriesCard v-for="series in round.series" :key="series.seriesId" :series="series" />
        </ul>
      </section>
    </template>
  </div>
</template>
