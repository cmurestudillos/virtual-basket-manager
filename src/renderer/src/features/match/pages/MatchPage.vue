<script setup lang="ts">
/**
 * El partido, de la previa a la jornada, con la piel de retransmisión de IBM.
 *
 * Tres momentos en la misma pantalla:
 *
 * 1. **La previa**, sobre el pabellón en 3D: los cincos, los jugadores de
 *    referencia y cómo llegan los equipos. Sólo en un partido del usuario que
 *    todavía no ha empezado.
 * 2. **El partido**: la cabecera con marcador, reloj y parciales, cuatro
 *    pestañas —resumen, acta, texto y pista 2D— y la barra del banquillo.
 * 3. **La jornada**, al pulsar «Continuar» con el partido recién acabado: se
 *    juega el resto del día y se enseñan todos los resultados y el MVP.
 */
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import type {
  LiveTacticsPatch,
  MatchPreview as MatchPreviewData,
  MatchState,
  RoundResults
} from '@shared/contracts/match.contract';
import type { TeamTacticsView } from '@shared/contracts/tactics.contract';
import {
  matchKits,
  shirtNumbers,
  shortPlayerName,
  type CourtRosterPlayer
} from '@shared/domain/court';
import { formatGameClock, periodName, visibleLineCount } from '@shared/domain/play-by-play';
import { useSeasonStore } from '@renderer/features/season/season.store';
import BroadcastBackdrop from '../components/BroadcastBackdrop.vue';
import BroadcastButton from '../components/BroadcastButton.vue';
import BroadcastDrawer from '../components/BroadcastDrawer.vue';
import BroadcastPanel from '../components/BroadcastPanel.vue';
import CommentaryCards from '../components/CommentaryCards.vue';
import FullBoxScore from '../components/FullBoxScore.vue';
import LiveBench from '../components/LiveBench.vue';
import LiveTacticsPanel from '../components/LiveTacticsPanel.vue';
import MatchCourt from '../components/MatchCourt.vue';
import MatchPreview from '../components/MatchPreview.vue';
import MatchScoreboard from '../components/MatchScoreboard.vue';
import PlayByPlayFeed from '../components/PlayByPlayFeed.vue';
import RoundResultsView from '../components/RoundResultsView.vue';
import TeamBoxCard from '../components/TeamBoxCard.vue';
import TeamComparison from '../components/TeamComparison.vue';
import { usePlayback } from '../composables/usePlayback';
import { useLiveMatch } from '../composables/useLiveMatch';

const route = useRoute();
const router = useRouter();
const seasonStore = useSeasonStore();

/** El código de nacionalidad de una selección (`seleccion-esp`); nulo en un club. */
function nationOf(teamId: string): string | null {
  return teamId.startsWith('seleccion-') ? teamId.slice('seleccion-'.length).toUpperCase() : null;
}

const state = ref<MatchState | null>(null);
/**
 * El partido tal y como estaba antes del cuarto que se está retransmitiendo.
 * Mientras corre el reloj, el acta y los parciales salen de aquí: enseñar los
 * del final del cuarto sería contar el resultado antes de verlo.
 */
const previous = ref<MatchState | null>(null);
const busy = ref(false);
const playback = usePlayback(onPlaybackFinished);

/**
 * El partido en vivo, con su propio reloj.
 *
 * Convive con la retransmisión diferida en vez de sustituirla: quien quiera
 * dirigir el partido lo ve posesión a posesión, y quien quiera llegar al
 * resultado sigue teniendo el botón de pasar el cuarto de una tacada. Son dos
 * maneras de ver el mismo partido, no dos partidos.
 */
const live = useLiveMatch(playback.speed, onLiveFinished, onLivePeriodEnded);
/** La pizarra del partido: se toca aquí y vale para este partido, no para la temporada. */
const liveTactics = ref<TeamTacticsView | null>(null);

const SPEEDS = [
  { id: 'slow', label: 'Lenta' },
  { id: 'normal', label: 'Normal' },
  { id: 'fast', label: 'Rápida' }
] as const;

// ---------------------------------------------------------------------------
// Los tres momentos
// ---------------------------------------------------------------------------

type Stage = 'preview' | 'match' | 'results';
const stage = ref<Stage>('match');
const preview = ref<MatchPreviewData | null>(null);
const results = ref<RoundResults | null>(null);
/**
 * El partido ha acabado en esta pantalla. Sólo entonces «Continuar» sigue con
 * el día: al volver a abrir un partido viejo no se mueve el calendario.
 */
const justFinished = ref(false);

// ---------------------------------------------------------------------------
// Las pestañas
// ---------------------------------------------------------------------------

type Tab = 'summary' | 'stats' | 'text' | 'court';
const TAB_KEY = 'match.tab';
const TABS: { id: Tab; label: string }[] = [
  { id: 'summary', label: 'Resumen' },
  { id: 'stats', label: 'Estadísticas' },
  { id: 'text', label: 'Texto' },
  { id: 'court', label: 'Vista 2D' }
];

function readTab(): Tab {
  try {
    const stored = localStorage.getItem(TAB_KEY);
    if (stored === 'summary' || stored === 'stats' || stored === 'text' || stored === 'court') {
      return stored;
    }
    // Quien veía el partido en la pista (2D o la 3D que ya no existe) sigue en la pista.
    const legacy = localStorage.getItem('match.view');
    return legacy === '2d' || legacy === '3d' ? 'court' : 'summary';
  } catch {
    return 'summary';
  }
}

/** La pestaña se recuerda para el siguiente partido. */
const tab = ref<Tab>(readTab());
watch(tab, (value) => {
  try {
    localStorage.setItem(TAB_KEY, value);
  } catch {
    // Sin almacenamiento, la pestaña se olvida al salir.
  }
});

/** El cajón del banquillo abierto, si hay alguno. */
const drawer = ref<'bench' | 'tactics' | null>(null);

// ---------------------------------------------------------------------------
// La pista
// ---------------------------------------------------------------------------

/** Las jugadas que conoce la pista: las del directo o las guardadas del partido. */
const courtEvents = computed(() =>
  live.active.value ? live.events.value : (state.value?.courtEvents ?? [])
);

/** Cuántas se han visto ya: las mismas que la retransmisión escrita, por reloj. */
const courtVisible = computed(() => {
  const events = courtEvents.value;
  if (live.active.value) {
    return visibleLineCount(events, live.period.value, live.clockSeconds.value);
  }
  if (running.value && playback.period.value !== null) {
    return visibleLineCount(events, playback.period.value, playback.clockSeconds.value);
  }
  return events.length;
});

/** Los convocados de los dos equipos, con su dorsal. */
const courtRoster = computed<CourtRosterPlayer[]>(() => {
  const current = state.value;
  if (!current) return [];
  return (['home', 'away'] as const).flatMap((side) => {
    const lines = current[side].boxScores;
    const numbers = shirtNumbers(lines.map((line) => line.playerId));
    return lines.map((line) => ({
      playerId: line.playerId,
      side,
      position: line.position,
      number: numbers.get(line.playerId) ?? 0,
      shortName: shortPlayerName(line.playerName)
    }));
  });
});

const kits = computed(() =>
  matchKits(state.value?.home.teamId ?? '', state.value?.away.teamId ?? '')
);

// ---------------------------------------------------------------------------
// El marcador
// ---------------------------------------------------------------------------

/** Sólo se puede jugar el partido si el usuario está en él. */
const playable = computed(() => state.value?.managedSide !== null && !state.value?.finished);
const running = computed(() => playback.running.value);
/** Hay un partido en vivo en marcha, corriendo o pausado. */
const inLive = computed(() => live.active.value && !live.finished.value);

/** Lo que se ve: el estado anterior mientras corre un cuarto, el último si no. */
const shown = computed(() => (running.value ? previous.value : null) ?? state.value);

const visibleLines = computed(() => {
  if (live.active.value) {
    return live.lines.value;
  }
  const lines = state.value?.playByPlay ?? [];
  return running.value ? lines.slice(0, playback.visibleCount.value) : lines;
});

const score = computed(() => {
  if (live.active.value) {
    return { home: live.homeScore.value, away: live.awayScore.value };
  }
  const last = running.value ? visibleLines.value.at(-1) : undefined;
  return {
    home: last?.homeScore ?? shown.value?.home.score ?? 0,
    away: last?.awayScore ?? shown.value?.away.score ?? 0
  };
});

/** Segundos que dura el cuarto que va a empezar: el reloj arranca ahí. */
const periodSeconds = computed(() => {
  const current = state.value;
  if (!current) return 0;
  // La duración la dice el reglamento del partido, no la pantalla: son diez
  // minutos en FIBA y doce en la NBA, y una prórroga dura menos que un cuarto.
  const played = live.active.value ? live.period.value : current.playedPeriods;
  return played >= current.regulationPeriods ? current.overtimeSeconds : current.periodSeconds;
});

const clock = computed(() => {
  if (live.active.value && !live.finished.value) return formatGameClock(live.clockSeconds.value);
  if (running.value && playback.period.value !== null) {
    return formatGameClock(playback.clockSeconds.value);
  }
  if (state.value?.playedPeriods === 0) return formatGameClock(periodSeconds.value);
  return formatGameClock(0);
});

const periodLabel = computed(() => {
  const current = state.value;
  if (!current) return '';
  const period = live.active.value
    ? live.period.value
    : running.value && playback.period.value !== null
      ? playback.period.value
      : Math.max(1, current.playedPeriods);
  return period > current.regulationPeriods ? 'PR' : String(period);
});

/** La línea de debajo del reloj: en qué punto del partido estamos. */
const moment = computed(() => {
  const current = state.value;
  if (!current) return '';
  if (live.active.value && !live.finished.value) {
    const name = periodName(live.period.value, current.regulationPeriods);
    if (live.periodEnded.value) return `Final ${name === 'prórroga' ? 'de la' : 'del'} ${name}`;
    return live.paused.value ? 'En pausa' : 'En directo';
  }
  if (replaying.value) return playback.paused.value ? 'Repetición · en pausa' : 'Repetición';
  if (running.value && playback.period.value !== null) {
    return playback.paused.value ? 'En pausa' : 'En juego';
  }
  if (current.finished) return 'Final';
  if (current.playedPeriods === 0) return 'Previa';
  if (current.playedPeriods === Math.floor(current.regulationPeriods / 2)) return 'Descanso';
  return `Final del ${periodName(current.playedPeriods, current.regulationPeriods)}`;
});

// ---------------------------------------------------------------------------
// Carga
// ---------------------------------------------------------------------------

onMounted(load);
watch(
  () => route.params.gameId,
  (next, before) => {
    if (next && next !== before) void load();
  }
);

// Si se sale a mitad de la retransmisión del último cuarto, el partido ya está
// guardado: la cabecera y el calendario tienen que enterarse igualmente.
onUnmounted(() => {
  live.stop();
  if ((running.value || live.active.value) && state.value?.finished) {
    void seasonStore.refresh();
  }
});

async function load(): Promise<void> {
  const gameId = String(route.params.gameId);
  live.stop();
  previous.value = null;
  results.value = null;
  justFinished.value = false;
  liveTactics.value = null;
  // Un partido ya jugado se lee del acta guardada y uno a medias de su sesión:
  // salir al club y volver no puede reiniciar el partido que estabas jugando.
  // Sólo se prepara de cero el que no ha empezado.
  const current = await window.api.match.snapshot(gameId);
  state.value = current ?? (await window.api.match.start(gameId));

  const fresh = state.value;
  stage.value = 'match';
  if (fresh.managedSide && fresh.playedPeriods === 0 && !fresh.finished) {
    try {
      preview.value = await window.api.match.preview(gameId);
      stage.value = 'preview';
    } catch {
      // Sin previa se juega igual: es decorado, no puede impedir el partido.
    }
  }
}

// ---------------------------------------------------------------------------
// Partido cuarto a cuarto (diferido)
// ---------------------------------------------------------------------------

async function advance(): Promise<void> {
  if (!state.value || busy.value || running.value) {
    return;
  }
  busy.value = true;
  try {
    previous.value = state.value;
    state.value = await window.api.match.advancePeriod(state.value.gameId);
    if (state.value.finished) justFinished.value = true;
    playback.play(state.value.playByPlay ?? [], state.value.playedPeriods);
  } finally {
    busy.value = false;
  }
}

function onPlaybackFinished(): void {
  if (replaying.value) {
    // La repetición encadena los cuartos: al acabar uno, empieza el siguiente.
    if (replayPeriod.value < (state.value?.periods.length ?? 0)) {
      replayPeriod.value += 1;
      playback.play(state.value?.playByPlay ?? [], replayPeriod.value);
    } else {
      replaying.value = false;
    }
    return;
  }
  previous.value = null;
  if (state.value?.finished) {
    // El partido ya cuenta para la clasificación: la cabecera y el próximo
    // partido de la temporada tienen que enterarse. Se espera al final de la
    // retransmisión para que la cabecera no cante el resultado antes de verlo.
    void seasonStore.refresh();
  }
}

// ---------------------------------------------------------------------------
// Repeticiones
// ---------------------------------------------------------------------------

/** Se está volviendo a ver un partido ya jugado. */
const replaying = ref(false);
const replayPeriod = ref(1);

const replayPeriods = computed(() =>
  (state.value?.periods ?? []).map((entry) => ({
    id: entry.period,
    label: entry.period > (state.value?.regulationPeriods ?? 4) ? 'PR' : `${entry.period}º`
  }))
);

function startReplay(fromPeriod = 1): void {
  const lines = state.value?.playByPlay;
  if (!lines || lines.length === 0) return;
  replaying.value = true;
  replayPeriod.value = fromPeriod;
  playback.play(lines, fromPeriod);
}

function stopReplay(): void {
  replaying.value = false;
  playback.skip();
}

// ---------------------------------------------------------------------------
// El partido en vivo
// ---------------------------------------------------------------------------

/** Arranca el directo, o reanuda el cuarto siguiente si ya estaba en marcha. */
async function playLive(): Promise<void> {
  const current = state.value;
  if (!current || busy.value) {
    return;
  }

  busy.value = true;
  try {
    // El banquillo necesita la pizarra del equipo para saber de qué se parte.
    if (!liveTactics.value && current.managedSide) {
      const teamId = current.managedSide === 'home' ? current.home.teamId : current.away.teamId;
      liveTactics.value = await window.api.tactics.get(teamId);
    }
    live.clockSeconds.value = periodSeconds.value;
    live.start(current.gameId);
  } finally {
    busy.value = false;
  }
}

function onLivePeriodEnded(): void {
  // El cuarto se cierra: el acta y los parciales ya se pueden refrescar.
  void refreshFromStore();
}

function onLiveFinished(): void {
  justFinished.value = true;
  drawer.value = null;
  void finishLive();
}

async function finishLive(): Promise<void> {
  const gameId = state.value?.gameId;
  if (!gameId) return;
  const stored = await window.api.match.get(gameId);
  if (stored) {
    state.value = stored;
  }
  await seasonStore.refresh();
}

let refreshing = false;
/** El acta en pantalla se pone al día con lo jugado. */
async function refreshFromStore(): Promise<void> {
  const gameId = state.value?.gameId;
  if (!gameId || refreshing) return;
  refreshing = true;
  try {
    // El partido en vivo todavía no está guardado: lo que va jugado lo tiene la
    // sesión, no la base de datos.
    const current = await window.api.match.snapshot(gameId);
    if (current) {
      state.value = current;
    }
  } finally {
    refreshing = false;
  }
}

/**
 * En directo, el acta del resumen se refresca cada pocas jugadas: esperar al
 * final del cuarto dejaría las cifras de los jugadores congeladas diez minutos.
 */
const REFRESH_EVERY_LINES = 6;
let refreshedAtLine = 0;
watch(
  () => live.lines.value.length,
  (count) => {
    if (count < refreshedAtLine) refreshedAtLine = 0;
    if (inLive.value && count - refreshedAtLine >= REFRESH_EVERY_LINES) {
      refreshedAtLine = count;
      void refreshFromStore();
    }
  }
);

/** Se deja de dirigir y el resto del partido se juega cuarto a cuarto. */
async function leaveLive(): Promise<void> {
  live.stop();
  drawer.value = null;
  await advance();
}

async function onSubstitute(outgoingId: string, incomingId: string): Promise<void> {
  await live.substitute(outgoingId, incomingId);
}

async function onAutoRotation(enabled: boolean): Promise<void> {
  await live.setAutoRotation(enabled);
}

async function onTimeout(): Promise<void> {
  await live.callTimeout();
}

async function onTacticsChange(patch: LiveTacticsPatch): Promise<void> {
  if (!liveTactics.value) return;
  // La pizarra de la pantalla se mueve con la orden para que el selector no se
  // quede atrás; lo que manda de verdad es lo que aceptó el motor.
  const applied = await live.setTactics(patch as Record<string, unknown>);
  if (applied) {
    liveTactics.value = { ...liveTactics.value, ...patch } as TeamTacticsView;
  }
}

/** Los mandos del banquillo sólo valen con el reloj del directo en marcha. */
const benchEnabled = computed(() => inLive.value && live.bench.value.length > 0);
const timeoutEnabled = computed(
  () => inLive.value && !live.periodEnded.value && live.timeoutsLeft.value > 0
);

// ---------------------------------------------------------------------------
// La jornada
// ---------------------------------------------------------------------------

/**
 * «Continuar» con el partido recién acabado: se juega lo que queda del día
 * —los demás partidos de la jornada— y se enseñan los resultados. Es lo mismo
 * que haría «Avanzar día» desde el club, pero sin salir de la retransmisión.
 */
async function continueToRound(): Promise<void> {
  const current = state.value;
  if (!current || busy.value) return;
  busy.value = true;
  try {
    let round = await window.api.match.roundResults(current.gameId);
    if (justFinished.value && round.pending > 0) {
      const nextGameId = await seasonStore.advance('day');
      justFinished.value = false;
      if (nextGameId && nextGameId !== current.gameId) {
        // Otro partido tuyo ese mismo día (la selección): se va directo a él.
        await router.push({ name: 'match', params: { gameId: nextGameId } });
        return;
      }
      round = await window.api.match.roundResults(current.gameId);
    }
    results.value = round;
    stage.value = 'results';
  } finally {
    busy.value = false;
  }
}

async function leaveResults(): Promise<void> {
  await router.push({ name: 'dashboard' });
}
</script>

<template>
  <div class="h-screen overflow-y-auto bg-tv-950">
    <MatchPreview
      v-if="state && stage === 'preview' && preview"
      class="h-screen"
      :preview="preview"
      :kits="kits"
      :managed-side="state.managedSide"
      :scouting="state.scouting"
      @done="stage = 'match'"
    />

    <BroadcastBackdrop v-else-if="state && stage === 'results' && results">
      <RoundResultsView :results="results" :busy="busy" @continue="leaveResults" />
    </BroadcastBackdrop>

    <BroadcastBackdrop v-else-if="state && shown">
      <div class="flex min-h-screen flex-col">
        <MatchScoreboard
          :round-label="state.roundLabel"
          :home-name="state.home.teamName"
          :away-name="state.away.teamName"
          :kits="kits"
          :home-nation="nationOf(state.home.teamId)"
          :away-nation="nationOf(state.away.teamId)"
          :managed-side="state.managedSide"
          :score="score"
          :clock="clock"
          :period-label="periodLabel"
          :periods="shown.periods"
          :regulation-periods="state.regulationPeriods"
          :status="moment"
        >
          <template #corner>
            <RouterLink
              :to="{ name: 'dashboard' }"
              class="text-[0.7rem] font-semibold uppercase text-tv-muted hover:text-tv-blue"
            >
              ‹ Volver al club
            </RouterLink>
          </template>

          <template #under-away>
            <span class="text-[0.65rem] font-semibold uppercase tracking-wide">T. muertos</span>
            <span
              class="figure border border-white/30 bg-black px-2 text-lg font-bold leading-6 text-tv-amber"
            >
              {{ inLive ? live.timeoutsLeft.value : '-' }}
            </span>
          </template>

          <template #actions>
            <!-- Repetición de un partido ya jugado. -->
            <template v-if="replaying">
              <BroadcastButton
                arrow="single"
                @click="playback.paused.value ? playback.resume() : playback.pause()"
              >
                {{ playback.paused.value ? 'Reanudar' : 'Pausa' }}
              </BroadcastButton>
              <BroadcastButton variant="muted" @click="stopReplay">
                Terminar repetición
              </BroadcastButton>
            </template>

            <!-- Partido en vivo con el reloj en marcha. -->
            <template v-else-if="inLive && !live.periodEnded.value">
              <BroadcastButton
                arrow="single"
                @click="live.paused.value ? live.resume() : live.pause()"
              >
                {{ live.paused.value ? 'Reanudar' : 'Pausa' }}
              </BroadcastButton>
              <BroadcastButton arrow="double" @click="live.skipPeriod">
                Saltar cuarto
              </BroadcastButton>
            </template>

            <!-- Diferido: el cuarto se está retransmitiendo. -->
            <template v-else-if="running">
              <BroadcastButton arrow="single" disabled>Jugar</BroadcastButton>
              <BroadcastButton arrow="double" @click="playback.skip">Saltar cuarto</BroadcastButton>
            </template>

            <!-- Entre cuartos: jugar el siguiente dirigiendo o pasarlo simulado. -->
            <template v-else-if="playable">
              <BroadcastButton arrow="single" :disabled="busy" @click="playLive">
                Jugar
              </BroadcastButton>
              <BroadcastButton
                arrow="double"
                :disabled="busy"
                @click="inLive ? leaveLive() : advance()"
              >
                Pasar cuarto
              </BroadcastButton>
            </template>

            <template v-else-if="state.finished">
              <BroadcastButton
                v-if="state.managedSide"
                arrow="single"
                :disabled="busy"
                @click="continueToRound"
              >
                Continuar
              </BroadcastButton>
              <BroadcastButton
                v-if="state.playByPlay && state.playByPlay.length > 0"
                variant="muted"
                @click="startReplay()"
              >
                Ver repetición
              </BroadcastButton>
            </template>
            <p v-else class="text-sm text-white/70">Partido de otros equipos</p>
          </template>
        </MatchScoreboard>

        <!-- Pestañas -->
        <nav class="flex items-center gap-1 bg-tv-900/80 px-5" aria-label="Modo de partido">
          <span class="mr-4 border-r border-white/40 py-3 pr-5 text-sm font-bold uppercase">
            Modo de partido
          </span>
          <button
            v-for="option in TABS"
            :key="option.id"
            type="button"
            class="border-b-4 px-4 py-3 text-sm font-semibold transition"
            :class="
              tab === option.id
                ? 'border-tv-blue text-white'
                : 'border-transparent text-white/70 hover:text-white'
            "
            :aria-pressed="tab === option.id"
            @click="tab = option.id"
          >
            {{ option.label }}
          </button>

          <div class="ml-auto flex items-center gap-3 py-2">
            <!-- Repetición: saltar de cuarto. -->
            <template v-if="replaying">
              <button
                type="button"
                class="bg-tv-700 px-3 py-1 text-xs font-semibold hover:bg-tv-600"
                @click="playback.skip"
              >
                Siguiente cuarto
              </button>
              <span class="flex gap-0.5" role="group" aria-label="Ir al cuarto">
                <button
                  v-for="option in replayPeriods"
                  :key="option.id"
                  type="button"
                  class="px-2 py-1 text-xs font-semibold"
                  :class="replayPeriod === option.id ? 'bg-tv-blue' : 'bg-tv-700 hover:bg-tv-600'"
                  :aria-pressed="replayPeriod === option.id"
                  @click="startReplay(option.id)"
                >
                  {{ option.label }}
                </button>
              </span>
            </template>
            <!-- La velocidad vale para el directo, el diferido y la repetición. -->
            <span
              v-if="running || playable || inLive || replaying"
              class="flex items-center gap-0.5"
              role="group"
              aria-label="Velocidad de la retransmisión"
            >
              <span class="mr-2 text-xs uppercase text-white/60">Velocidad</span>
              <button
                v-for="option in SPEEDS"
                :key="option.id"
                type="button"
                class="px-2.5 py-1 text-xs font-semibold"
                :class="
                  playback.speed.value === option.id ? 'bg-tv-blue' : 'bg-tv-700 hover:bg-tv-600'
                "
                :aria-pressed="playback.speed.value === option.id"
                @click="playback.speed.value = option.id"
              >
                {{ option.label }}
              </button>
            </span>
          </div>
        </nav>

        <main class="flex-1 p-4">
          <!-- Resumen: las dos actas cortas y, en medio, la comparativa y los comentarios. -->
          <div
            v-if="tab === 'summary'"
            class="grid grid-cols-[minmax(0,1fr)_minmax(0,0.8fr)_minmax(0,1fr)] gap-4"
          >
            <TeamBoxCard :lines="shown.home.boxScores" :managed="state.managedSide === 'home'" />
            <div class="flex min-w-0 flex-col gap-3">
              <TeamComparison
                :home="shown.home.boxScores"
                :away="shown.away.boxScores"
                :home-score="score.home"
                :away-score="score.away"
              />
              <CommentaryCards
                v-if="state.playByPlay !== null || inLive"
                :lines="visibleLines"
                :home-name="state.home.teamName"
                :away-name="state.away.teamName"
                :kits="kits"
                :regulation-periods="state.regulationPeriods"
              />
              <BroadcastPanel v-else title="Comentarios">
                <p class="p-3 text-center text-sm text-tv-muted">
                  De los partidos entre otros equipos sólo se guarda el acta: la retransmisión se
                  queda para los tuyos.
                </p>
              </BroadcastPanel>
            </div>
            <TeamBoxCard :lines="shown.away.boxScores" :managed="state.managedSide === 'away'" />
          </div>

          <!-- Estadísticas: el acta entera. -->
          <div v-else-if="tab === 'stats'" class="grid grid-cols-2 gap-4">
            <FullBoxScore
              :team-name="shown.home.teamName"
              :lines="shown.home.boxScores"
              :managed="state.managedSide === 'home'"
            />
            <FullBoxScore
              :team-name="shown.away.teamName"
              :lines="shown.away.boxScores"
              :managed="state.managedSide === 'away'"
            />
          </div>

          <!-- Texto: la retransmisión escrita entera. -->
          <PlayByPlayFeed
            v-else-if="tab === 'text'"
            :lines="visibleLines"
            :managed-side="state.managedSide"
            :kits="kits"
          />

          <!-- Vista 2D: la pista, con los últimos comentarios al lado. -->
          <div v-else class="grid grid-cols-[minmax(0,2.2fr)_minmax(0,1fr)] gap-4">
            <BroadcastPanel title="Vista 2D" flush>
              <MatchCourt
                v-if="courtEvents.length > 0"
                :events="courtEvents"
                :visible-count="courtVisible"
                :roster="courtRoster"
                :kits="kits"
                :regulation-periods="state.regulationPeriods"
                :speed="playback.speed.value"
              />
              <p v-else class="p-8 text-center text-sm text-tv-muted">
                {{
                  state.courtEvents === null && !inLive
                    ? 'De los partidos entre otros equipos no se guardan las jugadas.'
                    : 'La pista se mueve en cuanto empiece el partido.'
                }}
              </p>
            </BroadcastPanel>
            <CommentaryCards
              :lines="visibleLines"
              :home-name="state.home.teamName"
              :away-name="state.away.teamName"
              :kits="kits"
              :regulation-periods="state.regulationPeriods"
              max-height="62vh"
            />
          </div>
        </main>

        <!-- La barra del banquillo -->
        <footer class="sticky bottom-0 flex justify-end gap-3 bg-tv-950/90 px-4 py-3">
          <p
            v-if="playable && !inLive && !running"
            class="mr-auto self-center text-sm text-white/70"
          >
            Los mandos del banquillo se usan jugando el cuarto en directo.
          </p>
          <BroadcastButton
            variant="muted"
            class="min-w-56 justify-center"
            :disabled="!timeoutEnabled"
            @click="onTimeout"
          >
            Tiempo muerto: {{ inLive ? live.timeoutsLeft.value : '-' }}
          </BroadcastButton>
          <BroadcastButton
            class="min-w-56 justify-center"
            :disabled="!benchEnabled || !liveTactics"
            @click="drawer = 'tactics'"
          >
            Tácticas
          </BroadcastButton>
          <BroadcastButton
            variant="muted"
            class="min-w-56 justify-center"
            :disabled="!benchEnabled"
            @click="drawer = 'bench'"
          >
            Sustituciones
          </BroadcastButton>
        </footer>
      </div>

      <BroadcastDrawer
        v-if="drawer === 'bench' && inLive"
        title="Sustituciones"
        @close="drawer = null"
      >
        <LiveBench
          :on-court="live.onCourt.value"
          :benched="live.benched.value"
          :auto-rotation="live.autoRotation.value"
          :refusal="live.lastRefusal.value"
          :disabled="live.finished.value"
          @substitute="onSubstitute"
          @auto-rotation="onAutoRotation"
        />
      </BroadcastDrawer>
      <BroadcastDrawer
        v-if="drawer === 'tactics' && inLive && liveTactics"
        title="Tácticas"
        @close="drawer = null"
      >
        <LiveTacticsPanel
          :offensive-system="liveTactics.offensiveSystem"
          :defensive-system="liveTactics.defensiveSystem"
          :pace="liveTactics.pace"
          :defensive-intensity="liveTactics.defensiveIntensity"
          :disabled="live.finished.value"
          @change="onTacticsChange"
        />
      </BroadcastDrawer>
    </BroadcastBackdrop>
  </div>
</template>
