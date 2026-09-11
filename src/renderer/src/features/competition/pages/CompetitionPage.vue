<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import type { FixtureEntry, StandingEntry } from '@shared/contracts/season.contract';
import { useSeasonStore } from '@renderer/features/season/season.store';
import { formatMatchDate } from '@renderer/shared/format';
import PlayoffBracketView from '@renderer/features/competition/components/PlayoffBracketView.vue';

const seasonStore = useSeasonStore();

type Tab = 'standings' | 'fixtures' | 'playoffs';
const tab = ref<Tab>('standings');
const standings = ref<StandingEntry[]>([]);
const fixtures = ref<FixtureEntry[]>([]);
const round = ref(1);

const totalRounds = computed(() => seasonStore.season?.totalRounds ?? 34);
const roundDate = computed(() => fixtures.value[0]?.scheduledOn ?? null);

onMounted(async () => {
  await seasonStore.refresh();
  // Se abre en la jornada en curso, no en la primera: es la que interesa. Y con
  // la liga regular acabada, en el cuadro, que es donde está el juego.
  round.value = seasonStore.season?.currentRound ?? 1;
  if (seasonStore.season && seasonStore.season.stage !== 'regular') {
    tab.value = 'playoffs';
  }
  standings.value = await window.api.season.getStandings();
  await loadRound();
});

watch(round, loadRound);

async function loadRound(): Promise<void> {
  fixtures.value = await window.api.season.listFixtures(round.value);
}

function stepRound(delta: number): void {
  round.value = Math.min(totalRounds.value, Math.max(1, round.value + delta));
}

function streakLabel(streak: number): string {
  if (streak === 0) return '—';
  return `${streak > 0 ? 'V' : 'D'}${Math.abs(streak)}`;
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <div class="flex items-baseline gap-4">
      <h1 class="text-2xl font-semibold">{{ seasonStore.season?.competitionName ?? 'Liga' }}</h1>
      <span v-if="seasonStore.season?.stage === 'regular'" class="text-sm text-court-300">
        Jornada {{ seasonStore.season?.currentRound ?? 1 }} de {{ totalRounds }}
      </span>
      <span
        v-else-if="seasonStore.season?.championTeamName && tab !== 'playoffs'"
        class="text-sm text-court-300"
      >
        Campeón: <span class="text-ball-400">{{ seasonStore.season.championTeamName }}</span>
      </span>
      <span v-else class="text-sm text-ball-400">Playoffs</span>
    </div>

    <nav class="flex gap-1 border-b border-court-700">
      <button
        v-for="option in [
          { id: 'standings' as Tab, label: 'Clasificación' },
          { id: 'fixtures' as Tab, label: 'Calendario' },
          { id: 'playoffs' as Tab, label: 'Playoffs' }
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

    <div v-if="tab === 'standings'" class="overflow-auto rounded border border-court-700">
      <table class="data-table">
        <thead>
          <tr>
            <th class="numeric">#</th>
            <th>Equipo</th>
            <th class="numeric">J</th>
            <th class="numeric">G</th>
            <th class="numeric">P</th>
            <th class="numeric">PF</th>
            <th class="numeric">PC</th>
            <th class="numeric">Dif</th>
            <th class="numeric">Racha</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="row in standings"
            :key="row.teamId"
            :class="row.isManaged ? 'bg-court-800 text-ball-400' : ''"
          >
            <td class="numeric">{{ row.position }}</td>
            <td>{{ row.teamName }}</td>
            <td class="numeric">{{ row.played }}</td>
            <td class="numeric font-semibold">{{ row.won }}</td>
            <td class="numeric">{{ row.lost }}</td>
            <td class="numeric text-court-300">{{ row.pointsFor }}</td>
            <td class="numeric text-court-300">{{ row.pointsAgainst }}</td>
            <td class="numeric" :class="row.pointsDifference >= 0 ? 'text-emerald-400' : ''">
              {{ row.pointsDifference > 0 ? '+' : '' }}{{ row.pointsDifference }}
            </td>
            <td class="numeric text-court-300">{{ streakLabel(row.streak) }}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <PlayoffBracketView v-else-if="tab === 'playoffs'" />

    <div v-else class="flex flex-col gap-3">
      <div class="flex items-center gap-3">
        <button
          type="button"
          class="rounded border border-court-600 px-3 py-1 text-sm hover:bg-court-800"
          @click="stepRound(-1)"
        >
          ‹
        </button>
        <span class="text-sm">
          Jornada {{ round }}
          <span v-if="roundDate" class="text-court-300"> · {{ formatMatchDate(roundDate) }}</span>
        </span>
        <button
          type="button"
          class="rounded border border-court-600 px-3 py-1 text-sm hover:bg-court-800"
          @click="stepRound(1)"
        >
          ›
        </button>
      </div>

      <ul class="flex flex-col gap-1">
        <li
          v-for="fixture in fixtures"
          :key="fixture.gameId"
          class="grid grid-cols-[1fr_6rem_1fr] items-center gap-3 rounded border border-court-700 px-4 py-2 text-sm"
          :class="fixture.involvesManaged ? 'border-ball-600' : ''"
        >
          <span class="text-right">{{ fixture.homeTeamName }}</span>
          <RouterLink
            v-if="fixture.played"
            :to="{ name: 'match', params: { gameId: fixture.gameId } }"
            class="text-center font-semibold tabular-nums hover:text-ball-400"
          >
            {{ fixture.homeScore }} - {{ fixture.awayScore }}
            <span v-if="fixture.overtimes > 0" class="text-xs text-court-300">
              ({{ fixture.overtimes }} pr)
            </span>
          </RouterLink>
          <span v-else class="text-center text-court-600">—</span>
          <span>{{ fixture.awayTeamName }}</span>
        </li>
      </ul>
    </div>
  </div>
</template>
