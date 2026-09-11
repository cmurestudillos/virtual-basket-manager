<script setup lang="ts">
import { computed } from 'vue';
import type { PlayoffSeries } from '@shared/contracts/season.contract';
import { winsNeeded } from '@shared/domain/playoffs';

/**
 * Una eliminatoria del cuadro, sea de playoffs, de Europa o de lo que venga.
 *
 * Estaba escrita dos veces —una en el cuadro nacional y otra en el europeo— y
 * eso fue lo que destapó que hacía falta un kit: dos copias del mismo bloque
 * es una que se va a quedar atrás en cuanto alguien toque la otra.
 */

const props = defineProps<{ series: PlayoffSeries }>();

/** Marcador de la serie desde el lado del mejor clasificado: `2-1`. */
const score = computed(() => `${props.series.higherSeedWins}-${props.series.lowerSeedWins}`);

/** Resultado de un partido visto también desde el mejor clasificado. */
function gameScore(game: PlayoffSeries['games'][number]): string {
  const higherIsHome = game.homeTeamId === props.series.higherSeedTeamId;
  const own = higherIsHome ? game.homeScore : game.awayScore;
  const rival = higherIsHome ? game.awayScore : game.homeScore;
  return `${own}-${rival}`;
}
</script>

<template>
  <li
    class="rounded border px-4 py-3"
    :class="series.involvesManaged ? 'border-ball-600' : 'border-court-700'"
  >
    <div class="flex items-center justify-between gap-3">
      <div class="flex flex-col gap-1 text-sm">
        <span :class="series.winnerTeamId === series.higherSeedTeamId ? 'font-semibold' : ''">
          <span class="mr-2 text-xs text-court-600">{{ series.higherSeed }}</span>
          {{ series.higherSeedTeamName }}
        </span>
        <span :class="series.winnerTeamId === series.lowerSeedTeamId ? 'font-semibold' : ''">
          <span class="mr-2 text-xs text-court-600">{{ series.lowerSeed }}</span>
          {{ series.lowerSeedTeamName }}
        </span>
      </div>

      <span
        class="figure text-2xl font-bold"
        :class="series.winnerTeamId ? 'text-ball-400' : 'text-court-300'"
      >
        {{ score }}
      </span>
    </div>

    <p class="mt-2 flex flex-wrap gap-2 text-xs text-court-300">
      <RouterLink
        v-for="game in series.games"
        :key="game.gameId"
        :to="{ name: 'match', params: { gameId: game.gameId } }"
        class="figure hover:text-ball-400"
      >
        {{ game.seriesGame }}º {{ game.played ? gameScore(game) : '—' }}
      </RouterLink>
      <span v-if="!series.winnerTeamId && series.bestOf > 1" class="text-court-600">
        · a {{ winsNeeded(series.bestOf) }} victorias
      </span>
    </p>
  </li>
</template>
