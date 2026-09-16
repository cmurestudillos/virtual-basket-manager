<script setup lang="ts">
/**
 * Historial y palmarés.
 *
 * Es la pantalla que le da sentido a jugar diez temporadas: lo que se ha
 * ganado, por dónde ha pasado el club y qué marcas se han dejado por el camino.
 * También es la memoria que necesita el modo carrera —un entrenador vale lo que
 * dice su palmarés— así que lo que se enseña aquí es justo lo que haría falta
 * para que otro club te fichara.
 */
import { computed, onMounted, ref } from 'vue';
import type { HistoryView } from '@shared/contracts/history.contract';
import { AppBadge, AppEmpty, AppPageHeader, AppPanel, AppTabs } from '@renderer/shared/ui';

type Tab = 'seasons' | 'trophies' | 'records';

const tab = ref<Tab>('seasons');
const view = ref<HistoryView | null>(null);

const TABS = [
  { id: 'seasons', label: 'Temporadas' },
  { id: 'trophies', label: 'Palmarés' },
  { id: 'records', label: 'Récords' }
];

onMounted(async () => {
  view.value = await window.api.history.get();
});

const subtitle = computed(() => {
  const current = view.value;
  if (!current) return '';
  const seasons = current.seasons.length;
  const titles = current.totalTrophies;
  const temporadas = `${seasons} ${seasons === 1 ? 'temporada' : 'temporadas'}`;
  const titulos = titles === 1 ? '1 título' : `${titles} títulos`;
  return `${temporadas} · ${titulos}`;
});

/** «3º de 18», o un guion si la temporada no llegó a jugarse. */
function positionLabel(position: number | null, teams: number): string {
  return position === null ? '—' : `${position}º de ${teams}`;
}

/** El puesto se colorea solo: el podio destaca y el descenso avisa. */
function positionTone(position: number | null, teams: number): 'good' | 'warn' | 'bad' | 'neutral' {
  if (position === null) return 'neutral';
  if (position <= 3) return 'good';
  if (position > teams - 3) return 'bad';
  return 'neutral';
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <AppPageHeader title="Historial">
      <span class="text-sm text-court-300">{{ subtitle }}</span>
    </AppPageHeader>

    <AppTabs :model-value="tab" :options="TABS" @update:model-value="tab = $event as Tab" />

    <!-- Temporada a temporada -->
    <AppPanel v-if="tab === 'seasons'" title="Temporada a temporada" flush>
      <AppEmpty v-if="!view || view.seasons.length === 0" class="p-4">
        Todavía no hay historia que contar: termina una temporada y aparecerá aquí.
      </AppEmpty>
      <table v-else class="data-table">
        <thead>
          <tr>
            <th>Temporada</th>
            <th>Competición</th>
            <th class="numeric">Puesto</th>
            <th class="numeric">V-D</th>
            <th>Campeón</th>
            <th>Y además</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="season in view.seasons" :key="season.seasonNumber">
            <td class="figure">{{ season.years }}</td>
            <td>
              {{ season.competitionName }}
              <span v-if="season.tier > 1" class="ml-1 text-xs text-court-300">
                (2ª división)
              </span>
            </td>
            <td class="numeric">
              <AppBadge :tone="positionTone(season.position, season.teams)">
                {{ positionLabel(season.position, season.teams) }}
              </AppBadge>
            </td>
            <td class="numeric">{{ season.won }}-{{ season.lost }}</td>
            <td class="text-court-300">{{ season.championTeamName ?? '—' }}</td>
            <td>
              <span v-if="season.others.length === 0" class="text-court-600">—</span>
              <span
                v-for="other in season.others"
                :key="other.competitionName"
                class="mr-2 text-xs"
                :class="other.champion ? 'text-ball-400' : 'text-court-300'"
              >
                {{ other.competitionName }}: {{ other.outcome }}
              </span>
            </td>
          </tr>
        </tbody>
      </table>
    </AppPanel>

    <!-- Palmarés -->
    <AppPanel v-else-if="tab === 'trophies'" :title="`Palmarés · ${view?.teamName ?? ''}`">
      <AppEmpty v-if="!view || view.trophies.length === 0">
        La vitrina está vacía. Todavía.
      </AppEmpty>
      <ul v-else class="flex flex-col gap-2">
        <li
          v-for="trophy in view.trophies"
          :key="trophy.competitionId"
          class="flex items-baseline justify-between rounded border border-court-700 px-3 py-2"
        >
          <span>
            <span class="text-ball-400">{{ trophy.competitionName }}</span>
            <span class="ml-2 text-xs text-court-300">{{ trophy.years.join(', ') }}</span>
          </span>
          <span class="figure text-lg font-semibold">{{ trophy.seasons.length }}</span>
        </li>
      </ul>
    </AppPanel>

    <!-- Récords -->
    <AppPanel v-else title="Récords de la partida" hint="la mejor marca vista hasta ahora">
      <AppEmpty v-if="!view || view.records.length === 0">
        Aún no se ha jugado lo suficiente como para que haya récords.
      </AppEmpty>
      <ul v-else class="flex flex-col gap-2">
        <li
          v-for="record in view.records"
          :key="record.label"
          class="flex items-baseline justify-between rounded border border-court-700 px-3 py-2"
        >
          <span>
            <span class="text-xs uppercase tracking-wide text-court-300">{{ record.label }}</span>
            <span class="block">
              <span :class="record.isManaged ? 'text-ball-400' : ''">{{ record.playerName }}</span>
              <span class="ml-2 text-xs text-court-300">
                {{ record.teamName }} · {{ record.context }}
              </span>
            </span>
          </span>
          <span class="figure text-2xl font-semibold">{{ record.value }}</span>
        </li>
      </ul>
    </AppPanel>
  </div>
</template>
