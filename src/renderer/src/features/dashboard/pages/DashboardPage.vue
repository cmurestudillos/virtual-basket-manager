<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import type {
  FixtureEntry,
  PlayoffBracket,
  StandingEntry
} from '@shared/contracts/season.contract';
import type { TeamSummary } from '@shared/contracts/teams.contract';
import type { BoardView } from '@shared/contracts/club.contract';
import { DANGER_CONFIDENCE, SEASON_VERDICT_LABELS } from '@shared/domain/board';
import { AppButton, AppPageHeader, AppSectionTitle, AppStat } from '@renderer/shared/ui';
import { useGameStateStore } from '@renderer/shared/game-state.store';
import { useSeasonStore } from '@renderer/features/season/season.store';
import { formatMatchDate, formatMoney } from '@renderer/shared/format';

const router = useRouter();
const gameState = useGameStateStore();
const seasonStore = useSeasonStore();

const team = ref<TeamSummary | null>(null);
const standings = ref<StandingEntry[]>([]);
const recent = ref<FixtureEntry[]>([]);
const playoffs = ref<PlayoffBracket | null>(null);
const board = ref<BoardView | null>(null);

const myPosition = computed(() => standings.value.find((row) => row.isManaged));
const stage = computed(() => seasonStore.season?.stage ?? 'regular');

/** La eliminatoria que juega el equipo del usuario ahora mismo, si la juega. */
const currentSeries = computed(() => {
  const seriesId = seasonStore.nextGame?.seriesId;
  if (!seriesId) {
    return null;
  }
  return (
    playoffs.value?.rounds
      .flatMap((round) => round.series)
      .find((series) => series.seriesId === seriesId) ?? null
  );
});

/** «Jornada 12» en liga, «Cuartos de final · 2º partido (1-0)» en playoffs. */
const nextGameLabel = computed(() => {
  const next = seasonStore.nextGame;
  if (!next) {
    return '';
  }
  const series = currentSeries.value;
  if (!series) {
    return `Jornada ${next.round}`;
  }

  const managedIsHigher = series.higherSeedTeamId === gameState.state?.teamId;
  const own = managedIsHigher ? series.higherSeedWins : series.lowerSeedWins;
  const rival = managedIsHigher ? series.lowerSeedWins : series.higherSeedWins;
  return `${series.roundName} · ${next.seriesGame}º partido (${own}-${rival})`;
});

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
  // El cuadro sólo existe cuando acaba la liga regular; antes no hay nada que pedir.
  playoffs.value = stage.value === 'regular' ? null : await window.api.season.getPlayoffs();
  board.value = await window.api.club.getBoard();
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

async function startNextSeason(): Promise<void> {
  await seasonStore.startNextSeason();
  playoffs.value = null;
  await reload();
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

/** Etiqueta corta de un partido en la lista de últimos resultados. */
function fixtureRound(fixture: FixtureEntry): string {
  return fixture.seriesId ? `PO${fixture.seriesGame}` : `J${fixture.round}`;
}
</script>

<template>
  <div v-if="team" class="flex flex-col gap-6">
    <AppPageHeader :title="team.name" />

    <div class="grid grid-cols-4 gap-4">
      <AppStat label="Clasificación" tone="accent" boxed>
        {{ myPosition ? `${myPosition.position}º` : '—' }}
        <template v-if="myPosition" #note>{{ myPosition.won }}-{{ myPosition.lost }}</template>
      </AppStat>

      <AppStat
        :label="stage === 'regular' ? 'Jornada' : 'Fase'"
        :tone="stage === 'regular' ? null : 'accent'"
        boxed
      >
        <template v-if="stage === 'regular'">
          {{ seasonStore.season?.currentRound ?? 1 }}
          <span class="text-base text-court-300"
            >/ {{ seasonStore.season?.totalRounds ?? 34 }}</span
          >
        </template>
        <template v-else>{{ stage === 'playoffs' ? 'Playoffs' : 'Terminada' }}</template>
      </AppStat>

      <AppStat label="Caja" size="md" :tone="team.budgetCents < 0 ? 'bad' : null" boxed>
        {{ formatMoney(team.budgetCents) }}
        <template #note>
          <RouterLink :to="{ name: 'finances' }" class="hover:text-ball-400"
            >Ver finanzas</RouterLink
          >
        </template>
      </AppStat>

      <AppStat label="Pabellón" size="md" boxed>
        {{ team.pavilionName }}
        <template #note>{{ team.pavilionCapacity }} espectadores</template>
      </AppStat>
    </div>

    <!-- El consejo -->
    <section
      v-if="board"
      class="rounded border px-5 py-4"
      :class="board.dismissed ? 'border-bad-500' : 'border-court-700'"
    >
      <div class="flex items-center justify-between gap-6">
        <div>
          <AppSectionTitle>El consejo</AppSectionTitle>
          <p v-if="board.dismissed" class="mt-1 text-lg text-bad-400">
            Te han destituido. La partida se queda como está.
          </p>
          <template v-else>
            <p class="mt-1 text-lg">{{ board.objectiveLabel }}</p>
            <p class="text-sm text-court-300">
              Hace falta acabar {{ board.targetPosition }}º o mejor ·
              {{ SEASON_VERDICT_LABELS[board.verdict].toLowerCase() }} con lo de ahora
            </p>
          </template>
        </div>
        <AppStat
          label="Confianza"
          class="text-right"
          :tone="board.confidence >= DANGER_CONFIDENCE ? 'accent' : 'bad'"
          :note="board.confidenceLabel"
        >
          {{ board.confidence }}
        </AppStat>
      </div>
    </section>

    <section v-if="!board?.dismissed" class="rounded border border-court-700 p-5">
      <AppSectionTitle>
        {{ stage === 'finished' ? 'Temporada terminada' : 'Próximo partido' }}
      </AppSectionTitle>

      <!-- Hay partido propio pendiente: lo normal durante toda la temporada. -->
      <div v-if="seasonStore.nextGame" class="mt-3 flex items-center justify-between">
        <div>
          <p class="text-xl">
            {{ seasonStore.nextGame.homeTeamName }}
            <span class="text-court-600">vs</span>
            {{ seasonStore.nextGame.awayTeamName }}
          </p>
          <p class="text-sm text-court-300">
            {{ nextGameLabel }} · {{ formatMatchDate(seasonStore.nextGame.scheduledOn) }}
          </p>
        </div>
        <div class="flex gap-2">
          <AppButton :disabled="seasonStore.busy" @click="advance('day')"> Avanzar día </AppButton>
          <AppButton :disabled="seasonStore.busy" @click="advance('nextGame')">
            Ir a la jornada
          </AppButton>
          <AppButton variant="primary" @click="playNextGame">Jugar partido</AppButton>
        </div>
      </div>

      <!-- Temporada cerrada: hay campeón y toca empezar la siguiente. -->
      <div v-else-if="stage === 'finished'" class="mt-3 flex items-center justify-between">
        <div>
          <p class="text-xl">
            Campeón:
            <span class="font-semibold text-ball-400">
              {{ seasonStore.season?.championTeamName ?? '—' }}
            </span>
          </p>
          <p class="text-sm text-court-300">
            Temporada {{ seasonStore.season?.seasonNumber }} ·
            {{ seasonStore.season?.startYear }}-{{ (seasonStore.season?.startYear ?? 0) + 1 }}
          </p>
        </div>
        <AppButton variant="primary" :disabled="seasonStore.busy" @click="startNextSeason">
          Empezar temporada {{ (seasonStore.season?.seasonNumber ?? 1) + 1 }}
        </AppButton>
      </div>

      <!-- Sin partido propio, pero la competición sigue: eliminado o sin playoffs. -->
      <div v-else class="mt-3 flex items-center justify-between">
        <p class="text-court-300">
          {{
            stage === 'playoffs'
              ? 'Tu equipo ya no está en el cuadro. Los playoffs siguen sin ti.'
              : 'No queda ningún partido tuyo por jugar.'
          }}
        </p>
        <AppButton :disabled="seasonStore.busy" @click="advance('nextGame')">Avanzar</AppButton>
      </div>
    </section>

    <section v-if="recent.length > 0" class="rounded border border-court-700 p-5">
      <AppSectionTitle>Últimos resultados</AppSectionTitle>
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
            {{ fixtureRound(fixture) }} · {{ rivalName(fixture) }}
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
