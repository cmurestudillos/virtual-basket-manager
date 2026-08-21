<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import type { FixtureEntry, StandingEntry } from '@shared/contracts/season.contract';
import type { TeamSummary } from '@shared/contracts/teams.contract';
import { useGameStateStore } from '@renderer/shared/game-state.store';
import { useSeasonStore } from '@renderer/features/season/season.store';
import { formatMatchDate, formatMoney } from '@renderer/shared/format';

const router = useRouter();
const gameState = useGameStateStore();
const seasonStore = useSeasonStore();

const team = ref<TeamSummary | null>(null);
const standings = ref<StandingEntry[]>([]);
const recent = ref<FixtureEntry[]>([]);

const myPosition = computed(() => standings.value.find((row) => row.isManaged));

onMounted(async () => {
  if (!gameState.state) {
    await gameState.refresh();
  }
  await seasonStore.refresh();
  await reload();
});

async function reload(): Promise<void> {
  if (!gameState.state) {
    return;
  }
  team.value = await window.api.teams.get(gameState.state.teamId);
  standings.value = await window.api.season.getStandings();
  recent.value = (await window.api.season.listTeamFixtures(gameState.state.teamId))
    .filter((fixture) => fixture.played)
    .slice(-5)
    .reverse();
}

async function advance(mode: 'day' | 'nextGame'): Promise<void> {
  const gameId = await seasonStore.advance(mode);
  if (gameId) {
    await router.push({ name: 'match', params: { gameId } });
    return;
  }
  await reload();
}

function playNextGame(): void {
  if (seasonStore.nextGame) {
    void router.push({ name: 'match', params: { gameId: seasonStore.nextGame.gameId } });
  }
}

/** Resultado desde el punto de vista del equipo del usuario: `V 82-71`. */
function resultLabel(fixture: FixtureEntry): string {
  const isHome = fixture.homeTeamId === gameState.state?.teamId;
  const own = isHome ? fixture.homeScore : fixture.awayScore;
  const rival = isHome ? fixture.awayScore : fixture.homeScore;
  return `${(own ?? 0) > (rival ?? 0) ? 'V' : 'D'} ${own}-${rival}`;
}

function rivalName(fixture: FixtureEntry): string {
  const isHome = fixture.homeTeamId === gameState.state?.teamId;
  return `${isHome ? '' : '@ '}${isHome ? fixture.awayTeamName : fixture.homeTeamName}`;
}
</script>

<template>
  <div v-if="team" class="flex flex-col gap-6">
    <h1 class="text-2xl font-semibold">{{ team.name }}</h1>

    <div class="grid grid-cols-4 gap-4">
      <article class="rounded border border-court-700 p-4">
        <p class="text-xs uppercase tracking-wide text-court-300">Clasificación</p>
        <p class="mt-1 text-2xl font-semibold text-ball-500">
          {{ myPosition ? `${myPosition.position}º` : '—' }}
        </p>
        <p v-if="myPosition" class="text-sm text-court-300">
          {{ myPosition.won }}-{{ myPosition.lost }}
        </p>
      </article>
      <article class="rounded border border-court-700 p-4">
        <p class="text-xs uppercase tracking-wide text-court-300">Jornada</p>
        <p class="mt-1 text-2xl font-semibold">
          {{ seasonStore.season?.currentRound ?? 1 }}
          <span class="text-base text-court-300"
            >/ {{ seasonStore.season?.totalRounds ?? 34 }}</span
          >
        </p>
      </article>
      <article class="rounded border border-court-700 p-4">
        <p class="text-xs uppercase tracking-wide text-court-300">Presupuesto</p>
        <p class="mt-1 text-lg">{{ formatMoney(team.budgetCents) }}</p>
      </article>
      <article class="rounded border border-court-700 p-4">
        <p class="text-xs uppercase tracking-wide text-court-300">Pabellón</p>
        <p class="mt-1 text-lg">{{ team.pavilionName }}</p>
        <p class="text-sm text-court-300">{{ team.pavilionCapacity }} espectadores</p>
      </article>
    </div>

    <section class="rounded border border-court-700 p-5">
      <h2 class="text-sm uppercase tracking-wide text-court-300">Próximo partido</h2>

      <div v-if="seasonStore.nextGame" class="mt-3 flex items-center justify-between">
        <div>
          <p class="text-xl">
            {{ seasonStore.nextGame.homeTeamName }}
            <span class="text-court-600">vs</span>
            {{ seasonStore.nextGame.awayTeamName }}
          </p>
          <p class="text-sm text-court-300">
            Jornada {{ seasonStore.nextGame.round }} ·
            {{ formatMatchDate(seasonStore.nextGame.scheduledOn) }}
          </p>
        </div>
        <div class="flex gap-2">
          <button
            type="button"
            :disabled="seasonStore.busy"
            class="rounded border border-court-600 px-4 py-2 text-sm hover:bg-court-800 disabled:opacity-50"
            @click="advance('day')"
          >
            Avanzar día
          </button>
          <button
            type="button"
            :disabled="seasonStore.busy"
            class="rounded border border-court-600 px-4 py-2 text-sm hover:bg-court-800 disabled:opacity-50"
            @click="advance('nextGame')"
          >
            Ir a la jornada
          </button>
          <button
            type="button"
            class="rounded bg-ball-600 px-5 py-2 font-semibold hover:bg-ball-500"
            @click="playNextGame"
          >
            Jugar partido
          </button>
        </div>
      </div>

      <p v-else class="mt-3 text-court-300">La temporada ha terminado.</p>
    </section>

    <section v-if="recent.length > 0" class="rounded border border-court-700 p-5">
      <h2 class="text-sm uppercase tracking-wide text-court-300">Últimos resultados</h2>
      <ul class="mt-3 flex flex-col gap-2">
        <li
          v-for="fixture in recent"
          :key="fixture.gameId"
          class="flex items-center justify-between text-sm"
        >
          <RouterLink
            :to="{ name: 'match', params: { gameId: fixture.gameId } }"
            class="hover:text-ball-400"
          >
            J{{ fixture.round }} · {{ rivalName(fixture) }}
          </RouterLink>
          <span
            class="tabular-nums"
            :class="resultLabel(fixture).startsWith('V') ? 'text-emerald-400' : 'text-court-300'"
          >
            {{ resultLabel(fixture) }}
          </span>
        </li>
      </ul>
    </section>
  </div>
</template>
