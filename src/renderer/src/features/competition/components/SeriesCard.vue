<script setup lang="ts">
import { computed } from 'vue';
import type { PlayoffSeries } from '@shared/contracts/season.contract';
import { winsNeeded } from '@shared/domain/playoffs';
import MatchupCard, {
  type MatchupSide
} from '@renderer/features/competition/components/MatchupCard.vue';

/**
 * Una eliminatoria del cuadro, sea de playoffs, de Europa o de lo que venga.
 *
 * Estaba escrita dos veces —una en el cuadro nacional y otra en el europeo— y
 * eso fue lo que destapó que hacía falta un kit: dos copias del mismo bloque
 * es una que se va a quedar atrás en cuanto alguien toque la otra.
 *
 * Con la piel de IBM es un `MatchupCard` con las victorias de cada uno y,
 * debajo, los partidos jugados, que llevan a su acta.
 */

const props = defineProps<{ series: PlayoffSeries }>();

const sides = computed<[MatchupSide, MatchupSide]>(() => [
  {
    teamId: props.series.higherSeedTeamId,
    name: props.series.higherSeedTeamName,
    seed: props.series.higherSeed,
    value: props.series.higherSeedWins,
    winner: props.series.winnerTeamId === props.series.higherSeedTeamId
  },
  {
    teamId: props.series.lowerSeedTeamId,
    name: props.series.lowerSeedTeamName,
    seed: props.series.lowerSeed,
    value: props.series.lowerSeedWins,
    winner: props.series.winnerTeamId === props.series.lowerSeedTeamId
  }
]);

/** Resultado de un partido visto desde el mejor clasificado, que va arriba. */
function gameScore(game: PlayoffSeries['games'][number]): string {
  const higherIsHome = game.homeTeamId === props.series.higherSeedTeamId;
  const own = higherIsHome ? game.homeScore : game.awayScore;
  const rival = higherIsHome ? game.awayScore : game.homeScore;
  return `${own}-${rival}`;
}
</script>

<template>
  <MatchupCard :sides="sides" :highlighted="series.involvesManaged">
    <RouterLink
      v-for="game in series.games"
      :key="game.gameId"
      :to="{ name: 'match', params: { gameId: game.gameId } }"
      class="figure text-tv-blue-ink hover:underline"
    >
      {{ game.seriesGame }}º {{ game.played ? gameScore(game) : '-' }}
    </RouterLink>
    <span v-if="!series.winnerTeamId && series.bestOf > 1" class="text-tv-muted">
      a {{ winsNeeded(series.bestOf) }} victorias
    </span>
  </MatchupCard>
</template>
