<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import type { CatalogLeague, CatalogTeam } from '@shared/contracts/teams.contract';
import { useGameStateStore } from '@renderer/shared/game-state.store';

const router = useRouter();
const store = useGameStateStore();

const teams = ref<CatalogTeam[]>([]);
const leagues = ref<CatalogLeague[]>([]);
/** Liga por la que se filtra; `null` es el mundo entero. */
const league = ref<string | null>(null);
const search = ref('');
const selectedTeamId = ref<string | null>(null);
const managerName = ref('');
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
      managerName: managerName.value.trim()
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
      <h1 class="text-2xl font-semibold">Nueva partida</h1>
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
          <button
            type="button"
            class="w-full rounded px-2 py-1 text-left"
            :class="league === null ? 'bg-court-800 text-ball-400' : 'hover:bg-court-800'"
            @click="league = null"
          >
            Todo el mundo
          </button>

          <div v-for="[country, rows] in leaguesByCountry" :key="country" class="mt-3">
            <p class="px-2 text-xs uppercase tracking-wide text-court-600">{{ country }}</p>
            <button
              v-for="row in rows"
              :key="row.competitionId"
              type="button"
              class="w-full rounded px-2 py-1 text-left"
              :class="
                league === row.competitionId ? 'bg-court-800 text-ball-400' : 'hover:bg-court-800'
              "
              @click="league = row.competitionId"
            >
              {{ row.name }}
              <span class="text-xs text-court-600">· {{ row.teams }}</span>
            </button>
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

      <aside class="flex flex-col gap-4 rounded border border-court-700 p-4">
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

        <p v-if="error" class="text-sm text-ball-400">{{ error }}</p>

        <button
          type="button"
          :disabled="!canCreate"
          class="mt-auto rounded bg-ball-600 px-4 py-3 font-semibold hover:bg-ball-500 disabled:cursor-not-allowed disabled:bg-court-700 disabled:text-court-300"
          @click="create"
        >
          {{ creating ? 'Creando…' : 'Empezar' }}
        </button>
      </aside>
    </div>
  </div>
</template>
