<script setup lang="ts">
/**
 * La barra de arriba del juego (IBM: ~80 px; aquí 72 para que quepa en
 * 1280×720), en degradado morado → negro → añil.
 *
 * De izquierda a derecha, como IBM: el escudo en su bloque blanco sesgado con
 * la franja cian; equipo y caja; el entrenador con su cara, su bandera y su
 * reputación en estrellas (también en modo mánager, desde la fase 5); la fecha
 * en dos líneas; y CONTINUAR, que lleva el escudo del rival cuando lo siguiente
 * es un partido.
 * Al lado de CONTINUAR, pequeñas, las acciones secundarias: «Avanzar día» y,
 * sin club pero con selección, «Esperar un mes».
 *
 * Qué hace CONTINUAR no se decide aquí: ver `features/season/continue-action.ts`.
 */
import { computed, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { matchKits } from '@shared/domain/court';
import { toStars } from '@shared/domain/stars';
import { AppAvatar, AppButton, AppFlag, AppStars, TeamBadge } from '@renderer/shared/ui';
import { formatMoney } from '@renderer/shared/format';
import { useGameStateStore } from '@renderer/shared/game-state.store';
import { continueDetail } from '@renderer/features/season/continue-action';
import { useContinue } from '@renderer/features/season/useContinue';
import GameIcon from './GameIcon.vue';

const gameState = useGameStateStore();
const route = useRoute();
const { store, continueGame, advanceDay, waitMonth } = useContinue();

const budgetCents = ref<number | null>(null);
const country = ref<string | null>(null);

// La caja se mueve con el reloj (nóminas, taquilla) y con lo que se hace en las
// pantallas (un fichaje): se relee al moverse el reloj y al cambiar de pantalla.
watch(
  () =>
    [
      gameState.state?.teamId,
      store.unemployed,
      store.busy,
      gameState.state?.currentDate,
      route.fullPath
    ] as const,
  async ([teamId, unemployed, busy]) => {
    // A mitad de un avance largo la fecha cambia a cada paso: se relee al acabar.
    if (busy) {
      return;
    }
    if (!teamId || unemployed) {
      budgetCents.value = null;
      country.value = null;
      return;
    }
    const team = await window.api.teams.get(teamId);
    budgetCents.value = team?.budgetCents ?? null;
    country.value = team?.country ?? null;
  },
  { immediate: true }
);

const kitOf = (teamId: string) => matchKits(teamId, '').home;
/** Las selecciones llevan bandera y no escudo: `seleccion-esp` → `ESP`. */
const nationOf = (teamId: string) =>
  teamId.startsWith('seleccion-') ? teamId.replace('seleccion-', '').toUpperCase() : null;

const teamLabel = computed(() => {
  if (store.unemployed) {
    return store.career?.nationalTeamName ?? 'Sin equipo';
  }
  return gameState.state?.teamName ?? 'Sin equipo';
});

const DAY = new Intl.DateTimeFormat('es-ES', {
  timeZone: 'UTC',
  day: 'numeric',
  month: 'short',
  year: 'numeric'
});
const WEEKDAY = new Intl.DateTimeFormat('es-ES', { timeZone: 'UTC', weekday: 'long' });

/** «5 dic 2024» y «jueves»: como IBM, la fecha arriba y el día debajo. */
const date = computed(() => {
  const milliseconds = gameState.state?.currentDate;
  if (milliseconds === undefined) {
    return null;
  }
  const day = new Date(milliseconds);
  return {
    iso: day.toISOString().slice(0, 10),
    day: DAY.format(day).replace('.', ''),
    weekday: WEEKDAY.format(day)
  };
});

const rival = computed(() => (store.action.kind === 'playGame' ? store.rival : null));
const detail = computed(() => continueDetail(store.action, rival.value?.teamName ?? null));
const continueDisabled = computed(() => store.busy || store.action.kind === 'none');
</script>

<template>
  <header
    class="flex h-[72px] min-w-0 items-stretch bg-linear-to-r from-tv-chrome via-black to-tv-chrome-2 text-white"
  >
    <!-- El escudo, en su bloque blanco sesgado con la franja cian detrás. -->
    <div class="relative w-[118px] shrink-0">
      <div
        aria-hidden="true"
        class="absolute inset-0 bg-tv-cyan [clip-path:polygon(0_0,100%_0,86%_100%,0_100%)]"
      ></div>
      <div
        class="absolute inset-0 flex items-center justify-center bg-white pr-5 [clip-path:polygon(0_0,91%_0,78%_100%,0_100%)]"
      >
        <TeamBadge
          v-if="gameState.state?.teamId && !store.unemployed"
          :name="gameState.state.teamName"
          :kit="kitOf(gameState.state.teamId)"
          :size="54"
        />
      </div>
    </div>

    <dl
      class="grid min-w-0 shrink grid-cols-[auto_minmax(0,1fr)] content-center gap-x-4 gap-y-0.5 px-4 text-sm"
    >
      <dt class="text-white/75">Equipo</dt>
      <dd class="flex min-w-0 items-center gap-2 font-bold">
        <AppFlag v-if="country" :code="country" />
        <span class="max-w-[15rem] truncate">{{ teamLabel }}</span>
      </dd>
      <dt class="text-white/75">Caja</dt>
      <dd class="figure font-bold" :class="(budgetCents ?? 0) < 0 ? 'text-tv-mood-low' : ''">
        {{ budgetCents === null ? '—' : formatMoney(budgetCents) }}
      </dd>
    </dl>

    <!-- El entrenador, en el tramo negro del degradado. -->
    <div v-if="gameState.state" class="flex min-w-0 shrink items-center gap-3 px-4">
      <AppAvatar kind="coach" :seed="gameState.state.managerName" :size="40" />
      <div class="flex min-w-0 flex-col gap-1">
        <p class="flex min-w-0 items-center gap-2 text-sm font-bold">
          <AppFlag :code="gameState.state.managerNationality" />
          <span class="truncate">{{ gameState.state.managerName }}</span>
        </p>
        <!-- La reputación sale de la carrera, que el store de CONTINUAR relee al
             cambiar de pantalla y tras cada avance (un despido, un club nuevo). -->
        <AppStars
          v-if="store.career"
          :value="toStars(store.career.reputation)"
          :label="`Reputación: ${store.career.reputationLabel}`"
          :boxed="false"
          :size="13"
        />
      </div>
    </div>

    <div class="flex-1"></div>

    <p
      v-if="date && gameState.state"
      class="flex shrink-0 flex-col items-center justify-center px-4 text-center leading-tight"
    >
      <time :datetime="date.iso" class="text-base font-bold uppercase">{{ date.day }}</time>
      <span class="text-xs text-white/75">
        <span class="capitalize">{{ date.weekday }}</span> · Temporada
        {{ gameState.state.seasonNumber }}
      </span>
    </p>

    <div class="flex shrink-0 items-center gap-2 py-2 pr-2">
      <AppButton
        v-if="store.waitAvailable"
        size="sm"
        :disabled="store.busy"
        title="Pasa un mes sin club: la selección sigue y se abren otros banquillos"
        @click="waitMonth"
      >
        Esperar un mes
      </AppButton>
      <AppButton
        v-if="store.dayAvailable"
        size="sm"
        :disabled="store.busy"
        title="Juega sólo el día de hoy"
        @click="advanceDay"
      >
        <span class="flex items-center gap-1.5">
          <GameIcon name="day" :size="16" />
          Avanzar día
        </span>
      </AppButton>

      <AppButton
        variant="primary"
        size="lg"
        class="h-full min-w-[13.5rem]"
        :arrow="rival ? null : 'single'"
        :disabled="continueDisabled"
        :aria-busy="store.busy"
        @click="continueGame"
      >
        <span class="flex items-center gap-4">
          <span class="flex flex-col items-start leading-tight">
            <span>Continuar</span>
            <span
              v-if="detail"
              class="max-w-[12rem] truncate text-[11px] font-semibold normal-case tracking-normal opacity-80"
            >
              {{ detail }}
            </span>
          </span>
          <TeamBadge
            v-if="rival"
            :name="rival.teamName"
            :kit="kitOf(rival.teamId)"
            :nation-of="nationOf(rival.teamId)"
            :size="40"
          />
        </span>
      </AppButton>
    </div>
  </header>
</template>
