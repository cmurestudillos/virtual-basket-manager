<script setup lang="ts">
/**
 * El calendario mensual, sección propia (fase 5 del estilo IBM, captura 130405).
 *
 * El mes de lunes a domingo en seis semanas fijas —para que la rejilla no
 * cambie de alto de un mes a otro—, con el paginador del mes en el rótulo. Cada
 * día con partido lleva el escudo del rival, la franja del color de su
 * competición y la «V» o la «D» si ya se jugó; hoy, el borde cian. A la
 * derecha, el día elegido con su partido, sus citas y la leyenda.
 *
 * Sólo lo sorteado: la Copa, los cuadros y los playoffs aparecen cuando existen
 * sus partidos, sin avisos de antes (decisión del usuario). Sólo la temporada en
 * curso: el paginador se apaga en septiembre y en agosto.
 *
 * Abre en el mes de hoy. «Hoy», abajo, vuelve a él; con club y selección a la
 * vez, «Club / Selección» arriba elige cuál de los dos calendarios se ve.
 */
import { computed, onMounted, ref, watch } from 'vue';
import type {
  CalendarDayEvent,
  CalendarGame,
  CalendarMonth,
  CalendarScope
} from '@shared/contracts/calendar.contract';
import {
  monthCells,
  monthFromIndex,
  monthIndex,
  monthOf,
  type MonthRef
} from '@shared/domain/calendar-month';
import { useGameStateStore } from '@renderer/shared/game-state.store';
import {
  AppButton,
  AppEmpty,
  AppPager,
  AppPanel,
  AppSegmented,
  type SegmentOption
} from '@renderer/shared/ui';
import PageActions from '@renderer/features/app-shell/components/PageActions.vue';
import PageToolbar from '@renderer/features/app-shell/components/PageToolbar.vue';
import CalendarDayCell from '../components/CalendarDayCell.vue';
import CalendarDayPanel from '../components/CalendarDayPanel.vue';

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEKDAYS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
const MONTH_TITLE = new Intl.DateTimeFormat('es-ES', {
  timeZone: 'UTC',
  month: 'long',
  year: 'numeric'
});
const SCOPE_OPTIONS: SegmentOption[] = [
  { id: 'club', label: 'Club' },
  { id: 'national', label: 'Selección' }
];

const gameState = useGameStateStore();

const view = ref<CalendarMonth | null>(null);
const scope = ref<CalendarScope>('club');
const selectedDay = ref<number | null>(null);
const error = ref<string | null>(null);

/** El día a las 00:00 UTC: la clave con la que se cruzan casillas, partidos y citas. */
function dayOf(milliseconds: number): number {
  return Math.floor(milliseconds / DAY_MS) * DAY_MS;
}

const today = computed(() => (view.value ? dayOf(view.value.today) : null));

async function load(month: MonthRef, select?: number): Promise<void> {
  error.value = null;
  try {
    const result = await window.api.calendar.getMonth({ year: month.year, month: month.month });
    view.value = result;
    if (!result.scopes.includes(scope.value) && result.scopes[0]) {
      scope.value = result.scopes[0];
    }
    // El día elegido: el que se pide, hoy si cae en el mes, o el primero.
    const todayKey = dayOf(result.today);
    const inMonth = (key: number): boolean =>
      monthIndex(monthOf(key)) === monthIndex({ year: result.year, month: result.month });
    selectedDay.value =
      select !== undefined && inMonth(select)
        ? dayOf(select)
        : inMonth(todayKey)
          ? todayKey
          : Date.UTC(result.year, result.month - 1, 1);
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : String(cause);
  }
}

async function goToToday(): Promise<void> {
  if (!gameState.state) await gameState.refresh();
  const now = gameState.state?.currentDate;
  if (now !== undefined) await load(monthOf(now), now);
}

onMounted(goToToday);

// Al avanzar el reloj (CONTINUAR) cambia lo jugado y puede cambiar el mes.
watch(
  () => gameState.state?.currentDate,
  (now, before) => {
    if (now !== undefined && before !== undefined && now !== before && view.value) {
      void load({ year: view.value.year, month: view.value.month }, selectedDay.value ?? now);
    }
  }
);

const pagerIndex = computed({
  get: () => (view.value ? monthIndex(view.value) : 0),
  set: (index: number) => void load(monthFromIndex(index))
});

const title = computed(() =>
  view.value
    ? MONTH_TITLE.format(new Date(Date.UTC(view.value.year, view.value.month - 1, 1))).replace(
        ' de ',
        ' '
      )
    : ''
);

const games = computed(() =>
  (view.value?.games ?? []).filter((game) => game.scope === scope.value)
);
/** Las citas del club no pintan en el calendario de la selección. */
const events = computed(() =>
  (view.value?.events ?? []).filter((event) => event.scope === null || scope.value === 'club')
);

function byDay<T>(items: readonly T[], dateOf: (item: T) => number): Map<number, T[]> {
  const map = new Map<number, T[]>();
  for (const item of items) {
    const key = dayOf(dateOf(item));
    map.set(key, [...(map.get(key) ?? []), item]);
  }
  return map;
}

const gamesByDay = computed(() => byDay<CalendarGame>(games.value, (game) => game.scheduledOn));
const eventsByDay = computed(() => byDay<CalendarDayEvent>(events.value, (event) => event.on));

const cells = computed(() => (view.value ? monthCells(view.value, 6) : []));
</script>

<template>
  <div class="grid h-full grid-cols-[minmax(0,1fr)_19rem] grid-rows-[minmax(0,1fr)] gap-4">
    <PageToolbar v-if="view && view.scopes.length > 1">
      <AppSegmented
        :model-value="scope"
        :options="SCOPE_OPTIONS"
        @update:model-value="scope = $event as CalendarScope"
      />
    </PageToolbar>
    <PageActions>
      <AppButton variant="primary" @click="goToToday">Hoy</AppButton>
    </PageActions>

    <AppPanel v-if="error" title="Calendario" class="col-span-2">
      <AppEmpty>No se pudo leer el calendario: {{ error }}</AppEmpty>
    </AppPanel>

    <AppPanel v-else-if="!view" title="Calendario" class="col-span-2">
      <AppEmpty>Leyendo el calendario de la temporada…</AppEmpty>
    </AppPanel>

    <template v-else>
      <AppPanel scroll>
        <template #header>
          <AppPager
            v-model="pagerIndex"
            :min="monthIndex(view.first)"
            :max="monthIndex(view.last)"
            label="Mes"
          >
            <span class="min-w-40 inline-block">{{ title }}</span>
          </AppPager>
        </template>

        <div
          class="grid h-full min-h-[18rem] grid-cols-7 grid-rows-[auto_repeat(6,minmax(0,1fr))] gap-[3px]"
          role="group"
          :aria-label="`Calendario de ${title}`"
        >
          <span
            v-for="weekday in WEEKDAYS"
            :key="weekday"
            class="truncate pb-1 text-center text-xs font-semibold uppercase tracking-wide text-tv-muted"
            aria-hidden="true"
          >
            {{ weekday }}
          </span>
          <template v-for="(cell, index) in cells" :key="index">
            <CalendarDayCell
              v-if="cell"
              :day="cell.day"
              :game="gamesByDay.get(cell.date)?.[0] ?? null"
              :events="eventsByDay.get(cell.date) ?? []"
              :is-today="cell.date === today"
              :is-past="today !== null && cell.date < today"
              :selected="cell.date === selectedDay"
              @select="selectedDay = cell.date"
            />
            <span v-else class="bg-tv-cell opacity-40" aria-hidden="true"></span>
          </template>
        </div>
      </AppPanel>

      <CalendarDayPanel
        v-if="selectedDay !== null"
        :day="selectedDay"
        :games="gamesByDay.get(selectedDay) ?? []"
        :events="eventsByDay.get(selectedDay) ?? []"
      />
    </template>
  </div>
</template>
