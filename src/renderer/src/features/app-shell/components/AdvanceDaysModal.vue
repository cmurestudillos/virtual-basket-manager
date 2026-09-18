<script setup lang="ts">
/**
 * «Avance de días» (IBM, 131047): el aviso que tapa la pantalla mientras
 * CONTINUAR simula.
 *
 * El mes en curso con el día de hoy recuadrado —se ve moverse a cada paso—, el
 * próximo partido con los días que faltan y el escudo del rival, y qué se está
 * simulando. Sale sólo si el avance tarda: un día sin partidos se resuelve antes
 * de que parpadee.
 *
 * «Detener avance» sólo aparece en los avances que son una cadena de llamadas
 * (ir al partido, jugar la jornada, seguir la temporada): se para al acabar la
 * llamada en curso. Esperar un mes, empezar temporada o avanzar un día son una
 * sola llamada al proceso principal y no se pueden cortar a medias.
 */
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { monthCells, monthOf } from '@shared/domain/calendar-month';
import { matchKits } from '@shared/domain/court';
import { AppButton, AppModal, TeamBadge } from '@renderer/shared/ui';
import { useGameStateStore } from '@renderer/shared/game-state.store';
import { useSeasonStore } from '@renderer/features/season/season.store';
import { useContinueStore } from '@renderer/features/season/continue.store';
import { progressText } from '@renderer/features/season/continue-action';

/** Lo que tiene que tardar un avance para que salga el aviso. */
const SHOW_AFTER_MS = 350;
const DAY_MS = 24 * 60 * 60 * 1000;

const store = useContinueStore();
const gameState = useGameStateStore();
const seasonStore = useSeasonStore();

const open = ref(false);
let timer: ReturnType<typeof setTimeout> | null = null;

watch(
  () => store.progress,
  (progress) => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    if (!progress) {
      open.value = false;
      return;
    }
    timer = setTimeout(() => {
      open.value = store.progress !== null;
    }, SHOW_AFTER_MS);
  }
);
onBeforeUnmount(() => {
  if (timer) clearTimeout(timer);
});

const MONTH = new Intl.DateTimeFormat('es-ES', { timeZone: 'UTC', month: 'long', year: 'numeric' });
const LONG_DAY = new Intl.DateTimeFormat('es-ES', {
  timeZone: 'UTC',
  day: 'numeric',
  month: 'short',
  year: 'numeric'
});
const WEEKDAYS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];

const today = computed(() => gameState.state?.currentDate ?? null);

/** El mes de hoy en semanas de lunes a domingo; `null` son huecos. */
const calendar = computed(() => {
  if (today.value === null) {
    return null;
  }
  const now = new Date(today.value);
  const nextGameOn = seasonStore.nextGame?.scheduledOn ?? null;

  const cells = monthCells(monthOf(now)).map((cell) =>
    cell
      ? {
          day: cell.day,
          state:
            cell.day < now.getUTCDate()
              ? ('past' as const)
              : cell.day === now.getUTCDate()
                ? ('today' as const)
                : ('future' as const),
          game: nextGameOn !== null && Math.abs(nextGameOn - cell.date) < DAY_MS / 2
        }
      : null
  );
  return { title: MONTH.format(now), cells };
});

const nextGame = computed(() => seasonStore.nextGame);
const daysLeft = computed(() =>
  nextGame.value && today.value !== null
    ? Math.max(0, Math.round((nextGame.value.scheduledOn - today.value) / DAY_MS))
    : null
);
const rival = computed(() => store.rival);
const text = computed(() =>
  store.progress ? progressText(store.progress.kind, rival.value?.teamName ?? null) : ''
);
</script>

<template>
  <AppModal :open="open" title="Avance de días" size="md" :dismissible="false">
    <div class="grid gap-4" :class="nextGame ? 'grid-cols-[1fr_12rem]' : 'grid-cols-1'">
      <section v-if="calendar" aria-label="Calendario del mes">
        <p
          class="bg-linear-to-r from-tv-head-from to-tv-head-to py-1.5 text-center text-sm font-bold uppercase tracking-wide text-white"
        >
          {{ calendar.title }}
        </p>
        <div class="mt-2 grid grid-cols-7 gap-[3px] text-center text-xs">
          <span v-for="weekday in WEEKDAYS" :key="weekday" class="py-1 font-bold text-tv-muted">
            {{ weekday }}
          </span>
          <span
            v-for="(cell, index) in calendar.cells"
            :key="index"
            class="figure flex h-8 items-start justify-end px-1.5 pt-0.5"
            :class="[
              !cell
                ? 'bg-transparent'
                : cell.game
                  ? 'bg-tv-competition font-bold text-white'
                  : cell.state === 'past'
                    ? 'bg-tv-cell-strong text-tv-muted'
                    : 'bg-tv-cell',
              cell?.state === 'today' ? 'outline-2 -outline-offset-2 outline-tv-cyan' : ''
            ]"
            :aria-current="cell?.state === 'today' ? 'date' : undefined"
          >
            {{ cell?.day ?? '' }}
          </span>
        </div>
      </section>

      <section v-if="nextGame" aria-label="Próximo partido" class="flex flex-col bg-tv-cell">
        <p
          class="bg-linear-to-r from-tv-head-from to-tv-head-to py-1.5 text-center text-sm font-bold uppercase tracking-wide text-white"
        >
          Próximo partido
        </p>
        <p v-if="daysLeft !== null" class="py-1 text-center text-xs text-tv-muted">
          {{ daysLeft === 0 ? 'Hoy' : daysLeft === 1 ? 'Falta 1 día' : `Faltan ${daysLeft} días` }}
        </p>
        <p class="bg-tv-blue-dim py-1 text-center text-xs font-bold uppercase text-white">
          {{ LONG_DAY.format(new Date(nextGame.scheduledOn)).replace('.', '') }}
        </p>
        <div class="flex flex-1 flex-col items-center justify-center gap-2 p-3 text-center">
          <TeamBadge
            v-if="rival"
            :name="rival.teamName"
            :kit="matchKits(rival.teamId, '').home"
            :nation-of="
              rival.teamId.startsWith('seleccion-')
                ? rival.teamId.replace('seleccion-', '').toUpperCase()
                : null
            "
            :size="64"
          />
          <p class="text-sm font-bold">
            {{ rival?.teamName ?? `${nextGame.homeTeamName} - ${nextGame.awayTeamName}` }}
          </p>
        </div>
      </section>
    </div>

    <p class="mt-4 flex items-center justify-center gap-3 text-sm" role="status">
      <span
        aria-hidden="true"
        class="h-4 w-4 animate-spin rounded-full border-2 border-tv-cell-strong border-t-tv-blue"
      ></span>
      {{ text }}
    </p>

    <template v-if="store.progress?.stoppable" #actions>
      <AppButton variant="primary" :disabled="store.stopRequested" @click="store.requestStop">
        {{ store.stopRequested ? 'Deteniendo…' : 'Detener avance' }}
      </AppButton>
    </template>
  </AppModal>
</template>
