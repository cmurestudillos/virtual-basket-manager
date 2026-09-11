<script setup lang="ts">
import { onMounted, ref } from 'vue';
import type { PlayoffBracket } from '@shared/contracts/season.contract';
import { AppEmpty, AppSectionTitle } from '@renderer/shared/ui';
import SeriesCard from '@renderer/features/competition/components/SeriesCard.vue';

const bracket = ref<PlayoffBracket | null>(null);
const loaded = ref(false);

onMounted(async () => {
  bracket.value = await window.api.season.getPlayoffs();
  loaded.value = true;
});
</script>

<template>
  <div v-if="loaded" class="flex flex-col gap-6">
    <AppEmpty v-if="!bracket">
      El cuadro se monta cuando acabe la liga regular: los ocho primeros se clasifican y el factor
      cancha va por clasificación.
    </AppEmpty>

    <template v-else>
      <p v-if="bracket.championTeamName" class="text-lg">
        <span class="text-court-300">Campeón:</span>
        <span class="ml-2 font-semibold text-ball-400">{{ bracket.championTeamName }}</span>
      </p>

      <section v-for="round in bracket.rounds" :key="round.round" class="flex flex-col gap-2">
        <AppSectionTitle :hint="`· al mejor de ${round.bestOf}`">{{ round.name }}</AppSectionTitle>

        <ul class="grid gap-2 md:grid-cols-2">
          <SeriesCard v-for="series in round.series" :key="series.seriesId" :series="series" />
        </ul>
      </section>
    </template>
  </div>
</template>
