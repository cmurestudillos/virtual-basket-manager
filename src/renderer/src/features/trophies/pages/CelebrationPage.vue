<script setup lang="ts">
/**
 * La pantalla de campeón y la gala de fin de temporada (2026-09-29).
 *
 * Fuera del marco del juego (`DefaultLayout`), como el partido: cuando se
 * levanta un título la aplicación deja de ser una herramienta de gestión, y
 * una barra lateral con «Finanzas» al lado de la copa mata lo único que esta
 * pantalla tiene que hacer. Detrás, el pabellón de la previa con los colores
 * del campeón y la copa en el centro de la pista (`TrophyStage`).
 *
 * Encadena las pendientes una detrás de otra —quien gana Copa, liga y sube lo
 * levanta todo— en el orden que da el proceso principal: por día, y dentro
 * del día, el título, después el ascenso y la gala la última. Cada una se da
 * por vista al pasar a la siguiente, así que si el juego se cierra a medias
 * sólo vuelven a salir las que faltaban.
 */
import { computed, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import type {
  PendingCelebration,
  SeasonAwardEntry,
  SeasonGala
} from '@shared/contracts/trophies.contract';
import { teamKit } from '@shared/domain/court';
import { TROPHY_DESIGN, TROPHY_METAL_LABEL, celebrationHeadline } from '@shared/domain/trophies';
import { AppBackdrop, AppButton, TeamBadge, TrophyIcon } from '@renderer/shared/ui';
import GalaAwards from '../components/GalaAwards.vue';
import TrophyStage from '../components/TrophyStage.vue';

const router = useRouter();

const pending = ref<PendingCelebration[]>([]);
const index = ref(0);
const gala = ref<SeasonGala | null>(null);
const loading = ref(true);
const busy = ref(false);
const stageFailed = ref(false);

const current = computed<PendingCelebration | null>(() => pending.value[index.value] ?? null);
const isGala = computed(() => current.value?.kind === 'season_gala');
const kit = computed(() => teamKit(current.value?.teamId ?? ''));
const design = computed(() => (current.value ? TROPHY_DESIGN[current.value.trophyKind] : null));

const headline = computed(() =>
  current.value
    ? celebrationHeadline(
        current.value.kind,
        current.value.competitionName,
        current.value.trophyKind
      )
    : ''
);

/** La línea de encima del titular: qué y cuándo. */
const kicker = computed(() => {
  const celebration = current.value;
  if (!celebration) return '';
  if (celebration.kind === 'season_gala') {
    return `${celebration.competitionName} · Temporada ${celebration.years}`;
  }
  return `Temporada ${celebration.years}`;
});

/** Lo que se ha levantado, dicho con su metal: «Copa de oro», «Placa de bronce». */
const trophyNote = computed(() => {
  const celebration = current.value;
  if (!celebration || !design.value || celebration.kind === 'season_gala') return '';
  const metal = TROPHY_METAL_LABEL[design.value.metal].toLowerCase();
  return celebration.kind === 'promotion' ? `Placa de ${metal}` : `Trofeo de ${metal}`;
});

const awards = computed<SeasonAwardEntry[]>(() => gala.value?.awards ?? []);

async function loadGala(celebration: PendingCelebration | null): Promise<void> {
  gala.value =
    celebration?.kind === 'season_gala'
      ? await window.api.trophies.getGala(celebration.seasonId)
      : null;
}

async function leave(): Promise<void> {
  await router.replace({ name: 'dashboard' });
}

async function load(): Promise<void> {
  try {
    pending.value = await window.api.trophies.listPending();
  } catch {
    pending.value = [];
  }
  if (pending.value.length === 0) {
    await leave();
    return;
  }
  await loadGala(pending.value[0] ?? null);
  loading.value = false;
}

async function next(): Promise<void> {
  const celebration = current.value;
  if (!celebration || busy.value) return;
  busy.value = true;
  try {
    // Vista antes de pasar: si el juego se cierra ahora, ésta no vuelve a salir.
    await window.api.trophies.markSeen(celebration.id);
    if (index.value + 1 >= pending.value.length) {
      await leave();
      return;
    }
    index.value += 1;
  } finally {
    busy.value = false;
  }
}

watch(current, (celebration, previous) => {
  if (previous && celebration) void loadGala(celebration);
});

onMounted(load);
</script>

<template>
  <div
    class="relative h-screen overflow-hidden bg-tv-950 text-white"
    data-testid="celebration-page"
    :data-kind="current?.kind"
  >
    <TrophyStage
      v-if="current && !stageFailed"
      :kind="current.trophyKind"
      :kit="kit"
      :shift="isGala ? -1.3 : 0"
      @failed="stageFailed = true"
    />
    <AppBackdrop v-else class="absolute inset-0" />

    <div v-if="!loading && current" class="relative flex h-full flex-col">
      <!-- Cabecera de retransmisión: el campeón y lo que ha ganado. -->
      <header class="flex items-center gap-5 bg-tv-900/95 px-6 py-3 shadow-lg shadow-black/50">
        <div class="bg-white p-1">
          <TeamBadge :name="current.teamName" :kit="kit" :nation-of="current.nationOf" :size="56" />
        </div>
        <div class="flex min-w-0 flex-1 flex-col">
          <p class="text-xs font-bold tracking-widest text-white/70 uppercase">{{ kicker }}</p>
          <h1
            class="truncate text-3xl font-bold tracking-wide uppercase"
            data-testid="celebration-headline"
          >
            {{ headline }}
          </h1>
          <p class="text-sm font-semibold text-tv-cyan">{{ current.teamName }}</p>
        </div>
        <p
          v-if="pending.length > 1"
          class="figure bg-tv-800 px-3 py-1 text-sm font-bold"
          aria-label="Pantalla actual"
        >
          {{ index + 1 }} / {{ pending.length }}
        </p>
      </header>

      <main class="relative flex min-h-0 flex-1">
        <!-- Sin 3D: el trofeo plano, grande y en su metal. -->
        <div
          v-if="stageFailed && design"
          class="flex items-center justify-center"
          :class="isGala ? 'w-[30%] shrink-0' : 'flex-1'"
        >
          <TrophyIcon :metal="design.metal" :size="220" :label="trophyNote || 'Estatuilla'" />
        </div>
        <div v-else-if="isGala" class="w-[30%] shrink-0" />

        <!-- La gala: premios a la derecha, la estatuilla a la izquierda. -->
        <div v-if="isGala" class="flex min-h-0 flex-1 flex-col overflow-y-auto p-4 pl-0">
          <GalaAwards :awards="awards" compact class="my-auto" />
        </div>
      </main>

      <footer class="flex items-center gap-4 bg-tv-900/95 px-6 py-3">
        <span v-if="trophyNote" class="text-sm font-semibold text-white/80">{{ trophyNote }}</span>
        <span class="flex-1" />
        <AppButton
          variant="primary"
          size="lg"
          :disabled="busy"
          data-testid="celebration-continue"
          @click="next"
        >
          {{ index + 1 < pending.length ? 'Siguiente' : 'Continuar' }}
        </AppButton>
      </footer>
    </div>
  </div>
</template>
