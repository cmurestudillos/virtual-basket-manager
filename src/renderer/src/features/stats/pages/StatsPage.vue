<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import type { LeaderBoard, PlayerSeasonStats } from '@shared/contracts/stats.contract';
import { LEADER_CATEGORY_LABELS, type LeaderCategory } from '@shared/domain/season-stats';
import { matchKits } from '@shared/domain/court';
import { useGameStateStore } from '@renderer/shared/game-state.store';
import {
  AppAvatar,
  AppEmpty,
  AppFlag,
  AppPanel,
  AppSelect,
  AppStat,
  AppTabs,
  PlayerName,
  PositionChip,
  TeamBadge
} from '@renderer/shared/ui';
import PageToolbar from '@renderer/features/app-shell/components/PageToolbar.vue';

/**
 * Estadísticas de la temporada: las medias de tu plantilla y los líderes de la
 * liga en cada categoría.
 *
 * Como IBM: la rejilla con el jugador en «Nombre APELLIDO», su puesto en el
 * chip y la columna que manda (la valoración, o la categoría de líderes) en
 * gris más oscuro. Las pestañas van en la barra de sección y la categoría, en
 * el selector negro de su derecha. El primero de la lista sale además en su
 * ficha, con la cara, como la mini ficha de líder de IBM.
 */

const store = useGameStateStore();

type Tab = 'team' | 'leaders';
const tab = ref<Tab>('team');
const team = ref<PlayerSeasonStats[]>([]);
const board = ref<LeaderBoard | null>(null);
const category = ref<LeaderCategory>('points');

const categories = (Object.entries(LEADER_CATEGORY_LABELS) as [LeaderCategory, string][]).map(
  ([id, label]) => ({ id, label })
);

const leader = computed(() => board.value?.entries[0] ?? null);

onMounted(async () => {
  if (!store.state) {
    await store.refresh();
  }
  if (store.state) {
    team.value = await window.api.stats.teamSeason(store.state.teamId);
  }
  await loadLeaders();
});

watch(category, loadLeaders);

async function loadLeaders(): Promise<void> {
  board.value = await window.api.stats.leaders(category.value, 10);
}

const DECIMAL = new Intl.NumberFormat('es-ES', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1
});

/** Media con un decimal fijo y coma: una tabla con 7 y 7,3 mezclados no se lee. */
function average(value: number): string {
  return DECIMAL.format(value);
}
</script>

<template>
  <PageToolbar place="tabs">
    <AppTabs
      :model-value="tab"
      :options="[
        { id: 'team' as Tab, label: 'Mi equipo' },
        { id: 'leaders' as Tab, label: 'Líderes de la liga' }
      ]"
      @update:model-value="tab = $event as Tab"
    />
  </PageToolbar>

  <PageToolbar>
    <AppSelect
      v-if="tab === 'leaders'"
      :model-value="category"
      :options="categories"
      label="Categoría"
      @update:model-value="category = $event as LeaderCategory"
    />
  </PageToolbar>

  <AppPanel
    v-if="tab === 'team'"
    title="Mi equipo"
    :hint="team.length > 0 ? `${team.length} jugadores · por partido` : ''"
    flush
  >
    <AppEmpty v-if="team.length === 0">Todavía no se ha jugado ningún partido de liga.</AppEmpty>

    <table v-else class="data-table">
      <thead>
        <tr>
          <th>Jugador</th>
          <th>Pos</th>
          <th class="numeric">PJ</th>
          <th class="numeric">Min</th>
          <th class="numeric">Pts</th>
          <th class="numeric">Reb</th>
          <th class="numeric">Asi</th>
          <th class="numeric">Rob</th>
          <th class="numeric">Tap</th>
          <th class="numeric">Per</th>
          <th class="numeric">T2%</th>
          <th class="numeric">T3%</th>
          <th class="numeric">TL%</th>
          <th class="numeric">Val</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in team" :key="row.playerId">
          <td>
            <RouterLink
              :to="{ name: 'player', params: { playerId: row.playerId } }"
              class="flex items-center gap-2 hover:text-tv-blue-ink"
            >
              <AppFlag :code="row.nationality" />
              <PlayerName :name="row.playerName" />
            </RouterLink>
          </td>
          <td><PositionChip :position="row.position" /></td>
          <td class="numeric">{{ row.games }}</td>
          <td class="numeric">{{ average(row.minutesPerGame) }}</td>
          <td class="numeric font-semibold">{{ average(row.pointsPerGame) }}</td>
          <td class="numeric">{{ average(row.reboundsPerGame) }}</td>
          <td class="numeric">{{ average(row.assistsPerGame) }}</td>
          <td class="numeric">{{ average(row.stealsPerGame) }}</td>
          <td class="numeric">{{ average(row.blocksPerGame) }}</td>
          <td class="numeric">{{ average(row.turnoversPerGame) }}</td>
          <td class="numeric">{{ average(row.twoPointPercentage) }}</td>
          <td class="numeric">{{ average(row.threePointPercentage) }}</td>
          <td class="numeric">{{ average(row.freeThrowPercentage) }}</td>
          <td class="numeric is-key font-bold">{{ average(row.efficiencyPerGame) }}</td>
        </tr>
      </tbody>
    </table>
  </AppPanel>

  <div v-else class="grid grid-cols-[minmax(0,1fr)_18rem] items-start gap-4">
    <AppPanel
      :title="board?.label ?? 'Líderes'"
      :hint="
        board
          ? `Por partido · mínimo ${board.minimumGames} ${board.minimumGames === 1 ? 'partido' : 'partidos'}`
          : ''
      "
      flush
    >
      <AppEmpty v-if="board && board.entries.length === 0">
        Todavía no hay nadie que llegue al mínimo de partidos.
      </AppEmpty>

      <table v-else-if="board" class="data-table">
        <thead>
          <tr>
            <th class="numeric">Pos</th>
            <th>Jugador</th>
            <th>Puesto</th>
            <th>Equipo</th>
            <th class="numeric">PJ</th>
            <th class="numeric">{{ board.label }}</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="entry in board.entries"
            :key="entry.player.playerId"
            :class="entry.player.teamId === store.state?.teamId ? 'is-mine' : ''"
          >
            <td class="numeric w-12">{{ entry.rank }}</td>
            <td>
              <RouterLink
                :to="{ name: 'player', params: { playerId: entry.player.playerId } }"
                class="flex items-center gap-2 hover:text-tv-blue-ink"
              >
                <AppFlag :code="entry.player.nationality" />
                <PlayerName :name="entry.player.playerName" />
              </RouterLink>
            </td>
            <td><PositionChip :position="entry.player.position" /></td>
            <td>
              <span class="flex items-center gap-2">
                <TeamBadge
                  :name="entry.player.teamName"
                  :kit="matchKits(entry.player.teamId, '').home"
                  :size="20"
                />
                <span class="truncate">{{ entry.player.teamName }}</span>
              </span>
            </td>
            <td class="numeric">{{ entry.player.games }}</td>
            <td class="numeric is-key font-bold">{{ average(entry.value) }}</td>
          </tr>
        </tbody>
      </table>
    </AppPanel>

    <AppPanel v-if="leader && board" title="Líder">
      <div class="flex flex-col gap-3">
        <div class="flex items-center gap-3">
          <AppAvatar
            kind="player"
            :seed="leader.player.playerId"
            :name="leader.player.playerName"
            :size="72"
          />
          <div class="flex min-w-0 flex-col gap-1.5 text-sm">
            <RouterLink
              :to="{ name: 'player', params: { playerId: leader.player.playerId } }"
              class="flex min-w-0 items-center gap-2 font-semibold hover:text-tv-blue-ink"
            >
              <AppFlag :code="leader.player.nationality" />
              <PlayerName :name="leader.player.playerName" />
            </RouterLink>
            <span class="flex min-w-0 items-center gap-2">
              <TeamBadge
                :name="leader.player.teamName"
                :kit="matchKits(leader.player.teamId, '').home"
                :size="20"
              />
              <span class="truncate">{{ leader.player.teamName }}</span>
            </span>
          </div>
        </div>
        <AppStat :label="board.label" boxed>{{ average(leader.value) }}</AppStat>
      </div>
    </AppPanel>
  </div>
</template>
