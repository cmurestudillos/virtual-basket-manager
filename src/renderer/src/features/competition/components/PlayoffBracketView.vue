<script setup lang="ts">
import { onMounted, ref } from 'vue';
import type { PlayoffBracket, PlayoffSeries } from '@shared/contracts/season.contract';
import { winsNeeded } from '@shared/domain/playoffs';

const bracket = ref<PlayoffBracket | null>(null);
const loaded = ref(false);

onMounted(async () => {
  bracket.value = await window.api.season.getPlayoffs();
  loaded.value = true;
});

/** Marcador de la serie desde el lado del mejor clasificado: `2-1`. */
function seriesScore(series: PlayoffSeries): string {
  return `${series.higherSeedWins}-${series.lowerSeedWins}`;
}

function isWinner(series: PlayoffSeries, teamId: string): boolean {
  return series.winnerTeamId === teamId;
}

/** Resultado de un partido de la serie visto desde el mejor clasificado. */
function gameScore(series: PlayoffSeries, game: PlayoffSeries['games'][number]): string {
  const higherIsHome = game.homeTeamId === series.higherSeedTeamId;
  const own = higherIsHome ? game.homeScore : game.awayScore;
  const rival = higherIsHome ? game.awayScore : game.homeScore;
  return `${own}-${rival}`;
}
</script>

<template>
  <div v-if="loaded" class="flex flex-col gap-6">
    <p v-if="!bracket" class="text-sm text-court-300">
      El cuadro se monta cuando acabe la liga regular: los ocho primeros se clasifican y el factor
      cancha va por clasificación.
    </p>

    <template v-else>
      <p v-if="bracket.championTeamName" class="text-lg">
        <span class="text-court-300">Campeón:</span>
        <span class="ml-2 font-semibold text-ball-400">{{ bracket.championTeamName }}</span>
      </p>

      <section v-for="round in bracket.rounds" :key="round.round" class="flex flex-col gap-2">
        <h2 class="text-sm uppercase tracking-wide text-court-300">
          {{ round.name }}
          <span class="text-court-600">· al mejor de {{ round.bestOf }}</span>
        </h2>

        <ul class="grid gap-2 md:grid-cols-2">
          <li
            v-for="series in round.series"
            :key="series.seriesId"
            class="rounded border px-4 py-3"
            :class="series.involvesManaged ? 'border-ball-600' : 'border-court-700'"
          >
            <div class="flex items-center justify-between gap-3">
              <div class="flex flex-col gap-1 text-sm">
                <span :class="isWinner(series, series.higherSeedTeamId) ? 'font-semibold' : ''">
                  <span class="mr-2 text-xs text-court-600">{{ series.higherSeed }}</span>
                  {{ series.higherSeedTeamName }}
                </span>
                <span :class="isWinner(series, series.lowerSeedTeamId) ? 'font-semibold' : ''">
                  <span class="mr-2 text-xs text-court-600">{{ series.lowerSeed }}</span>
                  {{ series.lowerSeedTeamName }}
                </span>
              </div>

              <span
                class="text-2xl font-bold tabular-nums"
                :class="series.winnerTeamId ? 'text-ball-400' : 'text-court-300'"
              >
                {{ seriesScore(series) }}
              </span>
            </div>

            <p class="mt-2 flex flex-wrap gap-2 text-xs text-court-300">
              <RouterLink
                v-for="game in series.games"
                :key="game.gameId"
                :to="{ name: 'match', params: { gameId: game.gameId } }"
                class="tabular-nums hover:text-ball-400"
              >
                {{ game.seriesGame }}º {{ game.played ? gameScore(series, game) : '—' }}
              </RouterLink>
              <span v-if="!series.winnerTeamId" class="text-court-600">
                · a {{ winsNeeded(series.bestOf) }} victorias
              </span>
            </p>
          </li>
        </ul>
      </section>
    </template>
  </div>
</template>
