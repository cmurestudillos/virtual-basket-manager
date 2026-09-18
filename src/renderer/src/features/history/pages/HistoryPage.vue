<script setup lang="ts">
/**
 * Historial y palmarés.
 *
 * Es la pantalla que le da sentido a jugar diez temporadas: lo que se ha
 * ganado, por dónde ha pasado el club y qué marcas se han dejado por el camino.
 * La hoja de servicios del entrenador (la antigua pestaña Carrera) vive desde la
 * fase 5 en la sección Mánager, con su ficha y el ranking: esto es la historia
 * del club, no la tuya.
 *
 * Con la piel de IBM: las pestañas y el resumen van en la barra de sección, las
 * temporadas en una tabla, el palmarés en vitrinas con su trofeo y su cifra, y
 * los récords en una lista con aspecto de tabla (celdas grises separadas por
 * huecos; lo tuyo, en azul pálido). Es lista y no tabla porque el arnés cuenta
 * sus filas como `li`.
 */
import { computed, onMounted, ref } from 'vue';
import type { HistoryView } from '@shared/contracts/history.contract';
import {
  AppBadge,
  AppEmpty,
  AppFlag,
  AppPanel,
  AppStat,
  AppTabs,
  PlayerName,
  TONE_TEXT,
  type TabOption
} from '@renderer/shared/ui';
import PageToolbar from '@renderer/features/app-shell/components/PageToolbar.vue';

type Tab = 'seasons' | 'trophies' | 'records';

const tab = ref<Tab>('seasons');
const view = ref<HistoryView | null>(null);

const TABS: TabOption[] = [
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

/**
 * La marca de zona de la fila, la de la clasificación: el podio arriba y los
 * tres últimos abajo. Es un puesto, no un valor de 0 a 100, así que no va con la
 * escala de cuatro tramos sino con las marcas de zona de la tabla.
 */
function positionZone(position: number | null, teams: number): string {
  if (position === null) return '';
  if (position <= 3) return 'zone-up';
  if (position > teams - 3) return 'zone-down';
  return '';
}

/**
 * El color del trofeo según la competición: liga, copa o Europa. Relleno y
 * trazo escritos enteros, que Tailwind sólo genera las clases que ve.
 */
const TROPHY_COLOR: Record<string, string> = {
  league: 'fill-tv-amber stroke-tv-amber',
  cup: 'fill-tv-muted stroke-tv-muted',
  continental: 'fill-tv-cyan stroke-tv-cyan'
};

function trophyColor(format: string): string {
  return TROPHY_COLOR[format] ?? TROPHY_COLOR.league!;
}
</script>

<template>
  <div class="flex flex-col gap-3">
    <PageToolbar place="tabs">
      <AppTabs :model-value="tab" :options="TABS" @update:model-value="tab = $event as Tab" />
    </PageToolbar>
    <PageToolbar>
      <span class="text-sm font-semibold text-white/75">{{ subtitle }}</span>
    </PageToolbar>

    <!-- Temporada a temporada -->
    <AppPanel v-if="tab === 'seasons'" title="Histórico" :hint="view?.teamName ?? ''" flush>
      <AppEmpty v-if="!view || view.seasons.length === 0">
        Todavía no hay historia que contar: termina una temporada y aparecerá aquí.
      </AppEmpty>
      <table v-else class="data-table">
        <thead>
          <tr>
            <th>Temporada</th>
            <th>Competición</th>
            <th class="numeric">PJ</th>
            <th class="numeric">V</th>
            <th class="numeric">D</th>
            <th class="numeric">Posición final</th>
            <th>Campeón</th>
            <th>Y además</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="season in view.seasons" :key="season.seasonNumber">
            <td class="figure" :class="positionZone(season.position, season.teams)">
              {{ season.years }}
            </td>
            <td>
              {{ season.competitionName }}
              <AppBadge v-if="season.tier > 1" class="ml-1">2ª división</AppBadge>
            </td>
            <td class="numeric">{{ season.won + season.lost }}</td>
            <td class="numeric">{{ season.won }}</td>
            <td class="numeric">{{ season.lost }}</td>
            <td class="numeric is-key font-bold">
              {{ positionLabel(season.position, season.teams) }}
            </td>
            <td :class="season.championTeamName === view.teamName ? 'font-bold' : ''">
              {{ season.championTeamName ?? '—' }}
            </td>
            <td>
              <!-- La celda de la tabla no parte líneas; esto sí, que puede haber copa y Europa. -->
              <span class="flex flex-wrap gap-x-3 whitespace-normal">
                <span v-if="season.others.length === 0" :class="TONE_TEXT.neutral">—</span>
                <span
                  v-for="other in season.others"
                  :key="other.competitionName"
                  class="text-xs"
                  :class="other.champion ? 'font-bold' : TONE_TEXT.neutral"
                >
                  {{ other.competitionName }}: {{ other.outcome }}
                </span>
              </span>
            </td>
          </tr>
        </tbody>
      </table>
    </AppPanel>

    <!-- Palmarés -->
    <AppPanel v-else-if="tab === 'trophies'" title="Palmarés" :hint="view?.teamName ?? ''">
      <AppEmpty v-if="!view || view.trophies.length === 0">
        La vitrina está vacía. Todavía.
      </AppEmpty>
      <ul v-else class="grid grid-cols-[repeat(auto-fill,minmax(12rem,1fr))] gap-4">
        <li
          v-for="trophy in view.trophies"
          :key="trophy.competitionId"
          class="flex flex-col items-center gap-2"
        >
          <!-- Un trofeo propio y genérico: el color dice si es liga, copa o Europa. -->
          <svg viewBox="0 0 48 56" class="h-20 w-20" aria-hidden="true">
            <g :class="trophyColor(trophy.format)">
              <path stroke="none" d="M12 4 H36 V16 C36 26 31 32 24 32 C17 32 12 26 12 16 Z" />
              <path stroke="none" d="M21 31 H27 V42 H21 Z" />
              <path stroke="none" d="M13 42 H35 V50 H13 Z" />
              <path fill="none" stroke-width="3" d="M12 8 H6 V13 C6 19 9 22 13 23" />
              <path fill="none" stroke-width="3" d="M36 8 H42 V13 C42 19 39 22 35 23" />
            </g>
          </svg>
          <AppStat
            :label="trophy.competitionName"
            boxed
            :note="trophy.years.join(', ')"
            class="w-full"
          >
            {{ trophy.seasons.length }}
          </AppStat>
        </li>
      </ul>
    </AppPanel>

    <!-- Récords -->
    <AppPanel v-else title="Récords de la partida" hint="la mejor marca vista hasta ahora" flush>
      <AppEmpty v-if="!view || view.records.length === 0">
        Aún no se ha jugado lo suficiente como para que haya récords.
      </AppEmpty>
      <ul v-else class="flex flex-col gap-[3px] p-[3px] text-sm">
        <li
          v-for="record in view.records"
          :key="record.label"
          class="grid grid-cols-[minmax(0,11rem)_minmax(0,1fr)_minmax(0,1fr)_5rem] items-stretch gap-[3px]"
        >
          <span
            class="flex items-center px-3 py-2 text-xs font-bold uppercase tracking-wide"
            :class="record.isManaged ? 'bg-tv-select' : 'bg-tv-cell'"
          >
            {{ record.label }}
          </span>
          <span
            class="flex min-w-0 items-center gap-2 px-3 py-2 font-semibold"
            :class="record.isManaged ? 'bg-tv-select' : 'bg-tv-cell'"
          >
            <AppFlag :code="record.nationality" />
            <PlayerName :name="record.playerName" />
          </span>
          <span
            class="flex min-w-0 items-center px-3 py-2"
            :class="record.isManaged ? 'bg-tv-select' : 'bg-tv-cell'"
          >
            <span class="truncate">
              {{ record.teamName }}
              <span :class="TONE_TEXT.neutral">· {{ record.context }}</span>
            </span>
          </span>
          <span class="figure flex items-center justify-center bg-tv-box text-xl font-bold">
            {{ record.value }}
          </span>
        </li>
      </ul>
    </AppPanel>
  </div>
</template>
