<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import type { CatalogLeague, CatalogScope, CatalogTeam } from '@shared/contracts/teams.contract';
import { estimateSeconds, formatEstimate } from '@shared/domain/simulation-scope';
import { useGameStateStore } from '@renderer/shared/game-state.store';
import { AppButton, AppPageHeader } from '@renderer/shared/ui';

const router = useRouter();
const store = useGameStateStore();

const teams = ref<CatalogTeam[]>([]);
const leagues = ref<CatalogLeague[]>([]);
/** Liga por la que se filtra; `null` es el mundo entero. */
const league = ref<string | null>(null);
const search = ref('');
const selectedTeamId = ref<string | null>(null);
const managerName = ref('');
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
const scope = ref<CatalogScope>({ countries: [], continents: [] });
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

/** El país de la liga del club elegido: ese se juega sí o sí. */
const managedCountry = computed(() => {
  const competitionId = selectedTeam.value?.competitionId;
  return leagues.value.find((row) => row.competitionId === competitionId)?.country ?? null;
});

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
  return domestic + continental;
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
      dismissalEnabled: dismissalEnabled.value,
      careerMode: careerMode.value,
      activeCountries: [...activeCountries.value]
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
  <div class="mx-auto flex h-screen max-w-5xl flex-col gap-6 p-8">
    <header class="flex items-center justify-between">
      <AppPageHeader title="Nueva partida" />
      <RouterLink :to="{ name: 'main-menu' }" class="text-sm text-court-300 hover:text-court-100">
        Volver
      </RouterLink>
    </header>

    <div class="grid flex-1 grid-cols-[14rem_1fr_18rem] gap-6 overflow-hidden">
      <nav class="flex flex-col overflow-hidden rounded border border-court-700">
        <h2 class="border-b border-court-700 bg-court-900 px-4 py-2 text-sm text-court-300">
          Ligas
        </h2>
        <div class="flex-1 overflow-auto p-2 text-sm">
          <AppButton
            variant="ghost"
            size="sm"
            block
            class="text-left"
            :class="league === null ? 'bg-court-800 text-ball-400' : ''"
            @click="league = null"
          >
            Todo el mundo
          </AppButton>

          <div v-for="[country, rows] in leaguesByCountry" :key="country" class="mt-3">
            <p class="px-2 text-xs uppercase tracking-wide text-court-600">
              {{ rows[0]?.countryName ?? country }}
            </p>
            <AppButton
              v-for="row in rows"
              :key="row.competitionId"
              variant="ghost"
              size="sm"
              block
              class="text-left"
              :class="league === row.competitionId ? 'bg-court-800 text-ball-400' : ''"
              @click="league = row.competitionId"
            >
              {{ row.name }}
              <span class="text-xs text-court-600">· {{ row.teams }}</span>
            </AppButton>
          </div>
        </div>
      </nav>

      <section class="flex flex-col overflow-hidden rounded border border-court-700">
        <div class="flex items-center gap-3 border-b border-court-700 bg-court-900 px-4 py-2">
          <h2 class="text-sm text-court-300">Elige equipo</h2>
          <span class="text-xs text-court-600"
            >{{ visibleTeams.length }} de {{ teams.length }}</span
          >
          <input
            v-model="search"
            type="search"
            placeholder="Buscar club o ciudad…"
            class="ml-auto w-56 rounded border border-court-600 bg-court-950 px-2 py-1 text-sm"
          />
        </div>
        <div class="flex-1 overflow-auto">
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
                :class="{ 'bg-court-800 text-ball-400': team.id === selectedTeamId }"
                @click="selectedTeamId = team.id"
              >
                <td>{{ team.name }}</td>
                <td class="text-court-300">{{ team.city }}</td>
                <td class="text-court-300">{{ team.competitionName }}</td>
                <td class="numeric">{{ team.reputation }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <aside class="flex flex-col gap-4 overflow-auto rounded border border-court-700 p-4">
        <label class="flex flex-col gap-1 text-sm">
          <span class="text-court-300">Tu nombre</span>
          <input
            v-model="managerName"
            type="text"
            maxlength="60"
            class="rounded border border-court-600 bg-court-900 px-3 py-2"
          />
        </label>

        <label class="flex flex-col gap-1 text-sm">
          <span class="text-court-300">Nombre de la partida</span>
          <input
            v-model="saveName"
            type="text"
            maxlength="60"
            :placeholder="selectedTeam?.name ?? ''"
            class="rounded border border-court-600 bg-court-900 px-3 py-2"
          />
        </label>

        <label class="flex cursor-pointer items-start gap-2 text-sm">
          <input v-model="careerMode" type="checkbox" class="mt-1" />
          <span>
            <span>Modo carrera</span>
            <span class="block text-xs text-court-300">
              Si te destituyen no se acaba la partida: buscas otro banquillo y sigues.
            </span>
          </span>
        </label>

        <label class="flex cursor-pointer items-start gap-2 text-sm">
          <input v-model="dismissalEnabled" type="checkbox" class="mt-1" />
          <span>
            <span>El consejo puede despedirte</span>
            <span class="block text-xs text-court-300">
              {{
                careerMode
                  ? 'Sin despido tampoco hay carrera que hacer: nadie te echa de tu club.'
                  : 'Desactívalo para que la partida no se acabe aunque el consejo pierda la paciencia.'
              }}
            </span>
          </span>
        </label>

        <fieldset class="flex flex-col gap-2 text-sm">
          <legend class="text-court-300">Ligas que se juegan</legend>
          <p class="text-xs text-court-300">
            Cada país añade su calendario, sus playoffs, sus ascensos y su copa. El resto del mundo
            sigue existiendo, pero sus ligas no se disputan.
          </p>
          <div class="flex flex-wrap gap-1">
            <AppButton size="sm" variant="ghost" @click="choosePreset('mine')"
              >Sólo el mío</AppButton
            >
            <AppButton size="sm" variant="ghost" @click="choosePreset('continent')">
              Su continente
            </AppButton>
            <AppButton size="sm" variant="ghost" @click="choosePreset('world')">Todos</AppButton>
          </div>
          <ul class="flex flex-col gap-1">
            <li v-for="country in scope.countries" :key="country.code">
              <label
                class="flex items-center gap-2"
                :class="country.code === managedCountry ? 'cursor-default' : 'cursor-pointer'"
              >
                <input
                  type="checkbox"
                  :checked="isActive(country.code)"
                  :disabled="country.code === managedCountry"
                  @change="toggleCountry(country.code)"
                />
                <span class="flex-1">
                  {{ country.name }}
                  <span v-if="country.code === managedCountry" class="text-xs text-ball-400">
                    · tu club
                  </span>
                </span>
                <span class="text-xs tabular-nums text-court-600">
                  {{ formatEstimate(estimateSeconds(country.games)) }}
                </span>
              </label>
            </li>
          </ul>
          <p class="text-xs text-court-300">
            {{ activeCountries.size }} {{ activeCountries.size === 1 ? 'país' : 'países' }} · unos
            {{ scopeGames.toLocaleString('es-ES') }} partidos y
            <span class="text-court-100">≈ {{ formatEstimate(estimateSeconds(scopeGames)) }}</span>
            de simulación por temporada, competiciones continentales incluidas.
          </p>
        </fieldset>

        <p v-if="error" class="text-sm text-ball-400">{{ error }}</p>

        <AppButton variant="primary" class="mt-auto" :disabled="!canCreate" @click="create">
          {{ creating ? 'Creando…' : 'Empezar' }}
        </AppButton>
      </aside>
    </div>
  </div>
</template>
