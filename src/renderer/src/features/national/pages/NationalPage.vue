<script setup lang="ts">
/**
 * Selecciones.
 *
 * Si diriges una, la pantalla abre en ella: lo que pide la federación, el
 * próximo partido y la lista de la ventana. Y siempre están la clasificación,
 * el Mundial y el ranking, se dirija selección o no.
 *
 * Con la piel de IBM: las pestañas y la próxima ventana en la barra de sección,
 * la convocatoria como la tabla de plantilla (con su casilla por fila) y
 * «Guardar lista» abajo, en la barra de acciones. Tu selección, en azul pálido.
 */
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import type { NationalCallupView, NationalOverview } from '@shared/contracts/national.contract';
import { toStars } from '@shared/domain/stars';
import { formatMatchDate, formatShortDate } from '@renderer/shared/format';
import {
  AppBadge,
  AppButton,
  AppCheckbox,
  AppEmpty,
  AppFlag,
  AppPanel,
  AppRing,
  AppStars,
  AppStat,
  AppTabs,
  PlayerName,
  PositionChip,
  TONE_TEXT,
  bandForValue
} from '@renderer/shared/ui';
import PageActions from '@renderer/features/app-shell/components/PageActions.vue';
import PageToolbar from '@renderer/features/app-shell/components/PageToolbar.vue';
import GameRow from '@renderer/features/competition/components/GameRow.vue';
import NationalCompetition from '@renderer/features/national/components/NationalCompetition.vue';

type Tab = 'team' | 'qualifiers' | 'worldCup' | 'ranking';

const router = useRouter();
const overview = ref<NationalOverview | null>(null);
const callup = ref<NationalCallupView | null>(null);
const tab = ref<Tab>('qualifiers');
const selected = ref<Set<string>>(new Set());
const saving = ref(false);
const message = ref<{ ok: boolean; text: string } | null>(null);

const tabs = computed(() => [
  ...(overview.value?.myTeam ? [{ id: 'team', label: 'Mi selección' }] : []),
  { id: 'qualifiers', label: 'Clasificación' },
  { id: 'worldCup', label: 'Mundial' },
  { id: 'ranking', label: 'Ranking y palmarés' }
]);

onMounted(async () => {
  await load();
  if (overview.value?.myTeam) {
    tab.value = 'team';
  } else if (overview.value?.worldCup) {
    tab.value = 'worldCup';
  }
});

async function load(): Promise<void> {
  overview.value = await window.api.national.getOverview();
  callup.value = await window.api.national.getCallup();
  selected.value = new Set(
    callup.value?.candidates.filter((row) => row.selected).map((row) => row.playerId) ?? []
  );
}

const changed = computed(() => {
  const current = callup.value?.candidates.filter((row) => row.selected).map((row) => row.playerId);
  if (!current) return false;
  return current.length !== selected.value.size || current.some((id) => !selected.value.has(id));
});

function toggle(playerId: string): void {
  if (!callup.value?.editable) return;
  const next = new Set(selected.value);
  if (next.has(playerId)) {
    next.delete(playerId);
  } else if (next.size < (callup.value?.squadSize ?? 12)) {
    next.add(playerId);
  }
  selected.value = next;
}

async function saveCallup(): Promise<void> {
  saving.value = true;
  message.value = null;
  try {
    const result = await window.api.national.saveCallup({ playerIds: [...selected.value] });
    message.value = result.ok
      ? { ok: true, text: 'Lista guardada. La alineación se ha rehecho con los convocados.' }
      : { ok: false, text: result.reason ?? 'No se pudo guardar la lista' };
    if (result.ok) {
      await load();
    }
  } finally {
    saving.value = false;
  }
}

function availability(row: NationalCallupView['candidates'][number]): {
  label: string;
  tone: 'good' | 'warn' | 'bad' | 'neutral';
} {
  if (row.injuryDaysLeft > 0) return { label: `Lesionado · ${row.injuryDaysLeft} d`, tone: 'bad' };
  if (!row.released) return { label: 'Su club no lo suelta', tone: 'warn' };
  return { label: 'Disponible', tone: 'good' };
}

/** El código de nacionalidad sale del id de la selección: `seleccion-esp`. */
function codeOf(teamId: string): string {
  return teamId.replace('seleccion-', '').toUpperCase();
}
</script>

<template>
  <PageToolbar place="tabs">
    <AppTabs :model-value="tab" :options="tabs" @update:model-value="tab = $event as Tab" />
  </PageToolbar>

  <PageToolbar>
    <span v-if="overview?.nextWindow" class="text-xs text-white/75">
      {{ overview.nextWindow.label }}: lista el
      {{ formatShortDate(overview.nextWindow.callupDate) }} · primer partido el
      {{ formatShortDate(overview.nextWindow.firstGameDate) }}
    </span>
  </PageToolbar>

  <div v-if="tab === 'team' && overview?.myTeam" class="flex flex-col gap-4">
    <AppPanel title="Mi selección">
      <div class="grid grid-cols-[auto_repeat(3,minmax(0,11rem))_minmax(0,1fr)] items-end gap-4">
        <div class="flex items-center gap-3 self-center">
          <AppFlag :code="overview.myTeam.code" size="lg" :label="overview.myTeam.name" />
          <div>
            <p class="text-lg font-bold uppercase">{{ overview.myTeam.name }}</p>
            <p class="text-sm text-tv-muted">{{ overview.myTeam.rank }}ª del mundo</p>
          </div>
        </div>
        <AppStat label="La federación pide" size="md">{{ overview.myTeam.objectiveLabel }}</AppStat>
        <AppStat label="Este curso" size="md">{{ overview.myTeam.outcomeLabel ?? '-' }}</AppStat>
        <AppStat label="Veredicto" size="md">{{ overview.myTeam.verdictLabel ?? '-' }}</AppStat>
        <div class="flex min-w-0 flex-col gap-1">
          <p class="text-center text-xs font-bold uppercase tracking-wide">
            Próximo partido
            <span v-if="overview.myTeam.nextGame" class="font-normal normal-case text-tv-muted">
              · {{ formatMatchDate(overview.myTeam.nextGame.scheduledOn) }}
            </span>
          </p>
          <ul v-if="overview.myTeam.nextGame">
            <GameRow :game="overview.myTeam.nextGame" :nation-of="codeOf" compact />
          </ul>
          <p v-else class="bg-tv-box py-1.5 text-center text-sm text-tv-muted">Sin fecha</p>
        </div>
      </div>
    </AppPanel>

    <AppPanel
      v-if="callup"
      :title="`Convocatoria · ${callup.windowLabel}`"
      :hint="`${selected.size} de ${callup.squadSize}`"
      flush
    >
      <PageActions>
        <AppButton @click="router.push({ name: 'lineup', query: { equipo: 'seleccion' } })">
          Alineación y pizarra
        </AppButton>
        <AppButton
          variant="primary"
          :disabled="!callup.editable || !changed || saving || selected.size < callup.minSquad"
          @click="saveCallup"
        >
          Guardar lista
        </AppButton>
      </PageActions>

      <p class="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-sm">
        <span v-if="!callup.editable" class="text-tv-muted">{{ callup.reason }}</span>
        <span v-else class="text-tv-muted">
          Elige entre {{ callup.minSquad }} y {{ callup.squadSize }}. En noviembre y febrero no
          vienen los de la liga americana ni los de clubes con competición europea.
        </span>
        <span
          v-if="message"
          class="font-semibold"
          :class="message.ok ? TONE_TEXT.good : TONE_TEXT.bad"
        >
          {{ message.text }}
        </span>
      </p>

      <table class="data-table">
        <thead>
          <tr>
            <th class="w-10"><span class="sr-only">Convocado</span></th>
            <th>Jugador</th>
            <th>Pos</th>
            <th class="numeric">Edad</th>
            <th class="numeric">Media</th>
            <th class="numeric">Forma</th>
            <th>Club</th>
            <th>Estado</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="row in callup.candidates"
            :key="row.playerId"
            :class="[
              selected.has(row.playerId) ? 'is-selected' : '',
              callup.editable ? 'cursor-pointer' : ''
            ]"
            @click="toggle(row.playerId)"
          >
            <td class="text-center">
              <AppCheckbox
                :id="`convocado-${row.playerId}`"
                :model-value="selected.has(row.playerId)"
                :disabled="!callup.editable"
                :label="`Convocar a ${row.name}`"
                @update:model-value="toggle(row.playerId)"
                @click.stop
              />
            </td>
            <td>
              <RouterLink
                :to="{ name: 'player', params: { playerId: row.playerId } }"
                class="hover:text-tv-blue-ink"
                @click.stop
              >
                <PlayerName :name="row.name" />
              </RouterLink>
            </td>
            <td><PositionChip :position="row.position" /></td>
            <td class="numeric">{{ row.age }}</td>
            <td class="numeric is-key py-0.5"><AppRing :value="row.overall" :size="28" /></td>
            <td class="numeric" :class="bandForValue(row.condition) === 'low' ? TONE_TEXT.bad : ''">
              {{ row.condition }}
            </td>
            <td class="max-w-56 truncate">{{ row.clubName ?? 'Sin club' }}</td>
            <td>
              <AppBadge :tone="availability(row).tone">{{ availability(row).label }}</AppBadge>
            </td>
          </tr>
        </tbody>
      </table>
    </AppPanel>
  </div>

  <NationalCompetition
    v-else-if="tab === 'qualifiers'"
    :view="overview?.qualifiers ?? null"
    empty="La clasificación se sortea al empezar la temporada."
    passing="Pasan al Mundial los tres primeros de cada grupo."
  />

  <NationalCompetition
    v-else-if="tab === 'worldCup'"
    :view="overview?.worldCup ?? null"
    empty="El Mundial se sortea al acabar la clasificación, a primeros de agosto: lo juegan el anfitrión y los tres primeros de cada grupo."
    passing="Pasan a cuartos los dos primeros de cada grupo."
  />

  <div v-else-if="tab === 'ranking'" class="grid grid-cols-[minmax(0,1fr)_22rem] items-start gap-4">
    <AppPanel title="Ranking de selecciones" flush>
      <table class="data-table">
        <thead>
          <tr>
            <th class="numeric">Pos</th>
            <th>Selección</th>
            <th>Categoría</th>
            <th class="numeric">Reputación</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="nation in overview?.nations ?? []"
            :key="nation.code"
            :class="nation.teamId === overview?.myTeam?.teamId ? 'is-mine' : ''"
          >
            <td class="numeric w-12">{{ nation.rank }}</td>
            <td>
              <span class="flex items-center gap-2">
                <AppFlag :code="nation.code" :label="nation.name" />
                {{ nation.name }}
              </span>
            </td>
            <td class="py-0.5">
              <AppStars :value="toStars(nation.reputation)" label="Reputación" :size="12" />
            </td>
            <td class="numeric is-key font-bold">{{ nation.reputation }}</td>
          </tr>
        </tbody>
      </table>
    </AppPanel>

    <AppPanel title="Campeones del mundo" flush>
      <AppEmpty v-if="(overview?.champions.length ?? 0) === 0">
        Todavía no se ha jugado ningún Mundial.
      </AppEmpty>
      <table v-else class="data-table">
        <thead>
          <tr>
            <th class="numeric">Año</th>
            <th>Campeón</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="champion in overview?.champions ?? []"
            :key="champion.seasonNumber"
            :class="champion.teamName === overview?.myTeam?.name ? 'is-mine' : ''"
          >
            <td class="numeric w-16">{{ champion.startYear + 1 }}</td>
            <td>{{ champion.teamName }}</td>
          </tr>
        </tbody>
      </table>
    </AppPanel>
  </div>
</template>
