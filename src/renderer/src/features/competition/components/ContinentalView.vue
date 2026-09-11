<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import type {
  ContinentalSummary,
  ContinentalView,
  PlayoffSeries
} from '@shared/contracts/season.contract';
import { winsNeeded } from '@shared/domain/playoffs';

/**
 * Europa —o América— en una pantalla: la tabla de la fase de liga arriba y el
 * cuadro debajo. Se leen juntas porque una explica a la otra: la tabla dice
 * quién va a entrar en el cuadro y el cuadro dice qué pasó después.
 */

const competitions = ref<ContinentalSummary[]>([]);
const selected = ref<string | null>(null);
const view = ref<ContinentalView | null>(null);
const loaded = ref(false);

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

function seriesScore(series: PlayoffSeries): string {
  return `${series.higherSeedWins}-${series.lowerSeedWins}`;
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
  <div v-if="loaded" class="flex flex-col gap-4">
    <p v-if="!view" class="text-sm text-court-300">
      Las competiciones continentales se sortean al empezar la temporada, con los mejores clubes de
      cada liga del continente. Hace falta un pabellón a la altura para entrar en la primera.
    </p>

    <template v-else>
      <nav v-if="competitions.length > 1" class="flex gap-2">
        <button
          v-for="option in competitions"
          :key="option.competitionId"
          type="button"
          class="rounded border px-3 py-1 text-sm"
          :class="
            selected === option.competitionId
              ? 'border-ball-500 text-ball-400'
              : 'border-court-700 text-court-300 hover:text-court-100'
          "
          @click="selected = option.competitionId"
        >
          {{ option.name }}
          <span v-if="option.involvesManaged" class="text-xs text-court-500">· juegas</span>
        </button>
      </nav>

      <p v-if="view.championTeamName" class="text-lg">
        <span class="text-court-300">Campeón de {{ view.name }}:</span>
        <span class="ml-2 font-semibold text-ball-400">{{ view.championTeamName }}</span>
      </p>

      <section class="flex flex-col gap-2">
        <h2 class="text-sm uppercase tracking-wide text-court-300">
          Fase de liga
          <span class="text-court-600">· pasan los ocho primeros</span>
        </h2>

        <div class="overflow-auto rounded border border-court-700">
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
                <td class="numeric" :class="row.pointsDifference >= 0 ? 'text-emerald-400' : ''">
                  {{ row.pointsDifference > 0 ? '+' : '' }}{{ row.pointsDifference }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <p v-if="view.knockout.rounds.length === 0" class="text-sm text-court-300">
        El cuadro se monta al acabar la fase de liga: cuartos al mejor de tres y Final Four a
        partido único en sede neutral.
      </p>

      <section v-for="round in view.knockout.rounds" :key="round.round" class="flex flex-col gap-2">
        <h2 class="text-sm uppercase tracking-wide text-court-300">
          {{ round.name }}
          <span class="text-court-600">
            {{ round.bestOf > 1 ? `· al mejor de ${round.bestOf}` : '· a partido único' }}
          </span>
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
                <span
                  :class="series.winnerTeamId === series.higherSeedTeamId ? 'font-semibold' : ''"
                >
                  <span class="mr-2 text-xs text-court-600">{{ series.higherSeed }}</span>
                  {{ series.higherSeedTeamName }}
                </span>
                <span
                  :class="series.winnerTeamId === series.lowerSeedTeamId ? 'font-semibold' : ''"
                >
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
              <span v-if="!series.winnerTeamId && series.bestOf > 1" class="text-court-600">
                · a {{ winsNeeded(series.bestOf) }} victorias
              </span>
            </p>
          </li>
        </ul>
      </section>
    </template>
  </div>
</template>
