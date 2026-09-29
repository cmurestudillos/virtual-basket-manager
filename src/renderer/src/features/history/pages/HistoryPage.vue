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
 *
 * Trofeos (2026-09-29): cada título en la vitrina con **su** copa en 3D (forma
 * por tipo, metal por categoría; ver `shared/domain/trophies.ts`), los
 * ascensos aparte con su placa y sin sumar al contador, y la pestaña Galas con
 * los premios de fin de temporada de la liga que jugaba el club cada año.
 */
import { computed, onMounted, ref, watch } from 'vue';
import type { HistoryView } from '@shared/contracts/history.contract';
import {
  AppBadge,
  AppEmpty,
  AppFlag,
  AppPanel,
  AppSelect,
  AppStat,
  AppTabs,
  PlayerName,
  TONE_TEXT,
  type SelectOption,
  type TabOption
} from '@renderer/shared/ui';
import PageToolbar from '@renderer/features/app-shell/components/PageToolbar.vue';
import GalaAwards from '@renderer/features/trophies/components/GalaAwards.vue';
import TrophyThumbnail from '@renderer/features/trophies/components/TrophyThumbnail.vue';

type Tab = 'seasons' | 'trophies' | 'galas' | 'records';

const tab = ref<Tab>('seasons');
const view = ref<HistoryView | null>(null);

const TABS: TabOption[] = [
  { id: 'seasons', label: 'Temporadas' },
  { id: 'trophies', label: 'Palmarés' },
  { id: 'galas', label: 'Galas' },
  { id: 'records', label: 'Récords' }
];

/** La gala que se mira: por defecto, la última. */
const galaSeasonId = ref('');
const galaOptions = computed<SelectOption[]>(() =>
  (view.value?.galas ?? []).map((gala) => ({
    id: gala.seasonId,
    label: `${gala.years} · ${gala.competitionName}`,
    short: gala.years
  }))
);
const gala = computed(
  () =>
    view.value?.galas.find((entry) => entry.seasonId === galaSeasonId.value) ??
    view.value?.galas[0] ??
    null
);
watch(
  () => view.value?.galas[0]?.seasonId,
  (seasonId) => {
    if (seasonId && !galaSeasonId.value) galaSeasonId.value = seasonId;
  }
);

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
</script>

<template>
  <div class="flex flex-col gap-4">
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
    <template v-else-if="tab === 'trophies'">
      <AppPanel title="Palmarés" :hint="view?.teamName ?? ''">
        <AppEmpty v-if="!view || view.trophies.length === 0">
          La vitrina está vacía. Todavía.
        </AppEmpty>
        <ul v-else class="grid grid-cols-[repeat(auto-fill,minmax(12rem,1fr))] gap-4">
          <li
            v-for="trophy in view.trophies"
            :key="trophy.competitionId"
            class="flex flex-col items-center gap-2"
            :data-trophy-kind="trophy.trophyKind ?? ''"
          >
            <!-- La copa de ese título: la forma dice qué es y el metal, a qué nivel. -->
            <TrophyThumbnail
              v-if="trophy.trophyKind"
              :kind="trophy.trophyKind"
              :size="104"
              :label="trophy.competitionName"
            />
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

      <!-- Los ascensos, aparte: se celebran, pero no son títulos. -->
      <AppPanel
        v-if="view && view.promotions.length > 0"
        title="Ascensos"
        :hint="`${view.promotions.length}`"
      >
        <ul class="grid grid-cols-[repeat(auto-fill,minmax(12rem,1fr))] gap-4">
          <li
            v-for="promotion in view.promotions"
            :key="promotion.seasonNumber"
            class="flex flex-col items-center gap-2"
            data-trophy-kind="promotion"
          >
            <TrophyThumbnail kind="promotion" :size="88" :label="`Ascenso ${promotion.years}`" />
            <AppStat
              :label="`A ${promotion.toCompetitionName}`"
              boxed
              size="md"
              :note="`desde ${promotion.fromCompetitionName}`"
              class="w-full"
            >
              {{ promotion.years }}
            </AppStat>
          </li>
        </ul>
      </AppPanel>
    </template>

    <!-- Galas: los premios de fin de temporada de la liga del club -->
    <template v-else-if="tab === 'galas'">
      <PageToolbar v-if="galaOptions.length > 1">
        <AppSelect v-model="galaSeasonId" :options="galaOptions" label="Temporada" />
      </PageToolbar>
      <AppPanel v-if="!gala" title="Galas">
        <AppEmpty>
          Todavía no se ha entregado ningún premio: salen el día que termina la liga.
        </AppEmpty>
      </AppPanel>
      <GalaAwards
        v-else
        :awards="gala.awards"
        :hint="`${gala.competitionName} · ${gala.years}`"
        compact
      />
    </template>

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
