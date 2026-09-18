<script setup lang="ts">
/**
 * Nueva partida, como asistente por pasos (decisión del 2026-09-17), a imagen
 * del de IBM (130904–130945): fondo con franjas, barra de arriba con el título
 * del paso y los puntos de progreso, y Atrás / Siguiente abajo.
 *
 * Tiene los pasos que el juego ya tenía en una sola pantalla, y ni uno más:
 *
 * 1. **Equipo**: la liga, la tabla de clubes y la ficha del elegido.
 * 2. **Entrenador**: nombre, nacionalidad, modo carrera, despido y selección.
 * 3. **Ligas**: qué países se juegan y lo que cuesta simularlos.
 * 4. **Resumen**: todo lo elegido, el nombre de la partida y empezar.
 *
 * El club va primero, al revés que en IBM, porque las ligas dependen de él: su
 * país se juega siempre, y los atajos «Sólo el mío» y «Su continente» salen de
 * ahí. El estado vive entero en esta página; los pasos sólo lo enseñan.
 */
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { formatWhole } from '@renderer/shared/format';
import type { CatalogLeague, CatalogScope, CatalogTeam } from '@shared/contracts/teams.contract';
import { matchKits } from '@shared/domain/court';
import { estimateSeconds, formatEstimate } from '@shared/domain/simulation-scope';
import { NATION_NAMES } from '@shared/domain/national-teams';
import { toStars } from '@shared/domain/stars';
import { useGameStateStore } from '@renderer/shared/game-state.store';
import {
  AppBackdrop,
  AppBadge,
  AppButton,
  AppCheckbox,
  AppEmpty,
  AppField,
  AppFlag,
  AppInput,
  AppPanel,
  AppRing,
  AppSectionTitle,
  AppSelect,
  AppStars,
  AppStat,
  KeyValueList,
  TeamBadge,
  type KeyValueItem
} from '@renderer/shared/ui';
import WizardSteps from '../components/WizardSteps.vue';

const router = useRouter();
const store = useGameStateStore();

const teams = ref<CatalogTeam[]>([]);
const leagues = ref<CatalogLeague[]>([]);
/** Liga por la que se filtra; `null` es el mundo entero. */
const league = ref<string | null>(null);
const search = ref('');
const selectedTeamId = ref<string | null>(null);
const managerName = ref('');
/** Nacionalidad del entrenador; sin elegir, la del país del club. */
const managerNationality = ref<string | null>(null);
const nationalityOptions = Object.entries(NATION_NAMES).sort((a, b) =>
  a[1].localeCompare(b[1], 'es')
);
/**
 * Con el despido apagado el consejo sigue puntuando, pero no te echa.
 *
 * Es la primera pieza de la dificultad, y se elige aquí porque es una decisión
 * sobre qué clase de partida quieres: la que se juega con el puesto en el aire
 * o la que se juega para construir un club a diez años vista.
 */
const dismissalEnabled = ref(true);
/**
 * Modo carrera: el despido deja de acabar la partida y pasa a ser quedarse sin
 * equipo. Es la otra mitad del juego —dirigir un club frente a hacer carrera—
 * y por eso se elige aquí y no en un ajuste: cambia de qué va la partida.
 */
const careerMode = ref(false);
/** Países y continentales que se pueden jugar, con su coste. */
const scope = ref<CatalogScope>({ countries: [], continents: [], nations: [], nationalGames: 0 });
/**
 * Selección que se dirige además del club, o ninguna. Como en la vida real,
 * se puede llevar a la vez: sus partidos caen en las ventanas y en verano.
 */
const nationalTeam = ref<string | null>(null);
/**
 * Países elegidos además del del club, que va siempre. Se elige aquí y no se
 * cambia después: una liga que empezara a mitad de partida no tendría ni
 * clasificación del año anterior ni historia.
 */
const chosenCountries = ref<string[]>([]);
const saveName = ref('');
const creating = ref(false);
const error = ref<string | null>(null);

const selectedTeam = computed(() => teams.value.find((team) => team.id === selectedTeamId.value));
const canCreate = computed(
  () => Boolean(selectedTeamId.value) && managerName.value.trim().length > 0 && !creating.value
);

onMounted(async () => {
  teams.value = await window.api.teams.listCatalog();
  leagues.value = await window.api.teams.listLeagues();
  scope.value = await window.api.teams.listScope();
  // Se abre en la liga de casa y no en el mundo entero: el catálogo va por
  // reputación, así que sin filtro lo encabezan los clubes americanos y el
  // primer contacto con el juego sería una lista de trescientos equipos.
  league.value = leagues.value.find((row) => row.isHome)?.competitionId ?? null;
});

// ---------------------------------------------------------------------------
// Los pasos
// ---------------------------------------------------------------------------

const STEPS = [
  {
    id: 'team',
    label: 'Equipo',
    title: 'Escoger equipo',
    subtitle: 'Elige el club que vas a dirigir'
  },
  {
    id: 'manager',
    label: 'Entrenador',
    title: 'Crear entrenador',
    subtitle: 'Quién eres y qué clase de partida quieres jugar'
  },
  {
    id: 'scope',
    label: 'Ligas',
    title: 'Ligas que se juegan',
    subtitle: 'Qué parte del mundo se simula cada temporada'
  },
  {
    id: 'summary',
    label: 'Resumen',
    title: 'Resumen',
    subtitle: 'Repasa la partida y ponle nombre'
  }
] as const;
const LAST_STEP = STEPS.length - 1;

const step = ref(0);
const currentStep = computed(() => STEPS[step.value] ?? STEPS[0]);

/** Si cada paso tiene lo que necesita para seguir: las mismas condiciones que `canCreate`. */
const stepReady = computed(() => [
  Boolean(selectedTeamId.value),
  managerName.value.trim().length > 0,
  true,
  canCreate.value
]);

/** Hasta dónde se puede saltar con los puntos: hasta el primer paso a medias. */
const reachableStep = computed(() => {
  let last = 0;
  while (last < LAST_STEP && stepReady.value[last]) {
    last += 1;
  }
  return last;
});

function goTo(index: number): void {
  step.value = Math.max(0, Math.min(index, reachableStep.value));
}

// ---------------------------------------------------------------------------
// Paso 1: equipo
// ---------------------------------------------------------------------------

/**
 * El catálogo son trescientos y pico clubes de catorce países: sin filtrar por
 * liga y poder escribir el nombre, elegir equipo es recorrer una lista infinita.
 */
const visibleTeams = computed(() => {
  const needle = search.value.trim().toLowerCase();

  return teams.value.filter((team) => {
    if (league.value && team.competitionId !== league.value) {
      return false;
    }
    if (!needle) {
      return true;
    }
    return team.name.toLowerCase().includes(needle) || team.city.toLowerCase().includes(needle);
  });
});

/** Las ligas agrupadas por país, que es como las busca el que elige. */
const leaguesByCountry = computed(() => {
  const grouped = new Map<string, CatalogLeague[]>();
  for (const row of leagues.value) {
    const rows = grouped.get(row.country);
    if (rows) {
      rows.push(row);
    } else {
      grouped.set(row.country, [row]);
    }
  }
  return [...grouped.entries()];
});

/** El escudo sale de la equipación, que sale del id: el mismo que se verá en la partida. */
const kitOf = (teamId: string) => matchKits(teamId, '').home;

const selectedLeague = computed(() =>
  leagues.value.find((row) => row.competitionId === selectedTeam.value?.competitionId)
);

/** El puesto del club elegido en su liga por reputación: dice si se elige un favorito. */
const reputationRank = computed(() => {
  const team = selectedTeam.value;
  if (!team) return null;
  const rivals = teams.value
    .filter((row) => row.competitionId === team.competitionId)
    .sort((a, b) => b.reputation - a.reputation);
  return { rank: rivals.findIndex((row) => row.id === team.id) + 1, of: rivals.length };
});

const teamFacts = computed<KeyValueItem[]>(() => {
  const team = selectedTeam.value;
  if (!team) return [];
  const rank = reputationRank.value;
  return [
    { id: 'city', label: 'Ciudad', value: team.city },
    { id: 'country', label: 'País', value: selectedLeague.value?.countryName ?? team.country },
    { id: 'competition', label: 'Competición', value: team.competitionName },
    {
      id: 'tier',
      label: 'División',
      value: selectedLeague.value ? `${selectedLeague.value.tier}.ª división` : null
    },
    { id: 'reputation', label: 'Reputación' },
    {
      id: 'rank',
      label: 'En su liga',
      value: rank ? `${rank.rank}.º de ${rank.of} por reputación` : null
    }
  ];
});

function chooseTeam(teamId: string): void {
  selectedTeamId.value = teamId;
}

// ---------------------------------------------------------------------------
// Paso 2: entrenador
// ---------------------------------------------------------------------------

/** El selector negro trabaja con cadenas: la vacía es «la del club». */
const nationalityChoice = computed({
  get: () => managerNationality.value ?? '',
  set: (value: string) => {
    managerNationality.value = value || null;
  }
});

const nationalityChoices = computed(() => {
  const clubCountry = selectedTeam.value?.country;
  const clubNation = clubCountry ? NATION_NAMES[clubCountry] : undefined;
  return [
    { id: '', label: clubNation ? `La del club (${clubNation})` : 'La del club' },
    ...nationalityOptions.map(([code, name]) => ({ id: code, label: name }))
  ];
});

const nationalChoice = computed({
  get: () => nationalTeam.value ?? '',
  set: (value: string) => {
    nationalTeam.value = value || null;
  }
});

const nationChoices = computed(() => [
  { id: '', label: 'Ninguna' },
  ...scope.value.nations.map((nation) => ({
    id: nation.code,
    label: `${nation.name} · ${nation.rank}ª del mundo`
  }))
]);

/** Las dos partidas que hay: el despido acaba la partida o la convierte en carrera. */
const GAME_MODES = [
  {
    career: false,
    label: 'Dirigir un club',
    hint: 'Tu club es la partida: si el consejo te destituye, se acaba.'
  },
  {
    career: true,
    label: 'Modo carrera',
    hint: 'Si te destituyen no se acaba la partida: buscas otro banquillo y sigues.'
  }
] as const;

// ---------------------------------------------------------------------------
// Paso 3: ligas que se juegan
// ---------------------------------------------------------------------------

/** El país de la liga del club elegido: ese se juega sí o sí. */
const managedCountry = computed(() => selectedLeague.value?.country ?? null);

const activeCountries = computed(() => {
  const codes = new Set(chosenCountries.value);
  if (managedCountry.value) {
    codes.add(managedCountry.value);
  }
  return codes;
});

function isActive(code: string): boolean {
  return activeCountries.value.has(code);
}

function toggleCountry(code: string): void {
  if (code === managedCountry.value) {
    return;
  }
  chosenCountries.value = chosenCountries.value.includes(code)
    ? chosenCountries.value.filter((row) => row !== code)
    : [...chosenCountries.value, code];
}

/** Atajos: nadie quiere marcar catorce casillas una a una. */
function choosePreset(preset: 'mine' | 'continent' | 'world'): void {
  const continent = scope.value.countries.find(
    (row) => row.code === managedCountry.value
  )?.continent;
  chosenCountries.value = scope.value.countries
    .filter((row) =>
      preset === 'world' ? true : preset === 'continent' ? row.continent === continent : false
    )
    .map((row) => row.code);
}

/**
 * Lo que cuesta cada temporada con esta elección: las ligas y copas de cada
 * país y las continentales de cada continente que entra en juego.
 */
const scopeGames = computed(() => {
  const countries = scope.value.countries.filter((row) => isActive(row.code));
  const continents = new Set(countries.map((row) => row.continent));
  const domestic = countries.reduce((sum, row) => sum + row.games, 0);
  const continental = scope.value.continents
    .filter((row) => continents.has(row.code))
    .reduce((sum, row) => sum + row.games, 0);
  return domestic + continental + scope.value.nationalGames;
});

const scopeEstimate = computed(() => formatEstimate(estimateSeconds(scopeGames.value)));

// ---------------------------------------------------------------------------
// Paso 4: resumen
// ---------------------------------------------------------------------------

const summaryItems = computed<KeyValueItem[]>(() => {
  const team = selectedTeam.value;
  const nationality = managerNationality.value ?? team?.country ?? null;
  const countries = scope.value.countries
    .filter((row) => isActive(row.code))
    .map((row) => row.name)
    .join(', ');
  return [
    { id: 'team', label: 'Club', value: team?.name ?? null },
    { id: 'competition', label: 'Competición', value: team?.competitionName ?? null },
    { id: 'manager', label: 'Entrenador', value: managerName.value.trim() || null },
    {
      id: 'nationality',
      label: 'Nacionalidad',
      value: nationality ? (NATION_NAMES[nationality] ?? nationality) : null
    },
    {
      id: 'mode',
      label: 'Tipo de partida',
      value: careerMode.value ? 'Modo carrera' : 'Dirigir un club'
    },
    {
      id: 'dismissal',
      label: 'Despido',
      value: dismissalEnabled.value ? 'El consejo puede despedirte' : 'Nadie te despide'
    },
    {
      id: 'national',
      label: 'Selección',
      value: nationalTeam.value
        ? (NATION_NAMES[nationalTeam.value] ?? nationalTeam.value)
        : 'Ninguna'
    },
    { id: 'countries', label: 'Ligas que se juegan', value: countries || null },
    {
      id: 'cost',
      label: 'Simulación',
      value: `unos ${formatWhole(scopeGames.value)} partidos, ≈ ${scopeEstimate.value} al año`
    }
  ];
});

async function create(): Promise<void> {
  if (!canCreate.value || !selectedTeamId.value) {
    return;
  }

  creating.value = true;
  error.value = null;
  try {
    await window.api.saves.create({
      // Si el usuario no pone nombre a la partida, se usa el del equipo: es lo
      // que va a reconocer después en el listado.
      name: saveName.value.trim() || (selectedTeam.value?.name ?? 'Partida'),
      teamId: selectedTeamId.value,
      managerName: managerName.value.trim(),
      managerNationality: managerNationality.value,
      dismissalEnabled: dismissalEnabled.value,
      careerMode: careerMode.value,
      activeCountries: [...activeCountries.value],
      nationalTeam: nationalTeam.value
    });
    await store.refresh();
    await router.push({ name: 'dashboard' });
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'No se pudo crear la partida';
  } finally {
    creating.value = false;
  }
}
</script>

<template>
  <AppBackdrop class="h-screen">
    <div class="flex h-screen flex-col">
      <!-- Barra de arriba: el paso, sus puntos y lo ya elegido. -->
      <header
        class="grid h-16 shrink-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-6 bg-linear-to-r from-tv-chrome to-tv-chrome-2 px-6"
      >
        <div class="min-w-0">
          <h1 class="truncate text-lg font-bold uppercase tracking-wide">
            {{ currentStep.title }}
          </h1>
          <p class="truncate text-sm text-white/80">{{ currentStep.subtitle }}</p>
        </div>
        <WizardSteps :steps="STEPS" :current="step" :reachable="reachableStep" @go="goTo" />
        <div v-if="selectedTeam" class="flex min-w-0 items-center justify-end gap-3">
          <span class="flex min-w-0 flex-col text-right">
            <span class="truncate font-bold">{{ selectedTeam.name }}</span>
            <span v-if="managerName.trim()" class="truncate text-sm text-white/80">
              {{ managerName.trim() }}
            </span>
          </span>
          <TeamBadge :name="selectedTeam.name" :kit="kitOf(selectedTeam.id)" :size="40" />
        </div>
      </header>

      <main class="min-h-0 flex-1 p-4">
        <!-- 1. Equipo -->
        <div
          v-if="step === 0"
          class="grid h-full min-h-0 grid-cols-[13rem_minmax(0,1fr)_19rem] gap-3"
        >
          <nav aria-label="Ligas" class="flex min-h-0 flex-col">
            <AppPanel title="Ligas" scroll flush class="min-h-0 flex-1">
              <div class="flex flex-col gap-[3px] p-2 text-sm">
                <button
                  type="button"
                  class="block w-full px-2 py-1.5 text-left transition-colors"
                  :class="
                    league === null
                      ? 'bg-tv-select font-bold'
                      : 'bg-tv-cell hover:bg-tv-cell-strong'
                  "
                  :aria-pressed="league === null"
                  @click="league = null"
                >
                  Todo el mundo
                </button>

                <template v-for="[country, rows] in leaguesByCountry" :key="country">
                  <AppSectionTitle size="xs" class="mt-2">
                    {{ rows[0]?.countryName ?? country }}
                  </AppSectionTitle>
                  <button
                    v-for="row in rows"
                    :key="row.competitionId"
                    type="button"
                    class="block w-full px-2 py-1.5 text-left transition-colors"
                    :class="
                      league === row.competitionId
                        ? 'bg-tv-select font-bold'
                        : 'bg-tv-cell hover:bg-tv-cell-strong'
                    "
                    :aria-pressed="league === row.competitionId"
                    @click="league = row.competitionId"
                  >
                    {{ row.name }}
                    <span class="text-xs font-normal text-tv-muted">· {{ row.teams }}</span>
                  </button>
                </template>
              </div>
            </AppPanel>
          </nav>

          <AppPanel
            title="Equipos"
            :hint="`${visibleTeams.length} de ${teams.length}`"
            scroll
            flush
            class="min-h-0"
          >
            <template #actions>
              <AppInput
                v-model="search"
                type="search"
                dense
                placeholder="Buscar club o ciudad…"
                aria-label="Buscar club o ciudad"
                class="w-48"
              />
            </template>
            <table class="data-table">
              <thead>
                <tr>
                  <th>Equipo</th>
                  <th>Ciudad</th>
                  <th>Competición</th>
                  <th class="numeric">Reputación</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="team in visibleTeams"
                  :key="team.id"
                  class="cursor-pointer"
                  :class="{ 'is-selected': team.id === selectedTeamId }"
                  tabindex="0"
                  @click="chooseTeam(team.id)"
                  @keydown.enter.prevent="chooseTeam(team.id)"
                >
                  <td class="py-1">
                    <span class="flex items-center gap-2">
                      <TeamBadge :name="team.name" :kit="kitOf(team.id)" :size="22" />
                      <span class="truncate font-semibold">{{ team.name }}</span>
                    </span>
                  </td>
                  <td>{{ team.city }}</td>
                  <td>{{ team.competitionName }}</td>
                  <td class="numeric is-key">{{ team.reputation }}</td>
                </tr>
              </tbody>
            </table>
          </AppPanel>

          <AppPanel :title="selectedTeam?.name ?? 'Tu club'" scroll class="min-h-0">
            <AppEmpty v-if="!selectedTeam">
              Elige un club en la tabla para ver su ficha. Puedes filtrar por liga o buscarlo por su
              nombre o su ciudad.
            </AppEmpty>
            <div v-else class="flex flex-col gap-3">
              <div class="flex items-center justify-around bg-tv-cell py-3">
                <TeamBadge :name="selectedTeam.name" :kit="kitOf(selectedTeam.id)" :size="80" />
                <AppRing :value="selectedTeam.reputation" label="Reputación" :size="72" />
              </div>
              <KeyValueList :items="teamFacts">
                <template #value="{ item }">
                  <template v-if="item.id === 'country'">
                    {{ item.value }} <AppFlag :code="selectedTeam.country" />
                  </template>
                  <AppStars
                    v-else-if="item.id === 'reputation'"
                    :value="toStars(selectedTeam.reputation)"
                    label="Reputación"
                  />
                  <template v-else>{{ item.value ?? '-' }}</template>
                </template>
              </KeyValueList>
            </div>
          </AppPanel>
        </div>

        <!-- 2. Entrenador -->
        <div
          v-else-if="step === 1"
          class="mx-auto grid h-full max-h-full max-w-5xl grid-cols-2 content-start gap-3 overflow-auto"
        >
          <div class="flex flex-col gap-3">
            <AppPanel title="Nuevo entrenador">
              <div class="flex flex-col gap-3">
                <AppSectionTitle>Escribe tu nombre</AppSectionTitle>
                <AppField label="Nombre">
                  <AppInput
                    id="manager-name"
                    v-model="managerName"
                    type="text"
                    maxlength="60"
                    placeholder="Introduce tu nombre"
                  />
                </AppField>
                <AppSectionTitle>Nacionalidad</AppSectionTitle>
                <AppSelect
                  id="manager-nationality"
                  v-model="nationalityChoice"
                  :options="nationalityChoices"
                  label="Tu nacionalidad"
                >
                  <template #leading>
                    <AppFlag :code="managerNationality ?? selectedTeam?.country" size="md" />
                  </template>
                </AppSelect>
              </div>
            </AppPanel>

            <AppPanel title="Selección" hint="opcional">
              <AppField
                label="Selección nacional"
                hint="La diriges a la vez que el club: convocas en noviembre, febrero y verano, y juegas la clasificación y el Mundial."
              >
                <AppSelect id="national-team" v-model="nationalChoice" :options="nationChoices">
                  <template #leading>
                    <AppFlag v-if="nationalTeam" :code="nationalTeam" size="md" />
                  </template>
                </AppSelect>
              </AppField>
            </AppPanel>
          </div>

          <AppPanel title="Tipo de partida">
            <div class="flex flex-col gap-3">
              <div role="radiogroup" aria-label="Tipo de partida" class="grid grid-cols-2 gap-3">
                <button
                  v-for="mode in GAME_MODES"
                  :key="mode.label"
                  type="button"
                  role="radio"
                  :aria-checked="careerMode === mode.career"
                  class="flex flex-col border-[3px] text-left text-tv-ink transition-colors"
                  :class="
                    careerMode === mode.career
                      ? 'border-tv-blue bg-tv-select'
                      : 'border-transparent bg-tv-cell hover:bg-tv-cell-strong'
                  "
                  @click="careerMode = mode.career"
                >
                  <span
                    class="bg-linear-to-r from-tv-head-from to-tv-head-to px-3 py-1.5 text-center text-sm font-bold uppercase tracking-wide text-white"
                    >{{ mode.label }}</span
                  >
                  <span class="p-3 text-sm">{{ mode.hint }}</span>
                </button>
              </div>

              <AppCheckbox v-model="dismissalEnabled" class="w-full bg-tv-cell p-3">
                <span>
                  <span class="font-bold">El consejo puede despedirte</span>
                  <span class="block text-xs font-normal text-tv-muted">
                    {{
                      careerMode
                        ? 'Sin despido tampoco hay carrera que hacer: nadie te echa de tu club.'
                        : 'Desactívalo para que la partida no se acabe aunque el consejo pierda la paciencia.'
                    }}
                  </span>
                </span>
              </AppCheckbox>
            </div>
          </AppPanel>
        </div>

        <!-- 3. Ligas que se juegan -->
        <div
          v-else-if="step === 2"
          class="grid h-full min-h-0 grid-cols-[minmax(0,1fr)_18rem] gap-3"
        >
          <AppPanel
            title="Países"
            :hint="`${activeCountries.size} de ${scope.countries.length}`"
            scroll
            flush
            class="min-h-0"
          >
            <template #actions>
              <AppButton size="sm" @click="choosePreset('mine')">Sólo el mío</AppButton>
              <AppButton size="sm" @click="choosePreset('continent')">Su continente</AppButton>
              <AppButton size="sm" @click="choosePreset('world')">Todos</AppButton>
            </template>
            <div
              class="sticky top-0 z-10 grid grid-cols-[1.25rem_12rem_minmax(0,1fr)_7rem] gap-3 bg-linear-to-r from-tv-head-from to-tv-head-to px-3 py-2 text-xs font-bold uppercase tracking-wide text-white"
              aria-hidden="true"
            >
              <span></span>
              <span>País</span>
              <span>Ligas</span>
              <span class="text-right">Simulación</span>
            </div>
            <ul class="flex flex-col gap-[3px] p-[3px]">
              <li v-for="country in scope.countries" :key="country.code">
                <label
                  class="grid grid-cols-[1.25rem_12rem_minmax(0,1fr)_7rem] items-center gap-3 px-3 py-2 text-sm transition-colors"
                  :class="[
                    isActive(country.code) ? 'bg-tv-select' : 'bg-tv-cell hover:bg-tv-cell-strong',
                    country.code === managedCountry ? 'cursor-default' : 'cursor-pointer'
                  ]"
                >
                  <AppCheckbox
                    :model-value="isActive(country.code)"
                    :disabled="country.code === managedCountry"
                    :label="country.name"
                    @update:model-value="toggleCountry(country.code)"
                  />
                  <span class="flex items-center gap-2 font-semibold">
                    {{ country.name }}
                    <AppBadge v-if="country.code === managedCountry">tu club</AppBadge>
                  </span>
                  <span class="truncate text-tv-muted">
                    {{ country.leagues.map((row) => row.name).join(' · ') }}
                    <template v-if="country.hasCup"> · Copa</template>
                  </span>
                  <span class="figure text-right text-tv-muted">
                    {{ formatEstimate(estimateSeconds(country.games)) }}
                  </span>
                </label>
              </li>
            </ul>
          </AppPanel>

          <aside class="flex min-h-0 flex-col gap-3 overflow-auto">
            <AppPanel title="Tiempo de simulación">
              <div class="flex flex-col gap-3">
                <div class="grid grid-cols-2 gap-3">
                  <AppStat label="Países" size="md">{{ activeCountries.size }}</AppStat>
                  <AppStat label="Partidos" size="md">
                    {{ formatWhole(scopeGames) }}
                  </AppStat>
                </div>
                <AppStat label="Simulación">≈ {{ scopeEstimate }}</AppStat>
                <p class="bg-tv-cell p-3 text-center text-xs text-tv-muted">
                  {{ activeCountries.size }} {{ activeCountries.size === 1 ? 'país' : 'países' }} ·
                  unos {{ formatWhole(scopeGames) }} partidos y
                  <span class="font-bold text-tv-ink">≈ {{ scopeEstimate }}</span>
                  de simulación por temporada, competiciones continentales y selecciones incluidas.
                </p>
              </div>
            </AppPanel>
            <AppPanel title="Qué se juega">
              <p class="text-sm">
                Cada país añade su calendario, sus playoffs, sus ascensos y su copa. El resto del
                mundo sigue existiendo, pero sus ligas no se disputan.
              </p>
            </AppPanel>
          </aside>
        </div>

        <!-- 4. Resumen -->
        <div
          v-else
          class="mx-auto grid h-full max-h-full max-w-5xl grid-cols-[minmax(0,1fr)_22rem] content-start gap-3 overflow-auto"
        >
          <AppPanel title="Tu partida">
            <KeyValueList :items="summaryItems">
              <template #value="{ item }">
                <template v-if="item.id === 'team' && selectedTeam">
                  {{ item.value }}
                  <TeamBadge :name="selectedTeam.name" :kit="kitOf(selectedTeam.id)" :size="22" />
                </template>
                <template v-else-if="item.id === 'nationality'">
                  {{ item.value ?? '-' }}
                  <AppFlag :code="managerNationality ?? selectedTeam?.country" />
                </template>
                <template v-else-if="item.id === 'national' && nationalTeam">
                  {{ item.value }} <AppFlag :code="nationalTeam" />
                </template>
                <template v-else>{{ item.value ?? '-' }}</template>
              </template>
            </KeyValueList>
          </AppPanel>

          <AppPanel title="Nombre de la partida">
            <div class="flex flex-col gap-3">
              <AppField
                label="Nombre"
                hint="Así la verás al cargarla. Si lo dejas en blanco, se llama como el club."
              >
                <AppInput
                  id="save-name"
                  v-model="saveName"
                  type="text"
                  maxlength="60"
                  :placeholder="selectedTeam?.name ?? ''"
                />
              </AppField>
              <p v-if="error" role="alert" class="bg-tv-cell p-3 text-sm font-semibold text-tv-red">
                {{ error }}
              </p>
            </div>
          </AppPanel>
        </div>
      </main>

      <!-- Barra de abajo: volver y seguir. -->
      <footer
        class="flex h-[55px] shrink-0 items-center justify-between gap-3 border-t border-white/10 bg-tv-footer px-4"
      >
        <AppButton v-if="step === 0" class="min-w-32" @click="router.push({ name: 'main-menu' })">
          Volver
        </AppButton>
        <AppButton v-else class="min-w-32" @click="step -= 1">Atrás</AppButton>

        <AppButton
          v-if="step < LAST_STEP"
          variant="primary"
          arrow="single"
          class="min-w-44"
          :disabled="!stepReady[step]"
          @click="goTo(step + 1)"
        >
          Siguiente
        </AppButton>
        <AppButton
          v-else
          variant="primary"
          arrow="single"
          class="min-w-44"
          :disabled="!canCreate"
          @click="create"
        >
          {{ creating ? 'Creando…' : 'Empezar' }}
        </AppButton>
      </footer>
    </div>
  </AppBackdrop>
</template>
