<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import type { ContinentalSummary, ContinentalView } from '@shared/contracts/season.contract';
import { AppEmpty, AppPanel, AppSelect } from '@renderer/shared/ui';
import { useGameStateStore } from '@renderer/shared/game-state.store';
import PageToolbar from '@renderer/features/app-shell/components/PageToolbar.vue';
import BracketColumns from '@renderer/features/competition/components/BracketColumns.vue';
import ChampionBanner from '@renderer/features/competition/components/ChampionBanner.vue';
import SeriesCard from '@renderer/features/competition/components/SeriesCard.vue';
import StandingsTable from '@renderer/features/competition/components/StandingsTable.vue';

/**
 * Europa —o América— en una pantalla: la tabla de la fase de liga a la
 * izquierda y el cuadro a la derecha. Se leen juntas porque una explica a la
 * otra: la tabla dice quién va a entrar en el cuadro y el cuadro dice qué pasó
 * después.
 *
 * Qué competición se mira se elige en la barra de sección, con el selector
 * negro, como la liga en el resto de pestañas.
 */

const store = useGameStateStore();
const competitions = ref<ContinentalSummary[]>([]);
const selected = ref<string | null>(null);
const view = ref<ContinentalView | null>(null);
const loaded = ref(false);

const options = computed(() =>
  competitions.value.map((row) => ({
    id: row.competitionId,
    label: row.involvesManaged ? `${row.name} · juegas` : row.name
  }))
);

const columns = computed(() =>
  (view.value?.knockout.rounds ?? []).map((round) => ({
    key: round.round,
    title: round.name,
    note: round.bestOf > 1 ? `Al mejor de ${round.bestOf}` : 'Partido único',
    items: round.series
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
  <PageToolbar>
    <AppSelect
      v-if="options.length > 1"
      :model-value="selected ?? ''"
      :options="options"
      label="Competición continental"
      class="max-w-56 min-w-28!"
      @update:model-value="selected = $event"
    />
  </PageToolbar>

  <div v-if="loaded" class="flex flex-col gap-4">
    <AppPanel v-if="!view" title="Competiciones continentales">
      <AppEmpty>
        Las competiciones continentales se sortean al empezar la temporada, con los mejores clubes
        de cada liga del continente. Hace falta un pabellón a la altura para entrar en la primera.
      </AppEmpty>
    </AppPanel>

    <template v-else>
      <ChampionBanner
        v-if="view.championTeamName"
        :label="`Campeón de ${view.name}`"
        :team-id="view.championTeamId"
        :team-name="view.championTeamName"
        :mine="view.championTeamId === store.state?.teamId"
      />

      <div class="grid grid-cols-[30rem_minmax(0,1fr)] items-start gap-4">
        <AppPanel :title="`${view.name} · fase de liga`" hint="Pasan los ocho primeros" flush>
          <StandingsTable :rows="view.group" />
        </AppPanel>

        <AppPanel v-if="columns.length === 0" title="Cuadro">
          <AppEmpty>
            El cuadro se monta al acabar la fase de liga: cuartos al mejor de tres y Final Four a
            partido único en sede neutral.
          </AppEmpty>
        </AppPanel>
        <BracketColumns v-else :columns="columns" :item-key="(series) => series.seriesId">
          <template #item="{ item }">
            <SeriesCard :series="item" />
          </template>
        </BracketColumns>
      </div>
    </template>
  </div>
</template>
