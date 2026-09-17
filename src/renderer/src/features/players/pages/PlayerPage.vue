<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import type { PlayerSummary } from '@shared/contracts/players.contract';
import type { ContractEntry } from '@shared/contracts/market.contract';
import type { PlayerSeasonStats } from '@shared/contracts/stats.contract';
import type { TeamSummary } from '@shared/contracts/teams.contract';
import { ATTRIBUTE_LABELS, type AttributeKey } from '@shared/domain/attributes';
import { conditionLabel } from '@shared/domain/conditioning';
import { matchKits, shirtNumbers } from '@shared/domain/court';
import { injuryLabel } from '@shared/domain/injuries';
import { UNHAPPY_MORALE } from '@shared/domain/morale';
import { nationName } from '@shared/domain/national-teams';
import { POSITION_LABELS } from '@shared/domain/positions';
import { NO_SCOUT_ERROR } from '@shared/domain/staff';
import { toStars } from '@shared/domain/stars';
import { useGameStateStore } from '@renderer/shared/game-state.store';
import { formatHeight, formatMoney } from '@renderer/shared/format';
import {
  AppAvatar,
  AppButton,
  AppEmpty,
  AppFlag,
  AppMeter,
  AppModal,
  AppPanel,
  AppRing,
  AppSectionTitle,
  AppStars,
  AppStat,
  AppTabs,
  AttributeGrid,
  KeyValueList,
  MoodIcon,
  PositionChip,
  TONE_TEXT,
  TeamBadge,
  type AttributeItem,
  type KeyValueItem,
  type TabOption
} from '@renderer/shared/ui';
import PageActions from '@renderer/features/app-shell/components/PageActions.vue';
import PageToolbar from '@renderer/features/app-shell/components/PageToolbar.vue';

/**
 * La ficha del jugador, como la de IBM: arriba la cabecera —dorsal, nombre,
 * puesto, cara, escudo y anillo de media— con sus datos, y debajo lo de la
 * pestaña elegida.
 *
 * Las pestañas son sólo las que tienen datos: **Ficha** siempre; **Contrato**
 * con los tuyos, que son los únicos cuyo contrato se ve y se toca; y
 * **Estadísticas** con quien tiene equipo. Renovar, ceder y rescindir son las
 * mismas operaciones que la pestaña Contratos del mercado, y salen en la barra
 * de abajo sólo en tus jugadores.
 */

type Tab = 'ficha' | 'contrato' | 'estadisticas';

const route = useRoute();
const gameState = useGameStateStore();

const player = ref<PlayerSummary | null>(null);
const team = ref<TeamSummary | null>(null);
const number = ref<number | null>(null);
const contract = ref<ContractEntry | null>(null);
const stats = ref<PlayerSeasonStats | null>(null);
const tab = ref<Tab>('ficha');

const busy = ref(false);
const message = ref<string | null>(null);
const error = ref<string | null>(null);
const confirmRelease = ref(false);

async function load(): Promise<void> {
  const playerId = String(route.params.playerId);
  const found = await window.api.players.get(playerId);
  if (!gameState.state) {
    await gameState.refresh();
  }

  let foundTeam: TeamSummary | null = null;
  let foundNumber: number | null = null;
  let foundStats: PlayerSeasonStats | null = null;
  let foundContract: ContractEntry | null = null;
  if (found?.teamId) {
    const [teamSummary, roster, season] = await Promise.all([
      window.api.teams.get(found.teamId),
      window.api.players.listByTeam(found.teamId),
      // Las estadísticas son una pestaña más: si fallan, la ficha se enseña igual.
      window.api.stats.teamSeason(found.teamId).catch(() => [])
    ]);
    foundTeam = teamSummary;
    // El dorsal sale de la plantilla entera, igual que en el partido.
    foundNumber = shirtNumbers(roster.map((mate) => mate.id)).get(found.id) ?? null;
    foundStats = season.find((row) => row.playerId === found.id) ?? null;

    if (found.teamId === gameState.state?.teamId) {
      try {
        const contracts = await window.api.market.listContracts();
        foundContract = contracts.find((entry) => entry.playerId === found.id) ?? null;
      } catch {
        foundContract = null;
      }
    }
  }

  player.value = found;
  team.value = foundTeam;
  number.value = foundNumber;
  stats.value = foundStats;
  contract.value = foundContract;
}

// La ficha se navega desde la propia ficha (compañeros, rivales), así que la
// ruta cambia sin desmontar el componente: sin esto se quedaría el anterior.
watch(
  () => route.params.playerId,
  () => {
    tab.value = 'ficha';
    message.value = null;
    error.value = null;
    void load();
  },
  { immediate: true }
);

const tabs = computed<TabOption[]>(() => [
  { id: 'ficha', label: 'Ficha' },
  ...(contract.value ? [{ id: 'contrato', label: 'Contrato' }] : []),
  ...(player.value?.teamId ? [{ id: 'estadisticas', label: 'Estadísticas' }] : [])
]);

// Tras ceder o rescindir, la pestaña Contrato desaparece: se vuelve a la ficha.
watch(tabs, (options) => {
  if (!options.some((option) => option.id === tab.value)) {
    tab.value = 'ficha';
  }
});

/** Sin ojeador no se sabe ni la media: el anillo enseña la «?» de IBM. */
const unscouted = computed(() => (player.value?.uncertainty ?? 0) >= NO_SCOUT_ERROR);

/** El potencial de 0 a 100 en cinco estrellas: cada veinte puntos, una. */
const potentialStars = computed(() => toStars(player.value?.potential ?? 0));

const kit = computed(() => (team.value ? matchKits(team.value.id, '').home : null));

function yearOf(milliseconds: number | null): string {
  return milliseconds === null ? '-' : String(new Date(milliseconds).getUTCFullYear());
}

// --- Cabecera ----------------------------------------------------------------

const facts = computed<KeyValueItem[]>(() => {
  const current = player.value;
  if (!current) {
    return [];
  }
  return [
    { id: 'team', label: 'Equipo', value: team.value?.name ?? 'Sin equipo' },
    { id: 'position', label: 'Posición' },
    {
      id: 'height',
      label: 'Altura / envergadura',
      value: `${formatHeight(current.heightCm)} / ${formatHeight(current.wingspanCm)}`
    },
    { id: 'weight', label: 'Peso', value: `${current.weightKg} kg` },
    { id: 'age', label: 'Edad', value: current.age },
    { id: 'nationality', label: 'Nacionalidad' }
  ];
});

const deal = computed<KeyValueItem[]>(() => {
  const current = player.value;
  if (!current) {
    return [];
  }
  return [
    { id: 'potential', label: 'Potencial' },
    { id: 'wage', label: 'Sueldo', value: `${formatMoney(current.wageCents)} al año` },
    { id: 'value', label: 'Valor de mercado', value: formatMoney(current.valueCents) },
    ...(contract.value
      ? [{ id: 'until', label: 'Contrato hasta', value: yearOf(contract.value.contractUntil) }]
      : [])
  ];
});

// --- Ficha -------------------------------------------------------------------

/**
 * Tres columnas de siete, que es como caben los veintiún atributos en familias
 * sin partir ninguna por la mitad: tiro y rebote, creación y defensa, físico y
 * mental. `AttributeGrid` llena por columnas en este mismo orden.
 */
const ATTRIBUTE_COLUMNS: readonly { label: string; keys: readonly AttributeKey[] }[] = [
  {
    label: 'Tiro y rebote',
    keys: [
      'close',
      'midRange',
      'threePoint',
      'freeThrow',
      'finishing',
      'offensiveRebound',
      'defensiveRebound'
    ]
  },
  {
    label: 'Creación y defensa',
    keys: [
      'passing',
      'handling',
      'driving',
      'perimeterDefense',
      'interiorDefense',
      'steal',
      'block'
    ]
  },
  {
    label: 'Físico y mental',
    keys: ['speed', 'strength', 'jumping', 'stamina', 'basketballIQ', 'consistency', 'aggression']
  }
];

const attributes = computed<AttributeItem[]>(() => {
  const current = player.value;
  if (!current) {
    return [];
  }
  return ATTRIBUTE_COLUMNS.flatMap((column) =>
    column.keys.map((key) => ({
      id: key,
      label: ATTRIBUTE_LABELS[key],
      value: current.attributes[key]
    }))
  );
});

const stateItems = computed<KeyValueItem[]>(() => [
  { id: 'condition', label: 'Condición', value: conditionLabel(player.value?.condition ?? 0) },
  { id: 'mood', label: 'Estado de ánimo' },
  { id: 'injury', label: 'Lesión' }
]);

// --- Contrato ----------------------------------------------------------------

const contractItems = computed<KeyValueItem[]>(() => {
  const entry = contract.value;
  if (!entry) {
    return [];
  }
  return [
    { id: 'wage', label: 'Sueldo (año)', value: formatMoney(entry.wageCents) },
    { id: 'until', label: 'Hasta', value: yearOf(entry.contractUntil) },
    { id: 'years', label: 'Años que le quedan' },
    { id: 'renewal', label: 'Pide por renovar (año)', value: formatMoney(entry.renewalWageCents) },
    { id: 'release', label: 'Cuesta rescindir', value: formatMoney(entry.releaseCostCents) },
    { id: 'homegrown', label: 'Jugador de formación', value: entry.isHomegrown ? 'Sí' : 'No' },
    { id: 'loan', label: 'Cedido aquí', value: entry.isOnLoan ? 'Sí' : 'No' }
  ];
});

// --- Estadísticas ------------------------------------------------------------

function decimal(value: number): string {
  return value.toLocaleString('es-ES', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

const averages = computed(() => {
  const row = stats.value;
  if (!row) {
    return [];
  }
  return [
    { id: 'games', label: 'Partidos', value: String(row.games) },
    { id: 'minutes', label: 'Minutos', value: decimal(row.minutesPerGame) },
    { id: 'points', label: 'Puntos', value: decimal(row.pointsPerGame) },
    { id: 'rebounds', label: 'Rebotes', value: decimal(row.reboundsPerGame) },
    { id: 'assists', label: 'Asistencias', value: decimal(row.assistsPerGame) },
    { id: 'steals', label: 'Robos', value: decimal(row.stealsPerGame) },
    { id: 'blocks', label: 'Tapones', value: decimal(row.blocksPerGame) },
    { id: 'efficiency', label: 'Valoración', value: decimal(row.efficiencyPerGame) }
  ];
});

const shooting = computed<KeyValueItem[]>(() => {
  const row = stats.value;
  if (!row) {
    return [];
  }
  return [
    {
      id: 'two',
      label: 'Tiros de 2',
      value: `${row.twoPointMade} / ${row.twoPointAttempted} · ${decimal(row.twoPointPercentage)} %`
    },
    {
      id: 'three',
      label: 'Triples',
      value: `${row.threePointMade} / ${row.threePointAttempted} · ${decimal(row.threePointPercentage)} %`
    },
    {
      id: 'free',
      label: 'Tiros libres',
      value: `${row.freeThrowMade} / ${row.freeThrowAttempted} · ${decimal(row.freeThrowPercentage)} %`
    }
  ];
});

const totals = computed<KeyValueItem[]>(() => {
  const row = stats.value;
  if (!row) {
    return [];
  }
  return [
    { id: 'points', label: 'Puntos', value: row.points },
    { id: 'rebounds', label: 'Rebotes', value: row.rebounds },
    { id: 'assists', label: 'Asistencias', value: row.assists },
    { id: 'turnovers', label: 'Pérdidas', value: row.turnovers },
    { id: 'fouls', label: 'Faltas', value: row.fouls },
    { id: 'plusMinus', label: 'Más / menos', value: row.plusMinus }
  ];
});

// --- Acciones ----------------------------------------------------------------

async function act(action: () => Promise<string>, failure: string): Promise<void> {
  busy.value = true;
  error.value = null;
  message.value = null;
  try {
    message.value = await action();
    await load();
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : failure;
  } finally {
    busy.value = false;
  }
}

function renew(): void {
  const entry = contract.value;
  if (!entry) {
    return;
  }
  // Lo mismo que la pestaña Contratos del mercado: lo que pide, a tres temporadas.
  void act(async () => {
    await window.api.market.renew({
      playerId: entry.playerId,
      wageCents: entry.renewalWageCents,
      years: 3
    });
    return `${entry.playerName} renueva por tres temporadas.`;
  }, 'No se pudo renovar');
}

function loanOut(): void {
  const entry = contract.value;
  if (!entry) {
    return;
  }
  void act(
    async () => (await window.api.market.loanOut({ playerId: entry.playerId })).reason,
    'No se pudo ceder'
  );
}

function release(): void {
  const entry = contract.value;
  confirmRelease.value = false;
  if (!entry) {
    return;
  }
  void act(async () => {
    await window.api.market.release({ playerId: entry.playerId });
    return `${entry.playerName} queda libre.`;
  }, 'No se pudo rescindir');
}
</script>

<template>
  <div v-if="player" class="flex flex-col gap-4">
    <PageToolbar v-if="tabs.length > 1" place="tabs">
      <AppTabs v-model="tab" :options="tabs" />
    </PageToolbar>

    <!-- Sobre el marco y no en la barra de abajo: tras ceder o rescindir deja de
         ser tuyo, las acciones desaparecen y el aviso tiene que seguir a la vista. -->
    <p
      v-if="error || message"
      role="status"
      class="text-sm font-semibold"
      :class="error ? 'text-tv-mood-low' : 'text-white'"
    >
      {{ error ?? message }}
    </p>

    <!-- Cabecera: la barra añil con dorsal y nombre, y debajo cara, escudo y media. -->
    <AppPanel>
      <div class="grid grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1fr)] items-start gap-4">
        <div class="flex min-w-0 flex-col">
          <div
            class="flex items-center gap-4 bg-linear-to-r from-tv-head-from to-tv-head-to px-4 py-2 text-white"
          >
            <template v-if="number !== null">
              <span class="figure text-4xl font-bold">{{ number }}</span>
              <span aria-hidden="true" class="h-10 w-0.5 shrink-0 bg-white/80"></span>
            </template>
            <!-- «Nombre / APELLIDO» en dos líneas y a tamaño de cabecera: más grande que
                 `PlayerName` en modo `stacked`, que es para filas y tarjetas. -->
            <h1 class="flex min-w-0 flex-col leading-tight">
              <span class="truncate text-lg font-semibold">{{ player.firstName }}</span>
              <span class="truncate text-2xl font-bold uppercase">{{ player.lastName }}</span>
            </h1>
            <div class="ml-auto flex shrink-0 flex-col items-end gap-1">
              <span class="flex gap-1">
                <PositionChip :position="player.position" size="md" />
                <PositionChip
                  v-if="player.secondaryPosition && player.secondaryPosition !== player.position"
                  :position="player.secondaryPosition"
                  size="md"
                />
              </span>
              <span class="text-xs font-bold uppercase tracking-wide">
                {{ POSITION_LABELS[player.position] }}
              </span>
            </div>
          </div>

          <div class="flex items-center justify-around gap-3 pt-3">
            <AppAvatar
              kind="player"
              :seed="player.id"
              :name="`${player.firstName} ${player.lastName}`"
              :size="96"
            />
            <TeamBadge v-if="team && kit" :name="team.name" :kit="kit" :size="64" />
            <div class="flex flex-col items-center gap-1">
              <AppRing :value="player.overall" :unknown="unscouted" label="Media" :size="80" />
              <span
                v-if="player.uncertainty > 0"
                class="figure text-sm font-bold"
                :class="TONE_TEXT.warn"
                :title="`Lo que ha visto tu ojeador: ±${player.uncertainty} en cada atributo`"
              >
                ±{{ player.uncertainty }}
              </span>
            </div>
          </div>
        </div>

        <KeyValueList :items="facts">
          <template #value="{ item }">
            <span v-if="item.id === 'position'" class="flex gap-1">
              <PositionChip :position="player.position" />
              <PositionChip
                v-if="player.secondaryPosition && player.secondaryPosition !== player.position"
                :position="player.secondaryPosition"
              />
            </span>
            <template v-else-if="item.id === 'nationality'">
              {{ nationName(player.nationality) }}
              <AppFlag :code="player.nationality" size="md" />
            </template>
            <template v-else>{{ item.value ?? '-' }}</template>
          </template>
        </KeyValueList>

        <KeyValueList :items="deal">
          <template #value="{ item }">
            <AppStars
              v-if="item.id === 'potential'"
              :value="potentialStars"
              label="Potencial"
              :size="16"
            />
            <template v-else>{{ item.value ?? '-' }}</template>
          </template>
        </KeyValueList>
      </div>
    </AppPanel>

    <div
      v-if="tab === 'ficha'"
      class="grid grid-cols-[minmax(0,1fr)_minmax(0,2.8fr)] items-start gap-4"
    >
      <AppPanel title="Estado actual">
        <div class="flex flex-col gap-3">
          <AppMeter :value="player.condition" label="Forma" />
          <AppMeter :value="player.morale" label="Moral" />
          <KeyValueList :items="stateItems">
            <template #value="{ item }">
              <MoodIcon v-if="item.id === 'mood'" :value="player.morale" labelled />
              <template v-else-if="item.id === 'injury'">
                <span v-if="player.injuryDaysLeft > 0" :class="TONE_TEXT.bad">
                  {{ player.injuryName }} · {{ injuryLabel(player.injuryDaysLeft) }}
                </span>
                <template v-else>-</template>
              </template>
              <template v-else>{{ item.value ?? '-' }}</template>
            </template>
          </KeyValueList>
          <p v-if="player.morale < UNHAPPY_MORALE" class="text-xs" :class="TONE_TEXT.bad">
            Rinde por debajo y pide más para renovar.
          </p>
        </div>
      </AppPanel>

      <AppPanel
        title="Atributos"
        :hint="player.uncertainty > 0 ? `Según tu ojeador: ±${player.uncertainty}` : ''"
      >
        <div class="flex flex-col gap-[3px]">
          <div class="grid grid-cols-3 gap-[3px]">
            <AppSectionTitle v-for="column in ATTRIBUTE_COLUMNS" :key="column.label" size="xs">
              {{ column.label }}
            </AppSectionTitle>
          </div>
          <AttributeGrid :items="attributes" :columns="3" />
        </div>
      </AppPanel>
    </div>

    <div
      v-else-if="tab === 'contrato' && contract"
      class="grid grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] items-start gap-4"
    >
      <AppPanel title="Contrato">
        <KeyValueList :items="contractItems">
          <template #value="{ item }">
            <span
              v-if="item.id === 'years'"
              :class="contract.contractYearsLeft <= 1 ? `${TONE_TEXT.bad} font-bold` : ''"
            >
              {{ contract.contractYearsLeft }}
              {{ contract.contractYearsLeft === 1 ? 'año' : 'años' }}
            </span>
            <template v-else>{{ item.value ?? '-' }}</template>
          </template>
        </KeyValueList>
      </AppPanel>

      <AppPanel title="Ánimo y renovación">
        <div class="flex flex-col gap-3 text-sm">
          <AppMeter :value="contract.morale" label="Moral" />
          <MoodIcon :value="contract.morale" labelled />
          <p v-if="contract.refusesRenewal" :class="TONE_TEXT.bad">
            Está enfadado: no quiere renovar.
          </p>
          <p v-else-if="contract.morale < UNHAPPY_MORALE" :class="TONE_TEXT.warn">
            Está descontento: pide más de lo normal para renovar.
          </p>
          <p class="text-tv-muted">
            Renovar es pagar lo que pide, a tres temporadas. Rescindir cuesta la mitad de lo que
            quedaba por pagarle.
          </p>
        </div>
      </AppPanel>
    </div>

    <template v-else-if="tab === 'estadisticas'">
      <AppPanel v-if="!stats" title="Promedio de temporada">
        <AppEmpty>
          Todavía no ha jugado ningún partido esta temporada con
          {{ team?.name ?? 'su equipo' }}.
        </AppEmpty>
      </AppPanel>
      <template v-else>
        <AppPanel title="Promedio de temporada">
          <div class="grid grid-cols-8 gap-3">
            <AppStat
              v-for="average in averages"
              :key="average.id"
              :label="average.label"
              size="md"
              boxed
            >
              {{ average.value }}
            </AppStat>
          </div>
        </AppPanel>
        <div class="grid grid-cols-2 items-start gap-4">
          <AppPanel title="Tiro">
            <KeyValueList :items="shooting" />
          </AppPanel>
          <AppPanel title="Totales">
            <KeyValueList :items="totals" />
          </AppPanel>
        </div>
      </template>
    </template>

    <PageActions v-if="contract">
      <AppButton
        variant="primary"
        :disabled="busy || contract.refusesRenewal"
        :title="contract.refusesRenewal ? 'Está enfadado: no quiere renovar' : ''"
        @click="renew"
      >
        Renovar
      </AppButton>
      <AppButton variant="primary" :disabled="busy || contract.isOnLoan" @click="loanOut">
        Ceder
      </AppButton>
      <AppButton
        variant="danger"
        :disabled="busy || contract.isOnLoan"
        @click="confirmRelease = true"
      >
        Rescindir
      </AppButton>
    </PageActions>

    <AppModal
      :open="confirmRelease && contract !== null"
      title="Rescindir contrato"
      @close="confirmRelease = false"
    >
      <p v-if="contract" class="text-sm">
        {{ player.firstName }} {{ player.lastName }} quedará libre y el club le pagará
        {{ formatMoney(contract.releaseCostCents) }}.
      </p>
      <template #actions>
        <AppButton variant="danger" class="min-w-40" :disabled="busy" @click="release">
          Rescindir
        </AppButton>
        <AppButton class="min-w-40" @click="confirmRelease = false">Cancelar</AppButton>
      </template>
    </AppModal>
  </div>
</template>
