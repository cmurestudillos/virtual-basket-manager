<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import type { StandingEntry } from '@shared/contracts/season.contract';
import type { TeamSummary } from '@shared/contracts/teams.contract';
import { matchKits } from '@shared/domain/court';
import { countryName } from '@shared/domain/simulation-scope';
import { toStars } from '@shared/domain/stars';
import { useGameStateStore } from '@renderer/shared/game-state.store';
import {
  AppEmpty,
  AppFlag,
  AppPanel,
  AppSelect,
  AppStars,
  TeamBadge,
  type SelectOption
} from '@renderer/shared/ui';
import PageToolbar from '@renderer/features/app-shell/components/PageToolbar.vue';

/**
 * Los clubes de una liga, pestaña «Clubes» de Competición: escudo, equipo,
 * ciudad, puesto, reputación, pabellón y entrenador. Cada fila abre la ficha
 * del club. La liga se elige en el selector negro de la barra de sección, como
 * en Competiciones.
 *
 * Las ligas que se juegan van primero, en el orden de la temporada; detrás, las
 * del resto del mundo, que tienen clubes y ficha pero no clasificación.
 */

const store = useGameStateStore();
const router = useRouter();

const teams = ref<TeamSummary[]>([]);
const played = ref<{ competitionId: string; name: string; isManaged: boolean }[]>([]);
const league = ref('');
const standings = ref<StandingEntry[]>([]);

const clubs = computed(() => teams.value.filter((team) => team.competitionId === league.value));

onMounted(async () => {
  if (!store.state) {
    await store.refresh();
  }
  teams.value = await window.api.teams.list();
  // Sin banquillo no hay temporada que leer: entonces sólo el mundo.
  try {
    played.value = (await window.api.season.listLeagues()).map((row) => ({
      competitionId: row.competitionId,
      name: row.name,
      isManaged: row.isManaged
    }));
  } catch {
    played.value = [];
  }
  const mine = teams.value.find((team) => team.id === store.state?.teamId);
  league.value = mine?.competitionId ?? played.value[0]?.competitionId ?? '';
  if (!league.value) {
    league.value = teams.value[0]?.competitionId ?? '';
  }
});

/** Las ligas: primero las que se juegan y después las demás, por país y nombre. */
const leagues = computed(() => {
  const seen = new Map<string, { name: string; country: string }>();
  for (const team of teams.value) {
    if (!seen.has(team.competitionId)) {
      seen.set(team.competitionId, { name: team.competitionName, country: team.country });
    }
  }
  const playedIds = new Set(played.value.map((row) => row.competitionId));
  const rest = [...seen.entries()]
    .filter(([id]) => !playedIds.has(id))
    .sort(
      ([, a], [, b]) =>
        countryName(a.country).localeCompare(countryName(b.country), 'es') ||
        a.name.localeCompare(b.name, 'es')
    );
  return [
    ...played.value
      .filter((row) => seen.has(row.competitionId))
      .map((row) => ({
        id: row.competitionId,
        ...seen.get(row.competitionId)!,
        mine: row.isManaged
      })),
    ...rest.map(([id, value]) => ({ id, ...value, mine: false }))
  ];
});

const manyCountries = computed(() => new Set(leagues.value.map((row) => row.country)).size > 1);

const leagueOptions = computed<SelectOption[]>(() =>
  leagues.value.map((row) => {
    const name = manyCountries.value ? `${row.name} · ${countryName(row.country)}` : row.name;
    return { id: row.id, label: row.mine ? `${name} · tu liga` : name, short: row.name };
  })
);

watch(league, async (competitionId) => {
  standings.value = [];
  if (!competitionId || !played.value.some((row) => row.competitionId === competitionId)) {
    return;
  }
  const table = await window.api.season.getStandings(competitionId);
  if (league.value !== competitionId) {
    return;
  }
  // Si la liga no se jugara, la temporada devolvería la del usuario: por eso
  // sólo se quedan las filas de los clubes de esta liga.
  const ids = new Set(clubs.value.map((team) => team.id));
  standings.value = table.filter((row) => ids.has(row.teamId));
});

/**
 * Por puesto si la liga tiene tabla; si no, por reputación. El puesto es el de
 * la liga entera: en la americana, el de la conferencia se repetiría (dos 1º).
 */
const rows = computed(() => {
  const positions = new Map(standings.value.map((row) => [row.teamId, row.position]));
  return clubs.value
    .map((team) => ({ team, position: positions.get(team.id) ?? null }))
    .sort(
      (a, b) =>
        (a.position ?? Infinity) - (b.position ?? Infinity) ||
        b.team.reputation - a.team.reputation ||
        a.team.name.localeCompare(b.team.name, 'es')
    );
});

function openTeam(teamId: string): void {
  void router.push({ name: 'team-profile', params: { teamId } });
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <PageToolbar>
      <AppSelect
        v-if="leagueOptions.length > 0"
        v-model="league"
        :options="leagueOptions"
        label="Liga"
      />
    </PageToolbar>

    <AppPanel title="Clubes" :hint="`${rows.length} clubes`" flush>
      <AppEmpty v-if="rows.length === 0">No hay clubes en esta liga.</AppEmpty>
      <table v-else class="data-table">
        <thead>
          <tr>
            <th class="numeric">Pos</th>
            <th class="w-9"><span class="sr-only">Escudo</span></th>
            <th>Equipo</th>
            <th>Ciudad</th>
            <th>Reputación</th>
            <th>Pabellón</th>
            <th class="numeric">Aforo</th>
            <th>Entrenador</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="{ team, position } in rows"
            :key="team.id"
            class="cursor-pointer"
            :class="team.id === store.state?.teamId ? 'is-mine' : ''"
            @click="openTeam(team.id)"
          >
            <td class="numeric w-12">{{ position ?? '-' }}</td>
            <td class="py-0.5">
              <span class="flex justify-center bg-white p-0.5">
                <TeamBadge :name="team.name" :kit="matchKits(team.id, '').home" :size="22" />
              </span>
            </td>
            <td class="max-w-64 truncate">
              <!-- El enlace es lo que se alcanza con el teclado; el clic vale en toda la fila. -->
              <RouterLink
                :to="{ name: 'team-profile', params: { teamId: team.id } }"
                class="font-semibold hover:text-tv-blue-ink hover:underline"
                :title="team.name"
                @click.stop
              >
                {{ team.name }}
              </RouterLink>
            </td>
            <td class="max-w-44 truncate">
              <span class="flex items-center gap-2">
                <AppFlag :code="team.country" :label="countryName(team.country)" />
                <span class="truncate">{{ team.city }}</span>
              </span>
            </td>
            <td class="py-0.5">
              <AppStars :value="toStars(team.reputation)" label="Reputación" :size="12" />
            </td>
            <td class="max-w-56 truncate" :title="team.pavilionName">{{ team.pavilionName }}</td>
            <td class="numeric">{{ team.pavilionCapacity.toLocaleString('es-ES') }}</td>
            <td class="max-w-40 truncate">
              <span v-if="team.coach" class="flex items-center gap-2">
                <AppFlag :code="team.coach.nationality" />
                <span class="truncate">{{ team.coach.name }}</span>
              </span>
              <span v-else class="text-tv-muted">-</span>
            </td>
          </tr>
        </tbody>
      </table>
    </AppPanel>
  </div>
</template>
