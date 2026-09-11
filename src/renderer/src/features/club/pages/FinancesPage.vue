<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import type { BoardView, ClubFinances } from '@shared/contracts/club.contract';
import { MAX_TICKET_PRICE_CENTS, MIN_TICKET_PRICE_CENTS } from '@shared/domain/attendance';
import { useGameStateStore } from '@renderer/shared/game-state.store';
import { formatGameDate, formatMoney } from '@renderer/shared/format';
import { DANGER_CONFIDENCE } from '@shared/domain/board';
import { AppButton, AppPageHeader, AppSectionTitle, AppStat } from '@renderer/shared/ui';

const store = useGameStateStore();

const finances = ref<ClubFinances | null>(null);
const board = ref<BoardView | null>(null);
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

const balanceTone = computed(() =>
  (finances.value?.balanceCents ?? 0) >= 0 ? 'text-ball-500' : 'text-bad-400'
);

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

/** Los gastos llegan en negativo; en la tabla se leen mejor en positivo. */
function absolute(cents: number): string {
  return formatMoney(Math.abs(cents));
}
</script>

<template>
  <div v-if="finances" class="flex flex-col gap-5">
    <AppPageHeader title="Finanzas">
      <span class="text-sm text-court-300"> Las nóminas se pagan el primero de cada mes </span>
    </AppPageHeader>

    <!-- Resumen -->
    <div class="grid grid-cols-4 gap-4">
      <AppStat label="Caja" boxed :class="balanceTone">
        {{ formatMoney(finances.balanceCents) }}
      </AppStat>
      <AppStat label="Ingresos" boxed size="md">
        <span class="text-good-400">{{ formatMoney(finances.seasonIncomeCents) }}</span>
        <template #note>Gastos {{ absolute(finances.seasonExpenseCents) }}</template>
      </AppStat>
      <AppStat label="Nóminas" boxed size="md">
        {{ formatMoney(finances.monthlyWagesCents)
        }}<span class="text-sm text-court-300">/mes</span>
        <template #note>{{ formatMoney(finances.seasonWagesCents) }} al año</template>
      </AppStat>
      <AppStat label="Mantenimiento" boxed size="md">
        {{ formatMoney(finances.monthlyMaintenanceCents)
        }}<span class="text-sm text-court-300">/mes</span>
        <template #note>{{ finances.pavilionName }}</template>
      </AppStat>
    </div>

    <!-- Consejo -->
    <section
      v-if="board"
      class="rounded border px-5 py-4"
      :class="board.dismissed ? 'border-red-900' : 'border-court-700'"
    >
      <div class="flex items-center justify-between gap-6">
        <div>
          <AppSectionTitle size="xs">El consejo pide</AppSectionTitle>
          <p class="text-lg">
            {{ board.objectiveLabel }}
            <span class="text-sm text-court-300">
              · hace falta acabar {{ board.targetPosition }}º o mejor
            </span>
          </p>
          <p class="text-sm text-court-300">Ahora mismo vas {{ board.position ?? '—' }}º</p>
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

    <!-- Pabellón -->
    <section class="grid gap-5 rounded border border-court-700 p-5 md:grid-cols-2">
      <div class="flex flex-col gap-3">
        <AppSectionTitle>Pabellón y afición</AppSectionTitle>
        <dl class="grid grid-cols-2 gap-y-1 text-sm">
          <dt class="text-court-300">Aforo</dt>
          <dd class="text-right tabular-nums">{{ finances.capacity }}</dd>
          <dt class="text-court-300">Abonados</dt>
          <dd class="text-right tabular-nums">{{ finances.seasonTicketHolders }}</dd>
          <dt class="text-court-300">Ambiente</dt>
          <dd class="text-right">{{ finances.fanSupportLabel }} ({{ finances.fanSupport }})</dd>
          <dt class="text-court-300">Próximo partido en casa</dt>
          <dd class="text-right tabular-nums">
            {{ finances.expectedAttendance }} ({{ occupancy }}%)
          </dd>
          <dt class="text-court-300">Taquilla prevista</dt>
          <dd class="text-right tabular-nums">{{ formatMoney(finances.expectedGateCents) }}</dd>
        </dl>

        <label class="flex items-end gap-2">
          <span class="flex flex-1 flex-col gap-1">
            <span class="text-sm">Precio de la entrada (€)</span>
            <input
              v-model.number="priceEuros"
              type="number"
              :min="MIN_TICKET_PRICE_CENTS / 100"
              :max="MAX_TICKET_PRICE_CENTS / 100"
              class="rounded border border-court-600 bg-court-900 px-3 py-2"
            />
          </span>
          <AppButton variant="primary" :disabled="busy" @click="saveTicketPrice">
            Guardar
          </AppButton>
        </label>
        <span class="text-xs text-court-600">
          El abono sale por doce entradas: {{ formatMoney(finances.seasonTicketPriceCents) }}.
          Subirlo ingresa más por espectador y trae menos gente.
        </span>
      </div>

      <div class="flex flex-col gap-3">
        <AppSectionTitle>Obras</AppSectionTitle>
        <label class="flex items-end gap-2">
          <span class="flex flex-1 flex-col gap-1">
            <span class="text-sm">Asientos nuevos</span>
            <input
              v-model.number="seats"
              type="number"
              :min="finances.minExpansionSeats"
              :max="finances.maxExpansionSeats"
              :step="finances.minExpansionSeats"
              class="rounded border border-court-600 bg-court-900 px-3 py-2"
            />
          </span>
          <AppButton :disabled="busy" @click="expand"> Ampliar </AppButton>
        </label>
        <span class="text-xs text-court-600">
          Cuesta {{ formatMoney(expansionCost) }} y se paga al contado. El pabellón no puede pasar
          de {{ finances.maxCapacity }} espectadores.
        </span>

        <div v-if="finances.totals.length > 0" class="mt-2 flex flex-col gap-1 text-sm">
          <h3 class="text-xs uppercase tracking-wide text-court-300">Por concepto</h3>
          <p
            v-for="total in finances.totals"
            :key="total.type"
            class="flex justify-between border-b border-court-800 py-1"
          >
            <span class="text-court-300">{{ total.label }}</span>
            <span
              class="tabular-nums"
              :class="total.amountCents >= 0 ? 'text-good-400' : 'text-bad-400'"
            >
              {{ formatMoney(total.amountCents) }}
            </span>
          </p>
        </div>
      </div>
    </section>

    <p v-if="error" class="text-sm text-bad-400">{{ error }}</p>
    <p v-else-if="message" class="text-sm text-good-400">{{ message }}</p>

    <!-- Libro -->
    <div class="overflow-auto rounded border border-court-700">
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
            <td colspan="4" class="text-court-300">Todavía no se ha movido nada en la caja.</td>
          </tr>
          <tr v-for="entry in finances.entries" :key="entry.id">
            <td class="text-court-300">{{ formatGameDate(entry.happenedOn) }}</td>
            <td>{{ entry.typeLabel }}</td>
            <td class="text-court-300">{{ entry.description }}</td>
            <td class="numeric" :class="entry.amountCents >= 0 ? 'text-good-400' : 'text-bad-400'">
              {{ formatMoney(entry.amountCents) }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
