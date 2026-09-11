<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import type {
  ContractEntry,
  LoanEntry,
  MarketPlayer,
  MarketStatus
} from '@shared/contracts/market.contract';
import { MAX_CONTRACT_YEARS, MIN_CONTRACT_YEARS } from '@shared/domain/market';
import { POSITIONS, type Position } from '@shared/domain/positions';
import { formatMoney } from '@renderer/shared/format';
import { AppButton, AppTabs, AppPageHeader } from '@renderer/shared/ui';

type Tab = 'search' | 'contracts' | 'loans';

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

async function release(entry: ContractEntry): Promise<void> {
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
  <div v-if="status" class="flex flex-col gap-4">
    <AppPageHeader title="Mercado">
      <span :class="status.isOpen ? 'text-sm text-ball-400' : 'text-sm text-court-300'">
        {{ status.windowLabel }}
      </span>
      <span class="ml-auto text-sm text-court-300">
        Caja {{ formatMoney(status.balanceCents) }} · plantilla {{ status.rosterSize }}/{{
          status.maxRoster
        }}
        · formación
        <span :class="status.homegrownInSquad <= status.minHomegrown ? 'text-line-500' : ''">
          {{ status.homegrownInSquad }}/{{ status.minHomegrown }}
        </span>
        · nóminas {{ formatMoney(status.seasonWagesCents) }} de
        {{ formatMoney(status.wageCeilingCents) }}
      </span>
    </AppPageHeader>

    <AppTabs
      :model-value="tab"
      :options="[
        { id: 'search' as Tab, label: 'Fichar' },
        { id: 'contracts' as Tab, label: 'Contratos' },
        { id: 'loans' as Tab, label: 'Cesiones' }
      ]"
      @update:model-value="tab = $event as Tab"
    />

    <template v-if="tab === 'search'">
      <!-- Filtros -->
      <section class="flex flex-wrap items-end gap-3 rounded border border-court-700 p-4">
        <label class="flex flex-col gap-1 text-sm">
          <span class="text-court-300">Puesto</span>
          <select
            v-model="position"
            class="rounded border border-court-600 bg-court-900 px-3 py-1"
            @change="runSearch"
          >
            <option value="">Todos</option>
            <option v-for="pos in POSITIONS" :key="pos" :value="pos">{{ pos }}</option>
          </select>
        </label>
        <label class="flex flex-col gap-1 text-sm">
          <span class="text-court-300">Edad máxima</span>
          <input
            v-model.number="maxAge"
            type="number"
            min="16"
            max="45"
            class="w-24 rounded border border-court-600 bg-court-900 px-3 py-1"
            @change="runSearch"
          />
        </label>
        <label class="flex items-center gap-2 text-sm">
          <input
            v-model="freeAgentsOnly"
            type="checkbox"
            class="accent-ball-500"
            @change="runSearch"
          />
          <span>Sólo agentes libres</span>
        </label>
        <span class="ml-auto text-xs text-court-600">
          Lo que ves de un jugador de fuera lleva el margen de tu ojeador
        </span>
      </section>

      <!-- Oferta en curso -->
      <section v-if="target" class="rounded border border-ball-600 p-4">
        <div class="flex flex-wrap items-end gap-4">
          <div>
            <p class="text-xs uppercase tracking-wide text-court-300">Oferta por</p>
            <p class="text-lg">
              {{ target.playerName }}
              <span class="text-sm text-court-300">
                {{ target.position }} · {{ target.age }} años ·
                {{ target.teamName ?? 'agente libre' }}
              </span>
            </p>
          </div>
          <label class="flex flex-col gap-1 text-sm">
            <span class="text-court-300">Traspaso (€)</span>
            <input
              v-model.number="feeEuros"
              type="number"
              min="0"
              :disabled="target.isFreeAgent"
              class="w-40 rounded border border-court-600 bg-court-900 px-3 py-1 disabled:opacity-40"
            />
          </label>
          <label class="flex flex-col gap-1 text-sm">
            <span class="text-court-300">Ficha anual (€)</span>
            <input
              v-model.number="wageEuros"
              type="number"
              min="0"
              class="w-40 rounded border border-court-600 bg-court-900 px-3 py-1"
            />
          </label>
          <label class="flex flex-col gap-1 text-sm">
            <span class="text-court-300">Años</span>
            <input
              v-model.number="years"
              type="number"
              :min="MIN_CONTRACT_YEARS"
              :max="MAX_CONTRACT_YEARS"
              class="w-20 rounded border border-court-600 bg-court-900 px-3 py-1"
            />
          </label>
          <AppButton
            variant="primary"
            :disabled="busy || !status.isOpen || !canAfford"
            @click="submitOffer"
          >
            Ofertar
          </AppButton>
          <AppButton @click="target = null"> Cancelar </AppButton>
        </div>
        <p v-if="!canAfford" class="mt-2 text-sm text-line-500">No hay tanto dinero en caja.</p>
        <div v-if="counterOffer !== null" class="mt-3 flex items-center gap-3">
          <span class="text-sm text-court-300">
            El club se lo dejaría en {{ formatMoney(counterOffer) }}.
          </span>
          <AppButton variant="primary" size="sm" :disabled="busy" @click="acceptCounter">
            Aceptar contraoferta
          </AppButton>
        </div>
        <p class="mt-2 text-xs text-court-600">
          Margen de nómina antes del tope: {{ formatMoney(wageHeadroom) }}
        </p>
      </section>

      <div class="overflow-auto rounded border border-court-700">
        <table class="data-table">
          <thead>
            <tr>
              <th>Jugador</th>
              <th>Equipo</th>
              <th>Pos</th>
              <th class="numeric">Edad</th>
              <th class="numeric">Media</th>
              <th class="numeric">Techo</th>
              <th class="numeric">Contrato</th>
              <th class="numeric">Traspaso</th>
              <th class="numeric">Ficha</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="results.length === 0">
              <td colspan="10" class="text-court-300">Nadie encaja con esos filtros.</td>
            </tr>
            <tr v-for="player in results" :key="player.playerId">
              <td>
                <RouterLink
                  :to="{ name: 'player', params: { playerId: player.playerId } }"
                  class="hover:text-ball-400"
                >
                  {{ player.playerName }}
                </RouterLink>
              </td>
              <td class="text-court-300">{{ player.teamName ?? 'Libre' }}</td>
              <td class="text-ball-400">{{ player.position }}</td>
              <td class="numeric">{{ player.age }}</td>
              <td class="numeric font-semibold">
                {{ player.overall
                }}<span class="text-xs text-court-600">±{{ player.uncertainty }}</span>
              </td>
              <td class="numeric text-court-300">{{ player.potential }}</td>
              <td class="numeric text-court-300">
                {{ player.contractYearsLeft }}
                {{ player.contractYearsLeft === 1 ? 'año' : 'años' }}
              </td>
              <td class="numeric">
                {{ player.isFreeAgent ? '—' : formatMoney(player.askingPriceCents) }}
              </td>
              <td class="numeric text-court-300">{{ formatMoney(player.wageDemandCents) }}</td>
              <td>
                <AppButton size="sm" :disabled="!status.isOpen" @click="openOffer(player)">
                  Ofertar
                </AppButton>
                <AppButton
                  v-if="!player.isFreeAgent"
                  size="sm"
                  class="ml-1"
                  :disabled="!status.isOpen || busy"
                  @click="loanIn(player)"
                >
                  Pedir cedido
                </AppButton>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>

    <div v-else-if="tab === 'contracts'" class="overflow-auto rounded border border-court-700">
      <table class="data-table">
        <thead>
          <tr>
            <th>Jugador</th>
            <th>Pos</th>
            <th class="numeric">Edad</th>
            <th class="numeric">Media</th>
            <th class="numeric">Ficha</th>
            <th class="numeric">Le queda</th>
            <th class="numeric">Renovar por</th>
            <th class="numeric">Rescindir</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="entry in contracts" :key="entry.playerId">
            <td>
              {{ entry.playerName }}
              <span v-if="entry.isHomegrown" class="ml-1 text-xs text-good-400">form.</span>
              <span v-if="entry.isOnLoan" class="ml-1 text-xs text-court-600">cedido aquí</span>
            </td>
            <td class="text-ball-400">{{ entry.position }}</td>
            <td class="numeric">{{ entry.age }}</td>
            <td class="numeric font-semibold">{{ entry.overall }}</td>
            <td class="numeric">{{ formatMoney(entry.wageCents) }}</td>
            <td class="numeric" :class="entry.contractYearsLeft <= 1 ? 'text-line-500' : ''">
              {{ entry.contractYearsLeft }}
              {{ entry.contractYearsLeft === 1 ? 'año' : 'años' }}
            </td>
            <td class="numeric text-court-300">{{ formatMoney(entry.renewalWageCents) }}</td>
            <td class="numeric text-court-300">{{ formatMoney(entry.releaseCostCents) }}</td>
            <td>
              <AppButton size="sm" :disabled="busy" @click="renew(entry)"> Renovar </AppButton>
              <AppButton
                size="sm"
                class="ml-1"
                :disabled="busy || entry.isOnLoan"
                @click="loanOut(entry)"
              >
                Ceder
              </AppButton>
              <AppButton
                size="sm"
                class="ml-1"
                :disabled="busy || entry.isOnLoan"
                @click="release(entry)"
              >
                Rescindir
              </AppButton>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div v-else class="overflow-auto rounded border border-court-700">
      <table class="data-table">
        <thead>
          <tr>
            <th>Jugador</th>
            <th>Pos</th>
            <th class="numeric">Media</th>
            <th>Cesión</th>
            <th>Club</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="loans.length === 0">
            <td colspan="5" class="text-court-300">No hay ninguna cesión en marcha.</td>
          </tr>
          <tr v-for="loan in loans" :key="loan.playerId">
            <td>{{ loan.playerName }}</td>
            <td class="text-ball-400">{{ loan.position }}</td>
            <td class="numeric font-semibold">{{ loan.overall }}</td>
            <td :class="loan.direction === 'out' ? 'text-court-300' : 'text-good-400'">
              {{ loan.direction === 'out' ? 'Cedido fuera' : 'Cedido aquí' }}
            </td>
            <td class="text-court-300">{{ loan.otherTeamName }}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <p v-if="error" class="text-sm text-bad-400">{{ error }}</p>
    <p v-else-if="message" class="text-sm text-good-400">{{ message }}</p>
  </div>
</template>
