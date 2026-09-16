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
import { useRouter } from 'vue-router';
import type { HistoryView } from '@shared/contracts/history.contract';
import type { CareerStatus } from '@shared/contracts/career.contract';
import {
  AppAvatar,
  AppBadge,
  AppButton,
  AppEmpty,
  AppFlag,
  AppPageHeader,
  AppPanel,
  AppTabs
} from '@renderer/shared/ui';

type Tab = 'seasons' | 'trophies' | 'records' | 'career';

const router = useRouter();
const tab = ref<Tab>('seasons');
const view = ref<HistoryView | null>(null);
/** La hoja de servicios del entrenador. Sólo existe en partidas de carrera. */
const career = ref<CareerStatus | null>(null);

const TABS = computed(() => [
  { id: 'seasons', label: 'Temporadas' },
  { id: 'trophies', label: 'Palmarés' },
  { id: 'records', label: 'Récords' },
  ...(career.value?.careerMode ? [{ id: 'career', label: 'Carrera' }] : [])
]);

onMounted(async () => {
  view.value = await window.api.history.get();
  career.value = await window.api.career.getStatus();
});

/** «Temporadas 1-3» o «Temporada 4 · en curso». */
function spellYears(spell: CareerStatus['spells'][number]): string {
  if (spell.endSeason === null) {
    return `Temporada ${spell.startSeason} · en curso`;
  }
  if (spell.endSeason === spell.startSeason) {
    return `Temporada ${spell.startSeason}`;
  }
  return `Temporadas ${spell.startSeason}-${spell.endSeason}`;
}

/**
 * Dimitir va en dos pasos: el primero pregunta. Irse de un banquillo no se
 * deshace, y un clic suelto no debería dejar a nadie en el paro.
 */
const confirmingResign = ref(false);
const confirmingLeave = ref(false);

/** Dejar la selección, también en dos pasos. */
async function leaveNational(): Promise<void> {
  if (!confirmingLeave.value) {
    confirmingLeave.value = true;
    return;
  }
  resigning.value = true;
  try {
    career.value = await window.api.career.leaveNational();
  } finally {
    resigning.value = false;
    confirmingLeave.value = false;
  }
}
const resigning = ref(false);

async function resign(): Promise<void> {
  if (!confirmingResign.value) {
    confirmingResign.value = true;
    return;
  }
  resigning.value = true;
  try {
    career.value = await window.api.career.resign();
    view.value = await window.api.history.get();
    await router.push({ name: 'dashboard' });
  } finally {
    resigning.value = false;
    confirmingResign.value = false;
  }
}

function spellEnd(spell: CareerStatus['spells'][number]): string {
  if (spell.endReason === 'dismissed') return 'destituido';
  if (spell.endReason === 'left') return 'se marchó';
  return '';
}

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

    <!-- La hoja de servicios del entrenador -->
    <AppPanel
      v-else-if="tab === 'career'"
      :title="career?.managerName ?? 'Carrera'"
      :hint="career?.reputationLabel ?? ''"
    >
      <div v-if="career" class="mb-4 flex flex-wrap items-center gap-6 text-sm">
        <AppAvatar kind="coach" :seed="career.managerName" :name="career.managerName" :size="48" />
        <span>
          <span class="text-court-300">Reputación</span>
          <span class="figure ml-2 text-lg">{{ career.reputation }}</span>
        </span>
        <span>
          <span class="text-court-300">Temporadas dirigidas</span>
          <span class="figure ml-2 text-lg">{{ career.seasonsManaged }}</span>
        </span>
        <span>
          <span class="text-court-300">Títulos</span>
          <span class="figure ml-2 text-lg">{{ career.titles }}</span>
        </span>
      </div>

      <div
        v-if="career?.canResign"
        class="mb-4 flex flex-wrap items-center justify-between gap-3 rounded border border-court-700 px-3 py-2"
      >
        <span class="text-sm text-court-300">
          {{
            confirmingResign
              ? `¿Dejar ${career.currentTeamName}? Te quedas sin equipo y buscas otro banquillo.`
              : `Diriges a ${career.currentTeamName}.`
          }}
        </span>
        <span class="flex gap-2">
          <AppButton
            v-if="confirmingResign"
            size="sm"
            variant="ghost"
            :disabled="resigning"
            @click="confirmingResign = false"
          >
            Seguir en el club
          </AppButton>
          <AppButton
            size="sm"
            :variant="confirmingResign ? 'primary' : 'secondary'"
            :disabled="resigning"
            @click="resign"
          >
            {{ confirmingResign ? 'Confirmar dimisión' : 'Dimitir' }}
          </AppButton>
        </span>
      </div>

      <AppEmpty v-if="!career || career.spells.length === 0">
        Todavía no has dirigido a nadie.
      </AppEmpty>
      <ul v-else class="flex flex-col gap-2">
        <li
          v-for="spell in [...career.spells].reverse()"
          :key="`${spell.teamId}-${spell.startSeason}`"
          class="flex items-baseline justify-between rounded border px-3 py-2"
          :class="spell.endSeason === null ? 'border-ball-500' : 'border-court-700'"
        >
          <span>
            <span>{{ spell.teamName }}</span>
            <span class="ml-2 text-xs text-court-300">
              {{ spellYears(spell) }}
              <span v-if="spellEnd(spell)">· {{ spellEnd(spell) }}</span>
            </span>
          </span>
          <span v-if="spell.titles > 0" class="text-sm text-ball-400">
            {{ spell.titles }} {{ spell.titles === 1 ? 'título' : 'títulos' }}
          </span>
        </li>
      </ul>

      <template v-if="career && (career.nationalSpells.length > 0 || career.canLeaveNational)">
        <h3 class="mb-2 mt-5 text-xs uppercase tracking-wide text-court-300">Selecciones</h3>
        <div
          v-if="career.canLeaveNational"
          class="mb-3 flex flex-wrap items-center justify-between gap-3 rounded border border-court-700 px-3 py-2"
        >
          <span class="text-sm text-court-300">
            {{
              confirmingLeave
                ? `¿Dejar ${career.nationalTeamName}? El club no se toca.`
                : `Diriges a ${career.nationalTeamName}.`
            }}
          </span>
          <span class="flex gap-2">
            <AppButton
              v-if="confirmingLeave"
              size="sm"
              variant="ghost"
              :disabled="resigning"
              @click="confirmingLeave = false"
            >
              Seguir con la selección
            </AppButton>
            <AppButton
              size="sm"
              :variant="confirmingLeave ? 'primary' : 'secondary'"
              :disabled="resigning"
              @click="leaveNational"
            >
              {{ confirmingLeave ? 'Confirmar' : 'Dejar la selección' }}
            </AppButton>
          </span>
        </div>
        <ul class="flex flex-col gap-2">
          <li
            v-for="spell in [...career.nationalSpells].reverse()"
            :key="`${spell.teamId}-${spell.startSeason}`"
            class="flex items-baseline justify-between rounded border px-3 py-2"
            :class="spell.endSeason === null ? 'border-ball-500' : 'border-court-700'"
          >
            <span class="inline-flex items-center gap-2">
              <AppFlag :code="spell.teamId.replace('seleccion-', '').toUpperCase()" />
              <span>{{ spell.teamName }}</span>
              <span class="text-xs text-court-300">
                {{ spellYears(spell) }}
                <span v-if="spellEnd(spell)">· {{ spellEnd(spell) }}</span>
              </span>
            </span>
            <span v-if="spell.titles > 0" class="text-sm text-ball-400">
              {{ spell.titles }} {{ spell.titles === 1 ? 'Mundial' : 'Mundiales' }}
            </span>
          </li>
        </ul>
      </template>
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
