<script setup lang="ts">
/**
 * Selecciones.
 *
 * Si diriges una, la pantalla abre en ella: lo que pide la federación, el
 * próximo partido y la lista de la ventana. Y siempre están la clasificación,
 * el Mundial y el ranking, se dirija selección o no.
 */
import { computed, onMounted, ref } from 'vue';
import type { NationalCallupView, NationalOverview } from '@shared/contracts/national.contract';
import { POSITION_LABELS } from '@shared/domain/positions';
import { formatMatchDate } from '@renderer/shared/format';
import {
  AppAvatar,
  AppBadge,
  AppButton,
  AppEmpty,
  AppFlag,
  AppPageHeader,
  AppPanel,
  AppStat,
  AppTabs
} from '@renderer/shared/ui';
import NationalCompetition from '@renderer/features/national/components/NationalCompetition.vue';

type Tab = 'team' | 'qualifiers' | 'worldCup' | 'ranking';

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
</script>

<template>
  <div class="flex flex-col gap-4">
    <AppPageHeader title="Selecciones">
      <span v-if="overview?.nextWindow" class="text-sm text-court-300">
        {{ overview.nextWindow.label }}: lista el
        {{ formatMatchDate(overview.nextWindow.callupDate) }} · primer partido el
        {{ formatMatchDate(overview.nextWindow.firstGameDate) }}
      </span>
    </AppPageHeader>

    <AppTabs :model-value="tab" :options="tabs" @update:model-value="tab = $event as Tab" />

    <template v-if="tab === 'team' && overview?.myTeam">
      <section class="flex flex-wrap items-center gap-6 rounded border border-court-700 p-5">
        <div class="flex items-center gap-3">
          <AppFlag :code="overview.myTeam.code" size="lg" :label="overview.myTeam.name" />
          <div>
            <p class="text-xl font-semibold">{{ overview.myTeam.name }}</p>
            <p class="text-sm text-court-300">{{ overview.myTeam.rank }}ª del mundo</p>
          </div>
        </div>
        <AppStat label="La federación pide" size="md">{{ overview.myTeam.objectiveLabel }}</AppStat>
        <AppStat v-if="overview.myTeam.outcomeLabel" label="Este curso" size="md">
          {{ overview.myTeam.outcomeLabel }}
        </AppStat>
        <AppStat v-if="overview.myTeam.verdictLabel" label="Veredicto" size="md">
          {{ overview.myTeam.verdictLabel }}
        </AppStat>
        <div v-if="overview.myTeam.nextGame" class="ml-auto text-right">
          <p class="text-xs text-court-300">Próximo partido</p>
          <p>
            {{ overview.myTeam.nextGame.homeTeamName }}
            <span class="text-court-600">vs</span>
            {{ overview.myTeam.nextGame.awayTeamName }}
          </p>
          <p class="text-sm text-court-300">
            {{ formatMatchDate(overview.myTeam.nextGame.scheduledOn) }}
          </p>
        </div>
      </section>

      <AppPanel
        v-if="callup"
        :title="`Convocatoria · ${callup.windowLabel}`"
        :hint="`${selected.size} de ${callup.squadSize}`"
        flush
      >
        <div class="flex flex-wrap items-center gap-3 border-b border-court-700 px-4 py-2 text-sm">
          <span v-if="!callup.editable" class="text-court-300">{{ callup.reason }}</span>
          <span v-else class="text-court-300">
            Elige entre {{ callup.minSquad }} y {{ callup.squadSize }}. En noviembre y febrero no
            vienen los de la liga americana ni los de clubes con competición europea.
          </span>
          <span v-if="message" :class="message.ok ? 'text-good-400' : 'text-bad-400'">
            {{ message.text }}
          </span>
          <div class="ml-auto flex gap-2">
            <RouterLink
              :to="{ name: 'lineup', query: { equipo: 'seleccion' } }"
              class="rounded border border-court-600 px-3 py-1 text-sm hover:border-ball-500"
            >
              Alineación y pizarra
            </RouterLink>
            <AppButton
              variant="primary"
              size="sm"
              :disabled="!callup.editable || !changed || saving || selected.size < callup.minSquad"
              @click="saveCallup"
            >
              Guardar lista
            </AppButton>
          </div>
        </div>
        <div class="overflow-auto">
          <table class="data-table">
            <thead>
              <tr>
                <th></th>
                <th>Jugador</th>
                <th>Puesto</th>
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
                  selected.has(row.playerId) ? 'bg-court-800 text-ball-400' : '',
                  callup.editable ? 'cursor-pointer' : ''
                ]"
                @click="toggle(row.playerId)"
              >
                <td>
                  <input
                    :id="`convocado-${row.playerId}`"
                    type="checkbox"
                    :checked="selected.has(row.playerId)"
                    :disabled="!callup.editable"
                    :aria-label="`Convocar a ${row.name}`"
                    @click.stop="toggle(row.playerId)"
                  />
                </td>
                <td>
                  <RouterLink
                    :to="{ name: 'player', params: { playerId: row.playerId } }"
                    class="inline-flex items-center gap-2 hover:text-ball-400"
                    @click.stop
                  >
                    <AppAvatar kind="player" :seed="row.playerId" />
                    {{ row.name }}
                  </RouterLink>
                </td>
                <td class="text-court-300">{{ POSITION_LABELS[row.position] }}</td>
                <td class="numeric">{{ row.age }}</td>
                <td class="numeric font-semibold">{{ row.overall }}</td>
                <td class="numeric text-court-300">{{ row.condition }}</td>
                <td class="text-court-300">{{ row.clubName ?? 'Sin club' }}</td>
                <td>
                  <AppBadge :tone="availability(row).tone">{{ availability(row).label }}</AppBadge>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </AppPanel>
    </template>

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

    <div v-else-if="tab === 'ranking'" class="grid gap-4 lg:grid-cols-[2fr_1fr]">
      <AppPanel title="Ranking de selecciones" flush>
        <table class="data-table">
          <thead>
            <tr>
              <th class="numeric">#</th>
              <th>Selección</th>
              <th class="numeric">Reputación</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="nation in overview?.nations ?? []"
              :key="nation.code"
              :class="
                nation.teamId === overview?.myTeam?.teamId ? 'bg-court-800 text-ball-400' : ''
              "
            >
              <td class="numeric">{{ nation.rank }}</td>
              <td>
                <span class="inline-flex items-center gap-2">
                  <AppFlag :code="nation.code" :label="nation.name" />
                  {{ nation.name }}
                </span>
              </td>
              <td class="numeric">{{ nation.reputation }}</td>
            </tr>
          </tbody>
        </table>
      </AppPanel>
      <AppPanel title="Campeones del mundo">
        <AppEmpty v-if="(overview?.champions.length ?? 0) === 0">
          Todavía no se ha jugado ningún Mundial.
        </AppEmpty>
        <ul v-else class="flex flex-col gap-1 text-sm">
          <li v-for="champion in overview?.champions ?? []" :key="champion.seasonNumber">
            <span class="text-court-300">
              {{ champion.startYear + 1 }}
            </span>
            · {{ champion.teamName }}
          </li>
        </ul>
      </AppPanel>
    </div>
  </div>
</template>
