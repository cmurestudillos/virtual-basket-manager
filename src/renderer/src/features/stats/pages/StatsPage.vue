<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import type { LeaderBoard, PlayerSeasonStats } from '@shared/contracts/stats.contract';
import { LEADER_CATEGORY_LABELS, type LeaderCategory } from '@shared/domain/season-stats';
import { useGameStateStore } from '@renderer/shared/game-state.store';

const store = useGameStateStore();

type Tab = 'team' | 'leaders';
const tab = ref<Tab>('team');
const team = ref<PlayerSeasonStats[]>([]);
const board = ref<LeaderBoard | null>(null);
const category = ref<LeaderCategory>('points');

const categories = Object.entries(LEADER_CATEGORY_LABELS) as [LeaderCategory, string][];

onMounted(async () => {
  if (!store.state) {
    await store.refresh();
  }
  if (store.state) {
    team.value = await window.api.stats.teamSeason(store.state.teamId);
  }
  await loadLeaders();
});

watch(category, loadLeaders);

async function loadLeaders(): Promise<void> {
  board.value = await window.api.stats.leaders(category.value, 10);
}

/** Media con un decimal fijo: una tabla con 7 y 7,3 mezclados no se lee. */
function average(value: number): string {
  return value.toFixed(1);
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <h1 class="text-2xl font-semibold">Estadísticas</h1>

    <nav class="flex gap-1 border-b border-court-700">
      <button
        v-for="option in [
          { id: 'team' as Tab, label: 'Mi equipo' },
          { id: 'leaders' as Tab, label: 'Líderes de la liga' }
        ]"
        :key="option.id"
        type="button"
        class="border-b-2 px-4 py-2 text-sm"
        :class="
          tab === option.id
            ? 'border-ball-500 text-ball-400'
            : 'border-transparent text-court-300 hover:text-court-100'
        "
        @click="tab = option.id"
      >
        {{ option.label }}
      </button>
    </nav>

    <div v-if="tab === 'team'" class="flex flex-col gap-2">
      <p v-if="team.length === 0" class="text-sm text-court-300">
        Todavía no se ha jugado ningún partido de liga.
      </p>

      <div v-else class="overflow-auto rounded border border-court-700">
        <table class="data-table">
          <thead>
            <tr>
              <th>Jugador</th>
              <th>Pos</th>
              <th class="numeric">PJ</th>
              <th class="numeric">Min</th>
              <th class="numeric">Pts</th>
              <th class="numeric">Reb</th>
              <th class="numeric">Asi</th>
              <th class="numeric">Rob</th>
              <th class="numeric">Tap</th>
              <th class="numeric">Per</th>
              <th class="numeric">T2%</th>
              <th class="numeric">T3%</th>
              <th class="numeric">TL%</th>
              <th class="numeric">Val</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in team" :key="row.playerId">
              <td>
                <RouterLink
                  :to="{ name: 'player', params: { playerId: row.playerId } }"
                  class="hover:text-ball-400"
                >
                  {{ row.playerName }}
                </RouterLink>
              </td>
              <td class="text-court-300">{{ row.position }}</td>
              <td class="numeric">{{ row.games }}</td>
              <td class="numeric text-court-300">{{ average(row.minutesPerGame) }}</td>
              <td class="numeric font-semibold">{{ average(row.pointsPerGame) }}</td>
              <td class="numeric">{{ average(row.reboundsPerGame) }}</td>
              <td class="numeric">{{ average(row.assistsPerGame) }}</td>
              <td class="numeric">{{ average(row.stealsPerGame) }}</td>
              <td class="numeric">{{ average(row.blocksPerGame) }}</td>
              <td class="numeric text-court-300">{{ average(row.turnoversPerGame) }}</td>
              <td class="numeric text-court-300">{{ average(row.twoPointPercentage) }}</td>
              <td class="numeric text-court-300">{{ average(row.threePointPercentage) }}</td>
              <td class="numeric text-court-300">{{ average(row.freeThrowPercentage) }}</td>
              <td class="numeric font-semibold text-ball-400">
                {{ average(row.efficiencyPerGame) }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <div v-else class="flex flex-col gap-3">
      <div class="flex flex-wrap gap-1">
        <button
          v-for="[id, label] in categories"
          :key="id"
          type="button"
          class="rounded border px-3 py-1 text-sm"
          :class="
            category === id
              ? 'border-ball-500 text-ball-400'
              : 'border-court-700 text-court-300 hover:bg-court-800'
          "
          @click="category = id"
        >
          {{ label }}
        </button>
      </div>

      <p v-if="board" class="text-xs text-court-600">
        Por partido, con un mínimo de {{ board.minimumGames }}
        {{ board.minimumGames === 1 ? 'partido jugado' : 'partidos jugados' }}.
      </p>

      <p v-if="board && board.entries.length === 0" class="text-sm text-court-300">
        Todavía no hay nadie que llegue al mínimo de partidos.
      </p>

      <div v-else-if="board" class="overflow-auto rounded border border-court-700">
        <table class="data-table">
          <thead>
            <tr>
              <th class="numeric">#</th>
              <th>Jugador</th>
              <th>Equipo</th>
              <th class="numeric">PJ</th>
              <th class="numeric">{{ board.label }}</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="entry in board.entries"
              :key="entry.player.playerId"
              :class="entry.player.teamId === store.state?.teamId ? 'bg-court-800' : ''"
            >
              <td class="numeric text-court-300">{{ entry.rank }}</td>
              <td>
                <RouterLink
                  :to="{ name: 'player', params: { playerId: entry.player.playerId } }"
                  class="hover:text-ball-400"
                >
                  {{ entry.player.playerName }}
                </RouterLink>
              </td>
              <td class="text-court-300">{{ entry.player.teamName }}</td>
              <td class="numeric text-court-300">{{ entry.player.games }}</td>
              <td class="numeric font-semibold text-ball-400">{{ average(entry.value) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>
