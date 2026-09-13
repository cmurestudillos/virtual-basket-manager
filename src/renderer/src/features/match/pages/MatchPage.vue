<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import type { BoxScoreLine, MatchState } from '@shared/contracts/match.contract';
import { percentage } from '@shared/domain/box-score';
import { formatGameClock, periodName } from '@shared/domain/play-by-play';
import { useSeasonStore } from '@renderer/features/season/season.store';
import { formatMatchDate, formatPlayedMinutes } from '@renderer/shared/format';
import { AppButton, AppEmpty, AppPanel, AppSectionTitle, AppSegmented } from '@renderer/shared/ui';
import PlayByPlayFeed from '../components/PlayByPlayFeed.vue';
import { usePlayback } from '../composables/usePlayback';

const route = useRoute();
const seasonStore = useSeasonStore();

const state = ref<MatchState | null>(null);
/**
 * El partido tal y como estaba antes del cuarto que se está retransmitiendo.
 * Mientras corre el reloj, el acta y los parciales salen de aquí: enseñar los
 * del final del cuarto sería contar el resultado antes de verlo.
 */
const previous = ref<MatchState | null>(null);
const busy = ref(false);
const playback = usePlayback(onPlaybackFinished);

const SPEEDS = [
  { id: 'slow', label: 'Lenta' },
  { id: 'normal', label: 'Normal' },
  { id: 'fast', label: 'Rápida' }
];

/** Sólo se puede jugar el partido si el usuario está en él. */
const playable = computed(() => state.value?.managedSide !== null && !state.value?.finished);
const running = computed(() => playback.running.value);

/** Lo que se ve: el estado anterior mientras corre un cuarto, el último si no. */
const shown = computed(() => (running.value ? previous.value : null) ?? state.value);

const visibleLines = computed(() => {
  const lines = state.value?.playByPlay ?? [];
  return running.value ? lines.slice(0, playback.visibleCount.value) : lines;
});

const score = computed(() => {
  const last = running.value ? visibleLines.value.at(-1) : undefined;
  return {
    home: last?.homeScore ?? shown.value?.home.score ?? 0,
    away: last?.awayScore ?? shown.value?.away.score ?? 0
  };
});

/** La línea de debajo del marcador: en qué punto del partido estamos. */
const moment = computed(() => {
  const current = state.value;
  if (!current) return '';
  if (running.value && playback.period.value !== null) {
    const name = periodName(playback.period.value, current.regulationPeriods);
    return `${name.charAt(0).toUpperCase()}${name.slice(1)} · ${formatGameClock(playback.clockSeconds.value)}`;
  }
  if (current.finished) return 'Final';
  if (current.playedPeriods === 0) return 'Previa';
  if (current.playedPeriods === Math.floor(current.regulationPeriods / 2)) return 'Descanso';
  return `Final del ${periodName(current.playedPeriods, current.regulationPeriods)}`;
});

const buttonLabel = computed(() => {
  const played = state.value?.playedPeriods ?? 0;
  const regulation = state.value?.regulationPeriods ?? 4;
  if (played === 0) return 'Jugar 1er cuarto';
  if (played < regulation) return `Jugar ${played + 1}º cuarto`;
  return `Jugar prórroga ${played - regulation + 1}`;
});

onMounted(load);

// Si se sale a mitad de la retransmisión del último cuarto, el partido ya está
// guardado: la cabecera y el calendario tienen que enterarse igualmente.
onUnmounted(() => {
  if (running.value && state.value?.finished) {
    void seasonStore.refresh();
  }
});

async function load(): Promise<void> {
  const gameId = String(route.params.gameId);
  // Un partido ya jugado se lee del acta guardada; uno pendiente se prepara.
  const stored = await window.api.match.get(gameId);
  state.value = stored ?? (await window.api.match.start(gameId));
}

async function advance(): Promise<void> {
  if (!state.value || busy.value || running.value) {
    return;
  }
  busy.value = true;
  try {
    previous.value = state.value;
    state.value = await window.api.match.advancePeriod(state.value.gameId);
    playback.play(state.value.playByPlay ?? [], state.value.playedPeriods);
  } finally {
    busy.value = false;
  }
}

function onPlaybackFinished(): void {
  previous.value = null;
  if (state.value?.finished) {
    // El partido ya cuenta para la clasificación: la cabecera y el próximo
    // partido de la temporada tienen que enterarse. Se espera al final de la
    // retransmisión para que la cabecera no cante el resultado antes de verlo.
    void seasonStore.refresh();
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
  <div v-if="state && shown" class="flex flex-col gap-5">
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
        <div class="text-center">
          <p class="text-5xl font-bold tabular-nums">
            {{ score.home }} <span class="text-court-600">-</span> {{ score.away }}
          </p>
          <p class="mt-1 text-sm text-court-300 tabular-nums">{{ moment }}</p>
        </div>
        <div>
          <p class="text-xl" :class="state.managedSide === 'away' ? 'text-ball-400' : ''">
            {{ state.away.teamName }}
          </p>
        </div>
      </div>

      <!-- Parciales por cuarto -->
      <table v-if="shown.periods.length > 0" class="mx-auto mt-5 text-sm">
        <thead>
          <tr class="text-court-300">
            <th class="px-3 py-1 text-left"></th>
            <th v-for="period in shown.periods" :key="period.period" class="px-3 py-1 text-center">
              {{ period.period > shown.regulationPeriods ? 'PR' : `${period.period}º` }}
            </th>
          </tr>
        </thead>
        <tbody class="tabular-nums">
          <tr>
            <td class="px-3 py-1 text-court-300">{{ state.home.teamName }}</td>
            <td v-for="period in shown.periods" :key="period.period" class="px-3 py-1 text-center">
              {{ period.home }}
            </td>
          </tr>
          <tr>
            <td class="px-3 py-1 text-court-300">{{ state.away.teamName }}</td>
            <td v-for="period in shown.periods" :key="period.period" class="px-3 py-1 text-center">
              {{ period.away }}
            </td>
          </tr>
        </tbody>
      </table>

      <div class="mt-6 flex flex-wrap items-center justify-center gap-4">
        <AppButton v-if="running" variant="secondary" size="lg" @click="playback.skip">
          Saltar al final del cuarto
        </AppButton>
        <AppButton
          v-else-if="playable"
          variant="primary"
          size="lg"
          :disabled="busy"
          @click="advance"
        >
          {{ busy ? 'Jugando…' : buttonLabel }}
        </AppButton>
        <p v-else-if="state.finished" class="text-sm text-court-300">Partido finalizado</p>
        <p v-else class="text-sm text-court-300">Partido de otros equipos</p>

        <!-- La velocidad se elige antes o durante: vale para todos los cuartos. -->
        <AppSegmented
          v-if="running || playable"
          v-model="playback.speed.value"
          :options="SPEEDS"
          aria-label="Velocidad de la retransmisión"
        />
      </div>
    </section>

    <PlayByPlayFeed
      v-if="state.playByPlay && state.playedPeriods > 0"
      :lines="visibleLines"
      :managed-side="state.managedSide"
    />
    <AppPanel v-else-if="state.finished" title="Retransmisión">
      <AppEmpty>
        De los partidos entre otros equipos sólo se guarda el acta: la retransmisión se queda para
        los tuyos.
      </AppEmpty>
    </AppPanel>

    <!-- Actas -->
    <section v-if="shown.playedPeriods > 0" class="grid grid-cols-2 gap-4">
      <div
        v-for="side in [shown.home, shown.away]"
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
              <td class="numeric" :class="line.efficiency >= 15 ? 'text-good-400' : ''">
                {{ line.efficiency }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <!-- Previa: todavía no se ha jugado nada -->
    <section v-else class="rounded border border-court-700 p-5">
      <AppSectionTitle>Previa</AppSectionTitle>

      <!-- Lo que el analista ha sacado del rival. -->
      <div v-if="state.scouting" class="mt-3 rounded border border-court-700 bg-court-900 p-3">
        <p class="text-xs uppercase tracking-wide text-court-300">
          Informe del analista · {{ state.scouting.teamName }}
        </p>
        <p class="mt-1 text-sm">
          {{ state.scouting.offensiveSystem }} en ataque y {{ state.scouting.defensiveSystem }} en
          defensa · ritmo {{ state.scouting.pace }} · intensidad
          {{ state.scouting.defensiveIntensity }}
        </p>
        <p v-if="state.scouting.focusPlayerName" class="text-sm text-court-300">
          Van a buscar a {{ state.scouting.focusPlayerName }}
        </p>
      </div>
      <div class="mt-3 grid grid-cols-2 gap-6">
        <div v-for="side in [shown.home, shown.away]" :key="side.teamId">
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
