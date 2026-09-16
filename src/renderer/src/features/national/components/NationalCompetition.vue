<script setup lang="ts">
import type { NationalCompetitionView } from '@shared/contracts/national.contract';
import type { FixtureEntry } from '@shared/contracts/season.contract';
import { formatShortDate } from '@renderer/shared/format';
import { AppEmpty, AppFlag, AppPanel, AppSectionTitle } from '@renderer/shared/ui';

/**
 * Una competición de selecciones: sus grupos —tabla y partidos— y, en el
 * Mundial, el cuadro final. La clasificación y el Mundial se pintan igual
 * porque se leen igual: quién va primero y quién pasa.
 */

defineProps<{ view: NationalCompetitionView | null; empty: string; passing: string }>();

/** El código de nacionalidad sale del id de la selección: `seleccion-esp`. */
function codeOf(teamId: string): string {
  return teamId.replace('seleccion-', '').toUpperCase();
}

function scoreLabel(game: FixtureEntry): string {
  return game.played ? `${game.homeScore} - ${game.awayScore}` : formatShortDate(game.scheduledOn);
}
</script>

<template>
  <AppEmpty v-if="!view">{{ empty }}</AppEmpty>

  <div v-else class="flex flex-col gap-4">
    <p v-if="view.championTeamName" class="text-lg">
      <span class="text-court-300">Campeón del {{ view.name }}:</span>
      <span class="ml-2 font-semibold text-ball-400">{{ view.championTeamName }}</span>
    </p>
    <p v-else-if="view.hostName" class="text-sm text-court-300">
      Anfitrión del Mundial: <span class="text-court-100">{{ view.hostName }}</span> ·
      {{ passing }}
    </p>

    <section v-if="view.knockout.length > 0" class="flex flex-col gap-3">
      <div v-for="round in view.knockout" :key="round.round" class="flex flex-col gap-1">
        <AppSectionTitle>{{ round.name }}</AppSectionTitle>
        <ul class="grid gap-1 md:grid-cols-2">
          <li
            v-for="game in round.games"
            :key="game.gameId"
            class="grid grid-cols-[1fr_6.5rem_1fr] items-center gap-2 rounded border px-3 py-2 text-sm"
            :class="game.involvesManaged ? 'border-ball-600' : 'border-court-700'"
          >
            <span class="flex items-center justify-end gap-2 text-right">
              {{ game.homeTeamName }} <AppFlag :code="codeOf(game.homeTeamId)" />
            </span>
            <RouterLink
              v-if="game.played"
              :to="{ name: 'match', params: { gameId: game.gameId } }"
              class="text-center font-semibold tabular-nums hover:text-ball-400"
            >
              {{ scoreLabel(game) }}
            </RouterLink>
            <span v-else class="text-center text-xs text-court-300">{{ scoreLabel(game) }}</span>
            <span class="flex items-center gap-2">
              <AppFlag :code="codeOf(game.awayTeamId)" /> {{ game.awayTeamName }}
            </span>
          </li>
        </ul>
      </div>
    </section>

    <div class="grid gap-3 xl:grid-cols-2">
      <AppPanel v-for="group in view.groups" :key="group.name" :title="group.name" flush>
        <div class="overflow-x-auto">
          <table class="data-table">
            <thead>
              <tr>
                <th class="numeric">#</th>
                <th>Selección</th>
                <th class="numeric">J</th>
                <th class="numeric">G</th>
                <th class="numeric">P</th>
                <th class="numeric">Dif</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="row in group.standings"
                :key="row.teamId"
                :class="row.isManaged ? 'bg-court-800 text-ball-400' : ''"
              >
                <td
                  class="numeric border-l-4"
                  :class="row.zone ? 'border-ball-500' : 'border-transparent'"
                >
                  {{ row.position }}
                </td>
                <td>
                  <span class="inline-flex items-center gap-2">
                    <AppFlag :code="codeOf(row.teamId)" :label="row.teamName" />
                    {{ row.teamName }}
                  </span>
                </td>
                <td class="numeric">{{ row.played }}</td>
                <td class="numeric font-semibold">{{ row.won }}</td>
                <td class="numeric">{{ row.lost }}</td>
                <td class="numeric" :class="row.pointsDifference >= 0 ? 'text-good-400' : ''">
                  {{ row.pointsDifference > 0 ? '+' : '' }}{{ row.pointsDifference }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <ul class="flex flex-col border-t border-court-700 px-3 py-2 text-xs">
          <li
            v-for="game in group.fixtures"
            :key="game.gameId"
            class="grid grid-cols-[1fr_6.5rem_1fr] items-center gap-2 py-0.5"
            :class="game.involvesManaged ? 'text-ball-400' : 'text-court-300'"
          >
            <span class="truncate text-right">{{ game.homeTeamName }}</span>
            <RouterLink
              v-if="game.played"
              :to="{ name: 'match', params: { gameId: game.gameId } }"
              class="text-center tabular-nums hover:text-ball-400"
            >
              {{ scoreLabel(game) }}
            </RouterLink>
            <span v-else class="text-center text-court-600">{{ scoreLabel(game) }}</span>
            <span class="truncate">{{ game.awayTeamName }}</span>
          </li>
        </ul>
      </AppPanel>
    </div>
  </div>
</template>
