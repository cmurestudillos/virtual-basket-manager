<script setup lang="ts">
/**
 * Las finanzas del club, a la manera del resumen de IBM: la caja en la barra
 * negra de arriba, el consejo, el pabellón con el precio de la entrada y las
 * obras, los ingresos y los gastos de la temporada con su fila TOTAL en verde y
 * en rojo, y el libro de movimientos.
 *
 * Todo en una pantalla y sin pestañas propias: el arnés cambia el precio y lee
 * la asistencia prevista y los apuntes del libro sin moverse de aquí. Por eso
 * también el primer `article` es la caja, el primer panel es el consejo y la
 * asistencia prevista es el segundo dato de la ficha del pabellón.
 */
import { computed, onMounted, ref } from 'vue';
import type { BoardView, ClubFinances, FinanceTotal } from '@shared/contracts/club.contract';
import { MAX_TICKET_PRICE_CENTS, MIN_TICKET_PRICE_CENTS } from '@shared/domain/attendance';
import { squadMorale } from '@shared/domain/morale';
import { useGameStateStore } from '@renderer/shared/game-state.store';
import { formatGameDate, formatMoney, formatWhole } from '@renderer/shared/format';
import {
  AppBadge,
  AppButton,
  AppEmpty,
  AppPanel,
  AppRing,
  AppStepper,
  KeyValueList,
  TONE_TEXT,
  type KeyValueItem
} from '@renderer/shared/ui';
import ConfidenceRings from '../components/ConfidenceRings.vue';

const store = useGameStateStore();

const finances = ref<ClubFinances | null>(null);
const board = ref<BoardView | null>(null);
/** La moral media de la plantilla: la confianza de los jugadores. */
const playersConfidence = ref<number | null>(null);
const priceEuros = ref(20);
const seats = ref(1000);
const busy = ref(false);
const message = ref<string | null>(null);
const error = ref<string | null>(null);

const occupancy = computed(() => {
  if (!finances.value || finances.value.capacity === 0) {
    return 0;
  }
  return Math.round((finances.value.expectedAttendance / finances.value.capacity) * 100);
});

const expansionCost = computed(() =>
  finances.value ? seats.value * finances.value.expansionCostPerSeatCents : 0
);

/**
 * La ficha del pabellón. El orden importa: la asistencia prevista va segunda
 * porque el arnés la busca ahí para comprobar que bajar el precio llena más.
 */
const ARENA_FACTS: KeyValueItem[] = [
  { id: 'capacity', label: 'Aforo' },
  { id: 'attendance', label: 'Próximo partido en casa' },
  { id: 'gate', label: 'Taquilla prevista' },
  { id: 'holders', label: 'Abonados' },
  { id: 'support', label: 'Ambiente' }
];

/**
 * Cada concepto va con los ingresos o con los gastos según su saldo, y el TOTAL
 * es la suma de lo que se ve: un traspaso cobrado y otro pagado se compensan en
 * su fila, y el total cuadra con la tabla que tiene encima.
 */
const incomeTotals = computed(() =>
  (finances.value?.totals ?? []).filter((t) => t.amountCents >= 0)
);
const expenseTotals = computed(() =>
  (finances.value?.totals ?? []).filter((t) => t.amountCents < 0)
);

function sum(totals: readonly FinanceTotal[]): number {
  return totals.reduce((total, entry) => total + entry.amountCents, 0);
}

function asItems(totals: readonly FinanceTotal[]): KeyValueItem[] {
  return totals.map((total) => ({
    id: total.type,
    label: total.label,
    value: absolute(total.amountCents)
  }));
}

onMounted(async () => {
  if (!store.state) {
    await store.refresh();
  }
  await reload();
});

async function reload(): Promise<void> {
  if (!store.state) {
    return;
  }
  finances.value = await window.api.club.getFinances(store.state.teamId);
  board.value = await window.api.club.getBoard();
  const roster = await window.api.players.listByTeam(store.state.teamId);
  // La plantilla es la propia: la moral llega de todos (sólo la de fuera viene vacía).
  playersConfidence.value = squadMorale(
    roster.flatMap((player) => (player.morale === null ? [] : [player.morale]))
  );
  priceEuros.value = Math.round(finances.value.ticketPriceCents / 100);
}

async function run(action: () => Promise<ClubFinances>, done: string): Promise<void> {
  busy.value = true;
  error.value = null;
  message.value = null;
  try {
    finances.value = await action();
    priceEuros.value = Math.round(finances.value.ticketPriceCents / 100);
    message.value = done;
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'No se pudo hacer la operación';
  } finally {
    busy.value = false;
  }
}

function saveTicketPrice(): void {
  if (!finances.value) {
    return;
  }
  const priceCents = Math.round(priceEuros.value * 100);
  void run(
    () => window.api.club.setTicketPrice({ teamId: finances.value!.teamId, priceCents }),
    'Precio actualizado.'
  );
}

function expand(): void {
  if (!finances.value) {
    return;
  }
  void run(
    () => window.api.club.expandArena({ teamId: finances.value!.teamId, seats: seats.value }),
    'Obra encargada.'
  );
}

/** Cifras de personas con el punto de los miles, como en el inicio: «10.262». */
function whole(value: number): string {
  return formatWhole(value);
}

/** Los gastos llegan en negativo; en la tabla se leen mejor en positivo. */
function absolute(cents: number): string {
  return formatMoney(Math.abs(cents));
}
</script>

<template>
  <div v-if="finances" class="flex flex-col gap-3">
    <!-- La barra negra del resumen de IBM: el dinero que hay y el que se va cada mes. -->
    <header class="flex flex-wrap items-center gap-x-8 gap-y-2 bg-tv-slab px-4 py-2.5 text-white">
      <article class="flex items-baseline gap-2">
        <h2 class="text-sm font-bold uppercase tracking-wide text-white/70">Caja</h2>
        <p
          class="figure text-xl font-bold"
          :class="finances.balanceCents < 0 ? 'text-tv-mood-low' : 'text-tv-rate-top'"
        >
          {{ formatMoney(finances.balanceCents) }}
        </p>
      </article>
      <article class="flex items-baseline gap-2">
        <h2 class="text-xs font-bold uppercase tracking-wide text-white/70">Nóminas</h2>
        <p class="figure text-base font-bold">
          {{ formatMoney(finances.monthlyWagesCents) }}<span class="text-xs font-normal">/mes</span>
        </p>
        <p class="text-xs text-white/70">{{ formatMoney(finances.seasonWagesCents) }} al año</p>
      </article>
      <article class="flex items-baseline gap-2">
        <h2 class="text-xs font-bold uppercase tracking-wide text-white/70">Mantenimiento</h2>
        <p class="figure text-base font-bold">
          {{ formatMoney(finances.monthlyMaintenanceCents)
          }}<span class="text-xs font-normal">/mes</span>
        </p>
      </article>
      <p class="ml-auto text-xs text-white/70">Las nóminas se pagan el primero de cada mes</p>
    </header>

    <div class="grid grid-cols-3 items-start gap-3">
      <!-- Consejo -->
      <AppPanel v-if="board" title="Consejo" :hint="board.teamName">
        <div class="flex flex-col gap-3">
          <div class="flex min-w-0 flex-col gap-1 text-sm">
            <p class="text-xs font-bold uppercase tracking-wide">El consejo pide</p>
            <p class="text-lg font-bold leading-tight">{{ board.objectiveLabel }}</p>
            <p :class="TONE_TEXT.neutral">
              Hace falta acabar {{ board.targetPosition }}º o mejor. Ahora mismo vas
              {{ board.position ?? '—' }}º.
            </p>
            <p v-if="board.dismissed"><AppBadge tone="bad">Destituido</AppBadge></p>
          </div>
          <ConfidenceRings
            class="bg-tv-cell px-3 py-3"
            :board="board.confidence"
            :board-note="board.confidenceLabel"
            :fans="finances.fanSupport"
            :fans-note="finances.fanSupportLabel"
            :players="playersConfidence"
          />
        </div>
      </AppPanel>

      <!-- Pabellón y entradas -->
      <AppPanel title="Pabellón y afición" :hint="finances.pavilionName">
        <div class="flex flex-col gap-3">
          <KeyValueList :items="ARENA_FACTS">
            <template #value="{ item }">
              <span v-if="item.id === 'capacity'" class="figure">{{
                whole(finances.capacity)
              }}</span>
              <span v-else-if="item.id === 'attendance'" class="figure">
                {{ whole(finances.expectedAttendance) }} ({{ occupancy }}%)
              </span>
              <span v-else-if="item.id === 'gate'" class="figure">
                {{ formatMoney(finances.expectedGateCents) }}
              </span>
              <span v-else-if="item.id === 'holders'" class="figure">
                {{ whole(finances.seasonTicketHolders) }}
              </span>
              <template v-else>
                {{ finances.fanSupportLabel }}
                <AppRing :value="finances.fanSupport" :size="26" />
              </template>
            </template>
          </KeyValueList>

          <div class="flex items-end justify-between gap-3">
            <div class="flex flex-col gap-1">
              <span class="text-xs font-bold uppercase tracking-wide"
                >Precio de la entrada (€)</span
              >
              <AppStepper
                v-model="priceEuros"
                :min="MIN_TICKET_PRICE_CENTS / 100"
                :max="MAX_TICKET_PRICE_CENTS / 100"
                label="Precio de la entrada en euros"
              />
            </div>
            <AppButton variant="primary" :disabled="busy" @click="saveTicketPrice">
              Guardar
            </AppButton>
          </div>
          <p class="text-xs" :class="TONE_TEXT.neutral">
            El abono sale por doce entradas: {{ formatMoney(finances.seasonTicketPriceCents) }}.
            Subirlo ingresa más por espectador y trae menos gente.
          </p>
        </div>
      </AppPanel>

      <!-- Obras -->
      <AppPanel title="Ampliación">
        <div class="flex flex-col gap-3">
          <div class="flex items-end justify-between gap-3">
            <div class="flex flex-col gap-1">
              <span class="text-xs font-bold uppercase tracking-wide">Asientos nuevos</span>
              <AppStepper
                v-model="seats"
                :min="finances.minExpansionSeats"
                :max="finances.maxExpansionSeats"
                :step="finances.minExpansionSeats"
                label="Asientos nuevos"
              />
            </div>
            <AppButton variant="primary" :disabled="busy" @click="expand">Ampliar</AppButton>
          </div>
          <p class="flex items-baseline justify-between bg-tv-slab px-3 py-2 text-white">
            <span class="text-sm font-bold uppercase tracking-wide">Coste total</span>
            <span class="figure font-bold">{{ formatMoney(expansionCost) }}</span>
          </p>
          <p class="text-xs" :class="TONE_TEXT.neutral">
            Se paga al contado. El pabellón no puede pasar de {{ finances.maxCapacity }}
            espectadores.
          </p>
        </div>
      </AppPanel>
    </div>

    <p
      v-if="error"
      role="alert"
      class="bg-tv-paper px-3 py-2 text-sm font-semibold"
      :class="TONE_TEXT.bad"
    >
      {{ error }}
    </p>
    <p
      v-else-if="message"
      role="status"
      class="bg-tv-paper px-3 py-2 text-sm font-semibold text-tv-ink"
    >
      {{ message }}
    </p>

    <!-- Ingresos y gastos de la temporada, con su fila TOTAL -->
    <div class="grid grid-cols-2 items-start gap-3">
      <AppPanel title="Ingresos" hint="Esta temporada" flush>
        <KeyValueList v-if="incomeTotals.length > 0" :items="asItems(incomeTotals)" />
        <AppEmpty v-else>Todavía no ha entrado dinero esta temporada.</AppEmpty>
        <p
          class="flex items-baseline justify-between bg-linear-to-r from-tv-green to-tv-green-ink px-3 py-2 font-bold text-white"
        >
          <span class="uppercase tracking-wide">Total</span>
          <span class="figure">{{ formatMoney(sum(incomeTotals)) }}</span>
        </p>
      </AppPanel>
      <AppPanel title="Gastos" hint="Esta temporada" flush>
        <KeyValueList v-if="expenseTotals.length > 0" :items="asItems(expenseTotals)" />
        <AppEmpty v-else>Todavía no ha salido dinero esta temporada.</AppEmpty>
        <p
          class="flex items-baseline justify-between bg-linear-to-r from-tv-red to-tv-red-deep px-3 py-2 font-bold text-white"
        >
          <span class="uppercase tracking-wide">Total</span>
          <span class="figure">{{ formatMoney(sum(expenseTotals)) }}</span>
        </p>
      </AppPanel>
    </div>

    <!-- Libro -->
    <AppPanel title="Movimientos" :hint="`${finances.entries.length} apuntes`" flush>
      <table class="data-table">
        <thead>
          <tr>
            <th>Fecha</th>
            <th>Concepto</th>
            <th>Detalle</th>
            <th class="numeric">Importe</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="finances.entries.length === 0">
            <td colspan="4" class="text-center text-tv-muted">
              Todavía no se ha movido nada en la caja.
            </td>
          </tr>
          <tr v-for="entry in finances.entries" :key="entry.id">
            <td>{{ formatGameDate(entry.happenedOn) }}</td>
            <td>{{ entry.typeLabel }}</td>
            <td>
              <span class="block max-w-md truncate">{{ entry.description }}</span>
            </td>
            <td
              class="numeric font-semibold"
              :class="entry.amountCents >= 0 ? TONE_TEXT.good : TONE_TEXT.bad"
            >
              {{ formatMoney(entry.amountCents) }}
            </td>
          </tr>
        </tbody>
      </table>
    </AppPanel>
  </div>
</template>
