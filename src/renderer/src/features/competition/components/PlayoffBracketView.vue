<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import type { PlayoffBracket } from '@shared/contracts/season.contract';
import { AppEmpty, AppPanel } from '@renderer/shared/ui';
import { useGameStateStore } from '@renderer/shared/game-state.store';
import BracketColumns from '@renderer/features/competition/components/BracketColumns.vue';
import ChampionBanner from '@renderer/features/competition/components/ChampionBanner.vue';
import SeriesCard from '@renderer/features/competition/components/SeriesCard.vue';

/** Liga del cuadro; sin ella, la del club. */
const props = defineProps<{ competitionId?: string }>();

const store = useGameStateStore();
const bracket = ref<PlayoffBracket | null>(null);
const loaded = ref(false);

onMounted(async () => {
  bracket.value = await window.api.season.getPlayoffs(props.competitionId);
  loaded.value = true;
});

const columns = computed(() =>
  (bracket.value?.rounds ?? []).map((round) => ({
    key: round.round,
    title: round.name,
    note: round.bestOf === 1 ? 'Partido único' : `Al mejor de ${round.bestOf}`,
    items: round.series
  }))
);
</script>

<template>
  <div v-if="loaded" class="flex flex-col gap-4">
    <AppPanel v-if="!bracket" title="Playoffs">
      <AppEmpty>
        El cuadro se monta cuando acabe la liga regular: los ocho primeros se clasifican y el factor
        cancha va por clasificación.
      </AppEmpty>
    </AppPanel>

    <template v-else>
      <ChampionBanner
        v-if="bracket.championTeamName"
        label="Campeón"
        :team-id="bracket.championTeamId"
        :team-name="bracket.championTeamName"
        :mine="bracket.championTeamId === store.state?.teamId"
      />

      <BracketColumns :columns="columns" :item-key="(series) => series.seriesId">
        <template #item="{ item }">
          <SeriesCard :series="item" />
        </template>
      </BracketColumns>
    </template>
  </div>
</template>
