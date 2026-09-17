<script setup lang="ts">
/**
 * El mercado: fichar, renovar y ceder.
 *
 * La pantalla lleva la conversación con el proceso principal y el estado de la
 * negociación; lo que se ve está en `features/market/components/`. Las pestañas
 * (Fichar, Contratos, Cesiones) y los filtros de la búsqueda van en la barra de
 * sección, como en IBM; la barra negra de arriba dice qué ventana hay y lo que
 * limita lo que se puede hacer en ella.
 *
 * El mensaje de la última operación va al final a propósito: el arnés lee la
 * respuesta a una oferta en el último párrafo de la pantalla.
 */
import { computed, onMounted, ref } from 'vue';
import type {
  ContractEntry,
  LoanEntry,
  MarketPlayer,
  MarketStatus
} from '@shared/contracts/market.contract';
import { type Position, POSITION_LABELS, POSITIONS } from '@shared/domain/positions';
import { formatMoney } from '@renderer/shared/format';
import {
  AppButton,
  AppCheckbox,
  AppInput,
  AppModal,
  AppSelect,
  AppTabs,
  TONE_TEXT,
  type SelectOption
} from '@renderer/shared/ui';
import PageToolbar from '@renderer/features/app-shell/components/PageToolbar.vue';
import MarketStatusBar from '../components/MarketStatusBar.vue';
import OfferPanel from '../components/OfferPanel.vue';
import MarketSearchTable from '../components/MarketSearchTable.vue';
import ContractsTable from '../components/ContractsTable.vue';
import LoansTable from '../components/LoansTable.vue';

type Tab = 'search' | 'contracts' | 'loans';

const TABS: { id: Tab; label: string }[] = [
  { id: 'search', label: 'Fichar' },
  { id: 'contracts', label: 'Contratos' },
  { id: 'loans', label: 'Cesiones' }
];

/** El puesto en español, como en todo el juego; vacío es «todos». */
const POSITION_OPTIONS: SelectOption[] = [
  { id: '', label: 'Todos los puestos' },
  ...POSITIONS.map((pos) => ({ id: pos, label: POSITION_LABELS[pos] }))
];

const tab = ref<Tab>('search');
const status = ref<MarketStatus | null>(null);
const results = ref<MarketPlayer[]>([]);
const contracts = ref<ContractEntry[]>([]);
const loans = ref<LoanEntry[]>([]);
/** Lo que aceptaría el club de la última oferta, si se quedó cerca. */
const counterOffer = ref<number | null>(null);
const busy = ref(false);
const message = ref<string | null>(null);
const error = ref<string | null>(null);

// Filtros de la búsqueda.
const position = ref<Position | ''>('');
const freeAgentsOnly = ref(false);
const maxAge = ref<number | null>(null);

// Oferta en curso.
const target = ref<MarketPlayer | null>(null);
const feeEuros = ref(0);
const wageEuros = ref(0);
const years = ref(2);

const canAfford = computed(
  () => (status.value?.balanceCents ?? 0) >= Math.round(feeEuros.value * 100)
);

onMounted(async () => {
  await refresh();
  await runSearch();
});

async function refresh(): Promise<void> {
  status.value = await window.api.market.getStatus();
  contracts.value = await window.api.market.listContracts();
  loans.value = await window.api.market.listLoans();
}

/** Margen de nómina que queda antes de tocar el tope del consejo. */
const wageHeadroom = computed(() =>
  status.value ? status.value.wageCeilingCents - status.value.seasonWagesCents : 0
);

async function runSearch(): Promise<void> {
  results.value = await window.api.market.search({
    position: position.value === '' ? null : position.value,
    freeAgentsOnly: freeAgentsOnly.value,
    maxAge: maxAge.value,
    maxFeeCents: null,
    limit: 40
  });
}

function filterByPosition(value: string): void {
  position.value = value as Position | '';
  void runSearch();
}

function filterByFreeAgents(value: boolean): void {
  freeAgentsOnly.value = value;
  void runSearch();
}

/**
 * Abre la oferta con lo que pide el club y el jugador: el punto de partida.
 *
 * Se redondea hacia arriba a propósito. La pantalla trabaja en euros y el
 * motor en céntimos, así que redondear hacia abajo dejaría la oferta unos
 * céntimos por debajo de lo que pide el jugador y el club contestaría que no a
 * lo que el usuario ve como la cifra exacta.
 */
function openOffer(player: MarketPlayer): void {
  target.value = player;
  feeEuros.value = Math.ceil(player.askingPriceCents / 100);
  wageEuros.value = Math.ceil(player.wageDemandCents / 100);
  years.value = 2;
  message.value = null;
  error.value = null;
  counterOffer.value = null;
}

/** Acepta lo que ha pedido el club y vuelve a ofertar con esa cifra. */
function acceptCounter(): void {
  if (counterOffer.value === null) {
    return;
  }
  feeEuros.value = Math.ceil(counterOffer.value / 100);
  counterOffer.value = null;
  void submitOffer();
}

async function submitOffer(): Promise<void> {
  if (!target.value) {
    return;
  }

  busy.value = true;
  error.value = null;
  message.value = null;
  try {
    const result = await window.api.market.offer({
      playerId: target.value.playerId,
      feeCents: Math.round(feeEuros.value * 100),
      wageCents: Math.round(wageEuros.value * 100),
      years: years.value
    });

    status.value = result.status;
    message.value = result.reason;
    counterOffer.value = result.counterOfferCents ?? null;
    if (result.accepted) {
      target.value = null;
      await refresh();
      await runSearch();
    }
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'No se pudo hacer la oferta';
  } finally {
    busy.value = false;
  }
}

async function renew(entry: ContractEntry): Promise<void> {
  busy.value = true;
  error.value = null;
  try {
    contracts.value = await window.api.market.renew({
      playerId: entry.playerId,
      wageCents: entry.renewalWageCents,
      years: 3
    });
    message.value = `${entry.playerName} renueva por tres temporadas.`;
    await refresh();
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'No se pudo renovar';
  } finally {
    busy.value = false;
  }
}

async function loanOut(entry: ContractEntry): Promise<void> {
  busy.value = true;
  error.value = null;
  try {
    const result = await window.api.market.loanOut({ playerId: entry.playerId });
    message.value = result.reason;
    await refresh();
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'No se pudo ceder';
  } finally {
    busy.value = false;
  }
}

async function loanIn(player: MarketPlayer): Promise<void> {
  busy.value = true;
  error.value = null;
  try {
    const result = await window.api.market.loanIn({ playerId: player.playerId });
    message.value = result.reason;
    if (result.accepted) {
      await refresh();
      await runSearch();
    }
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'No se pudo pedir cedido';
  } finally {
    busy.value = false;
  }
}

/**
 * El contrato que se va a rescindir, a la espera de que se confirme. Rescindir
 * cuesta dinero y no tiene vuelta atrás: se pregunta antes, igual que en la ficha
 * del jugador.
 */
const releasing = ref<ContractEntry | null>(null);

async function release(entry: ContractEntry): Promise<void> {
  releasing.value = null;
  busy.value = true;
  error.value = null;
  try {
    contracts.value = await window.api.market.release({ playerId: entry.playerId });
    message.value = `${entry.playerName} queda libre.`;
    await refresh();
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'No se pudo rescindir';
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <!-- Alto de la zona de la pantalla: las tablas se desplazan dentro de su panel. -->
  <div v-if="status" class="flex h-full min-h-0 flex-col gap-3">
    <PageToolbar place="tabs">
      <AppTabs :model-value="tab" :options="TABS" @update:model-value="tab = $event as Tab" />
    </PageToolbar>

    <PageToolbar v-if="tab === 'search'">
      <AppSelect
        :model-value="position"
        :options="POSITION_OPTIONS"
        label="Puesto"
        @update:model-value="filterByPosition"
      />
      <label
        class="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-white/70"
      >
        Edad máx.
        <AppInput
          v-model="maxAge"
          type="number"
          min="16"
          max="45"
          placeholder="—"
          class="w-16"
          @change="runSearch"
        />
      </label>
      <AppCheckbox
        :model-value="freeAgentsOnly"
        class="text-white"
        @update:model-value="filterByFreeAgents"
      >
        Sólo agentes libres
      </AppCheckbox>
    </PageToolbar>

    <MarketStatusBar :status="status" />
    <p v-if="status.salaryCap" class="-mt-1 text-xs text-white/70">
      Tope salarial blando: por debajo del tope se firma lo que quepa; por encima, sólo contratos
      mínimos ({{ formatMoney(status.salaryCap.minimumCents) }}). Renovar a los tuyos no cuenta,
      pero la nómina por encima del umbral paga impuesto de lujo al cerrar la temporada.
    </p>

    <template v-if="tab === 'search'">
      <OfferPanel
        v-if="target"
        v-model:fee="feeEuros"
        v-model:wage="wageEuros"
        v-model:years="years"
        :target="target"
        :open="status.isOpen"
        :busy="busy"
        :can-afford="canAfford"
        :counter-offer="counterOffer"
        :wage-headroom-cents="wageHeadroom"
        @submit="submitOffer"
        @cancel="target = null"
        @accept-counter="acceptCounter"
      />
      <MarketSearchTable
        :players="results"
        :open="status.isOpen"
        :busy="busy"
        @offer="openOffer"
        @loan-in="loanIn"
      />
    </template>

    <ContractsTable
      v-else-if="tab === 'contracts'"
      :contracts="contracts"
      :busy="busy"
      @renew="renew"
      @loan-out="loanOut"
      @release="releasing = $event"
    />

    <LoansTable v-else :loans="loans" />

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

    <AppModal :open="releasing !== null" title="Rescindir contrato" @close="releasing = null">
      <p v-if="releasing" class="text-sm">
        {{ releasing.playerName }} quedará libre y el club le pagará
        {{ formatMoney(releasing.releaseCostCents) }}.
      </p>
      <template #actions>
        <AppButton
          variant="danger"
          class="min-w-40"
          :disabled="busy"
          @click="releasing && release(releasing)"
        >
          Rescindir
        </AppButton>
        <AppButton class="min-w-40" @click="releasing = null">Cancelar</AppButton>
      </template>
    </AppModal>
  </div>
</template>
