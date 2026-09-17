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
import type { CareerStatus } from '@shared/contracts/career.contract';
import { DANGER_CONFIDENCE, SEASON_VERDICT_LABELS } from '@shared/domain/board';
import { AppButton, AppFlag, AppPageHeader, AppSectionTitle, AppStat } from '@renderer/shared/ui';
import { useGameStateStore } from '@renderer/shared/game-state.store';
import { useSeasonStore } from '@renderer/features/season/season.store';
import { formatMatchDate, formatMoney } from '@renderer/shared/format';
import CareerOffers from '@renderer/features/career/components/CareerOffers.vue';

const router = useRouter();
const gameState = useGameStateStore();
const seasonStore = useSeasonStore();

const team = ref<TeamSummary | null>(null);
const standings = ref<StandingEntry[]>([]);
const recent = ref<FixtureEntry[]>([]);
const playoffs = ref<PlayoffBracket | null>(null);
const board = ref<BoardView | null>(null);
/**
 * La carrera, si la partida se juega en ese modo. Es lo que convierte el
 * despido en «busca otro banquillo» en vez de en el final de la partida.
 */
const career = ref<CareerStatus | null>(null);
const signing = ref(false);

/** Sin equipo y con clubes preguntando: no hay nada más que hacer hasta firmar. */
const unemployed = computed(() => career.value?.careerMode === true && career.value.unemployed);
/** Sin club pero con selección: sus partidos se siguen dirigiendo. */
const nationalOnly = computed(() => unemployed.value && Boolean(career.value?.nationalTeamName));

/** Una federación te quiere: se acepta sin dejar el club. */
async function acceptNational(teamId: string): Promise<void> {
  if (signing.value) {
    return;
  }
  signing.value = true;
  try {
    career.value = await window.api.career.acceptNational(teamId);
    await seasonStore.refresh();
  } finally {
    signing.value = false;
  }
}

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
  if ([next.homeTeamId, next.awayTeamId].some((id) => id.startsWith('seleccion-'))) {
    return 'Partido de selección';
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

/**
 * La jornada de liga que toca, si el próximo partido del club llega después de
 * ella. Es la semana de descanso de una liga impar —el club no juega esa
 * jornada— o, con el partido propio ya jugado, el resto de la jornada por
 * simular. En los dos casos el partido siguiente todavía no se puede empezar.
 */
const roundBeforeNextGame = computed(() => {
  const round = seasonStore.season?.nextRound;
  if (stage.value !== 'regular' || !round || unemployed.value) {
    return null;
  }
  const next = seasonStore.nextGame;
  return !next || next.scheduledOn > round.scheduledOn ? round : null;
});
/** Semana de descanso: la jornada se juega sin el club. */
const restingRound = computed(() =>
  roundBeforeNextGame.value?.managedRests ? roundBeforeNextGame.value : null
);

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
  career.value = await window.api.career.getStatus();
}

/** Coge el banquillo ofrecido y vuelve a cargar el club, que ya es otro. */
async function acceptOffer(teamId: string): Promise<void> {
  if (signing.value) {
    return;
  }
  signing.value = true;
  try {
    career.value = await window.api.career.accept(teamId);
    await gameState.refresh();
    await seasonStore.refresh();
    await reload();
  } finally {
    signing.value = false;
  }
}

/**
 * Un mes en el paro. El reloj corre sin banquillo —la IA juega todo— y a la
 * vuelta hay otros clubes con el suyo abierto.
 */
async function waitAMonth(): Promise<void> {
  if (signing.value) {
    return;
  }
  signing.value = true;
  try {
    career.value = await window.api.career.wait();
    await gameState.refresh();
    await seasonStore.refresh();
    await reload();
  } finally {
    signing.value = false;
  }
}

/** Ofertas teniendo equipo: sólo al cerrar la temporada, y sólo si alguien tienta. */
const employedOffers = computed(
  () =>
    career.value?.careerMode === true &&
    !career.value.unemployed &&
    career.value.offersWhileEmployed &&
    career.value.offers.length > 0
);

async function advance(mode: 'day' | 'nextGame'): Promise<void> {
  const gameId = await seasonStore.advance(mode);
  if (gameId) {
    await router.push({ name: 'match', params: { gameId } });
    return;
  }
  await reload();
}

async function playNextGame(): Promise<void> {
  // Con la jornada de antes a medias, el partido no se puede empezar todavía:
  // primero se juega lo que queda de ella, igual que con «Ir a la jornada».
  if (roundBeforeNextGame.value) {
    const gameId = await seasonStore.advance('nextGame');
    if (gameId) {
      await router.push({ name: 'match', params: { gameId } });
      return;
    }
    await reload();
    if (roundBeforeNextGame.value) {
      return;
    }
  }
  if (seasonStore.nextGame) {
    await router.push({ name: 'match', params: { gameId: seasonStore.nextGame.gameId } });
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

    <!-- Sin equipo, lo primero es elegir banquillo; con él, quién te busca en verano. -->
    <CareerOffers
      v-if="career && (unemployed || employedOffers)"
      :offers="career.offers"
      :reputation-label="career.reputationLabel"
      :busy="signing"
      :employed="!unemployed"
      :can-wait="career.canWait"
      :current-date="career.currentDate"
      @accept="acceptOffer"
      @wait="waitAMonth"
    />

    <!-- El consejo -->
    <section
      v-if="board && !unemployed"
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

    <!-- Federaciones que buscan seleccionador: se lleva a la vez que el club. -->
    <section
      v-if="career && career.nationalOffers.length > 0"
      class="rounded border border-court-700 p-5"
    >
      <AppSectionTitle>Selecciones que te buscan</AppSectionTitle>
      <p class="mt-1 text-sm text-court-300">
        Tras el Mundial hay federaciones sin seleccionador. Una selección se dirige a la vez que el
        club{{ career.nationalTeamName ? `; aceptar es dejar ${career.nationalTeamName}` : '' }}.
      </p>
      <ul class="mt-3 flex flex-col gap-2">
        <li
          v-for="offer in career.nationalOffers"
          :key="offer.teamId"
          class="flex flex-wrap items-center justify-between gap-4 rounded border border-court-700 px-4 py-3"
        >
          <div class="flex items-center gap-3">
            <AppFlag :code="offer.teamId.replace('seleccion-', '').toUpperCase()" size="md" />
            <div>
              <p>{{ offer.teamName }} · {{ offer.rank }}ª del mundo</p>
              <p class="text-xs text-court-300">
                Te pedirán: {{ offer.objectiveLabel.toLowerCase() }}
              </p>
            </div>
          </div>
          <AppButton variant="primary" :disabled="signing" @click="acceptNational(offer.teamId)">
            Aceptar
          </AppButton>
        </li>
      </ul>
    </section>

    <section
      v-if="(!board?.dismissed && !unemployed) || nationalOnly"
      class="rounded border border-court-700 p-5"
    >
      <AppSectionTitle>
        {{ stage === 'finished' ? 'Temporada terminada' : 'Próximo partido' }}
      </AppSectionTitle>

      <!-- Semana de descanso en una liga impar: la jornada se juega sin el club. -->
      <div v-if="restingRound" class="mt-3 flex items-center justify-between">
        <div>
          <p class="text-xl">Jornada {{ restingRound.round }}: descansas</p>
          <p class="text-sm text-court-300">
            {{ formatMatchDate(restingRound.scheduledOn) }}
            <template v-if="seasonStore.nextGame">
              · Después: {{ seasonStore.nextGame.homeTeamName }} vs
              {{ seasonStore.nextGame.awayTeamName }}
            </template>
          </p>
        </div>
        <div class="flex gap-2">
          <AppButton :disabled="seasonStore.busy" @click="advance('day')"> Avanzar día </AppButton>
          <AppButton variant="primary" :disabled="seasonStore.busy" @click="advance('nextGame')">
            Ir a la jornada
          </AppButton>
        </div>
      </div>

      <!-- Hay partido propio pendiente: lo normal durante toda la temporada. -->
      <div v-else-if="seasonStore.nextGame" class="mt-3 flex items-center justify-between">
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
          <AppButton variant="primary" :disabled="seasonStore.busy" @click="playNextGame">
            Jugar partido
          </AppButton>
        </div>
      </div>

      <!-- Tu liga ya tiene campeón, pero otras de las que se juegan todavía no. -->
      <div
        v-else-if="stage === 'finished' && (seasonStore.season?.pendingLeagues.length ?? 0) > 0"
        class="mt-3 flex items-center justify-between gap-4"
      >
        <div>
          <p class="text-xl">
            Campeón:
            <span class="font-semibold text-ball-400">
              {{ seasonStore.season?.championTeamName ?? '—' }}
            </span>
          </p>
          <p class="text-sm text-court-300">
            Faltan por terminar: {{ seasonStore.season?.pendingLeagues.join(', ') }}
          </p>
        </div>
        <AppButton :disabled="seasonStore.busy" @click="advance('nextGame')">Avanzar</AppButton>
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
