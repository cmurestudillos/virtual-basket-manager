<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import type { BoxScoreLine, MatchState } from '@shared/contracts/match.contract';
import { percentage } from '@shared/domain/box-score';
import { useSeasonStore } from '@renderer/features/season/season.store';
import { formatMatchDate, formatPlayedMinutes } from '@renderer/shared/format';

const route = useRoute();
const seasonStore = useSeasonStore();

const state = ref<MatchState | null>(null);
const busy = ref(false);
/** Sólo se puede jugar el partido si el usuario está en él. */
const playable = computed(() => state.value?.managedSide !== null && !state.value?.finished);

const buttonLabel = computed(() => {
  const played = state.value?.playedPeriods ?? 0;
  const regulation = state.value?.regulationPeriods ?? 4;
  if (played === 0) return 'Jugar 1er cuarto';
  if (played < regulation) return `Jugar ${played + 1}º cuarto`;
  return `Jugar prórroga ${played - regulation + 1}`;
});

onMounted(load);

async function load(): Promise<void> {
  const gameId = String(route.params.gameId);
  // Un partido ya jugado se lee del acta guardada; uno pendiente se prepara.
  const stored = await window.api.match.get(gameId);
  state.value = stored ?? (await window.api.match.start(gameId));
}

async function advance(): Promise<void> {
  if (!state.value || busy.value) {
    return;
  }
  busy.value = true;
  try {
    state.value = await window.api.match.advancePeriod(state.value.gameId);
    if (state.value.finished) {
      // El partido ya cuenta para la clasificación: la cabecera y el próximo
      // partido de la temporada tienen que enterarse.
      await seasonStore.refresh();
    }
  } finally {
    busy.value = false;
  }
}

function shooting(line: BoxScoreLine): string {
  const made = line.twoPointMade + line.threePointMade;
  const attempted = line.twoPointAttempted + line.threePointAttempted;
  return `${made}/${attempted}`;
}

function teamTotal(lines: readonly BoxScoreLine[], key: keyof BoxScoreLine): number {
  return lines.reduce((sum, line) => sum + (line[key] as number), 0);
}

function teamShootingPercentage(lines: readonly BoxScoreLine[]): number {
  const made = teamTotal(lines, 'twoPointMade') + teamTotal(lines, 'threePointMade');
  const attempted = teamTotal(lines, 'twoPointAttempted') + teamTotal(lines, 'threePointAttempted');
  return percentage(made, attempted);
}
</script>

<template>
  <div v-if="state" class="flex flex-col gap-5">
    <header class="flex items-center justify-between">
      <div>
        <p class="text-sm text-court-300">
          {{ state.roundLabel }} · {{ formatMatchDate(state.scheduledOn) }}
        </p>
      </div>
      <RouterLink :to="{ name: 'dashboard' }" class="text-sm text-court-300 hover:text-court-100">
        Volver al club
      </RouterLink>
    </header>

    <!-- Marcador -->
    <section class="rounded border border-court-700 bg-court-900 p-6">
      <div class="grid grid-cols-[1fr_auto_1fr] items-center gap-6">
        <div class="text-right">
          <p class="text-xl" :class="state.managedSide === 'home' ? 'text-ball-400' : ''">
            {{ state.home.teamName }}
          </p>
        </div>
        <p class="text-5xl font-bold tabular-nums">
          {{ state.home.score }} <span class="text-court-600">-</span> {{ state.away.score }}
        </p>
        <div>
          <p class="text-xl" :class="state.managedSide === 'away' ? 'text-ball-400' : ''">
            {{ state.away.teamName }}
          </p>
        </div>
      </div>

      <!-- Parciales por cuarto -->
      <table v-if="state.periods.length > 0" class="mx-auto mt-5 text-sm">
        <thead>
          <tr class="text-court-300">
            <th class="px-3 py-1 text-left"></th>
            <th v-for="period in state.periods" :key="period.period" class="px-3 py-1 text-center">
              {{ period.period > state.regulationPeriods ? 'PR' : `${period.period}º` }}
            </th>
          </tr>
        </thead>
        <tbody class="tabular-nums">
          <tr>
            <td class="px-3 py-1 text-court-300">{{ state.home.teamName }}</td>
            <td v-for="period in state.periods" :key="period.period" class="px-3 py-1 text-center">
              {{ period.home }}
            </td>
          </tr>
          <tr>
            <td class="px-3 py-1 text-court-300">{{ state.away.teamName }}</td>
            <td v-for="period in state.periods" :key="period.period" class="px-3 py-1 text-center">
              {{ period.away }}
            </td>
          </tr>
        </tbody>
      </table>

      <div class="mt-6 flex justify-center">
        <button
          v-if="playable"
          type="button"
          :disabled="busy"
          class="rounded bg-ball-600 px-8 py-3 text-lg font-semibold hover:bg-ball-500 disabled:bg-court-700"
          @click="advance"
        >
          {{ busy ? 'Jugando…' : buttonLabel }}
        </button>
        <p v-else-if="state.finished" class="text-sm text-court-300">Partido finalizado</p>
        <p v-else class="text-sm text-court-300">Partido de otros equipos</p>
      </div>
    </section>

    <!-- Actas -->
    <section v-if="state.playedPeriods > 0" class="grid grid-cols-2 gap-4">
      <div
        v-for="side in [state.home, state.away]"
        :key="side.teamId"
        class="overflow-auto rounded border border-court-700"
      >
        <h2
          class="flex items-baseline justify-between border-b border-court-700 bg-court-900 px-4 py-2"
        >
          <span class="text-sm">{{ side.teamName }}</span>
          <span class="text-xs text-court-300">
            TC {{ teamShootingPercentage(side.boxScores) }}% ·
            {{ teamTotal(side.boxScores, 'assists') }} as ·
            {{
              teamTotal(side.boxScores, 'offensiveRebounds') +
              teamTotal(side.boxScores, 'defensiveRebounds')
            }}
            reb
          </span>
        </h2>
        <table class="data-table">
          <thead>
            <tr>
              <th>Jugador</th>
              <th class="numeric">Min</th>
              <th class="numeric">Pts</th>
              <th class="numeric">TC</th>
              <th class="numeric">T3</th>
              <th class="numeric">TL</th>
              <th class="numeric">Reb</th>
              <th class="numeric">As</th>
              <th class="numeric">Val</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="line in side.boxScores"
              :key="line.playerId"
              :class="line.secondsPlayed === 0 ? 'text-court-600' : ''"
            >
              <td>
                <span class="text-ball-400">{{ line.position }}</span>
                <RouterLink
                  :to="{ name: 'player', params: { playerId: line.playerId } }"
                  class="ml-2 hover:text-ball-400"
                >
                  {{ line.playerName }}
                </RouterLink>
              </td>
              <td class="numeric">{{ formatPlayedMinutes(line.secondsPlayed) }}</td>
              <td class="numeric font-semibold">{{ line.points }}</td>
              <td class="numeric">{{ shooting(line) }}</td>
              <td class="numeric">{{ line.threePointMade }}/{{ line.threePointAttempted }}</td>
              <td class="numeric">{{ line.freeThrowMade }}/{{ line.freeThrowAttempted }}</td>
              <td class="numeric">{{ line.offensiveRebounds + line.defensiveRebounds }}</td>
              <td class="numeric">{{ line.assists }}</td>
              <td class="numeric" :class="line.efficiency >= 15 ? 'text-emerald-400' : ''">
                {{ line.efficiency }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <!-- Previa: todavía no se ha jugado nada -->
    <section v-else class="rounded border border-court-700 p-5">
      <h2 class="text-sm uppercase tracking-wide text-court-300">Previa</h2>
      <div class="mt-3 grid grid-cols-2 gap-6">
        <div v-for="side in [state.home, state.away]" :key="side.teamId">
          <p class="mb-2 text-sm">{{ side.teamName }} · cinco inicial</p>
          <ul class="flex flex-col gap-1 text-sm">
            <li
              v-for="line in side.boxScores.slice(0, 5)"
              :key="line.playerId"
              class="flex gap-2 text-court-300"
            >
              <span class="w-6 text-ball-400">{{ line.position }}</span>
              <span>{{ line.playerName }}</span>
            </li>
          </ul>
        </div>
      </div>
    </section>
  </div>
</template>
