<script setup lang="ts">
import { computed } from 'vue';
import type { TeamProfile, TeamProfileGame } from '@shared/contracts/teams.contract';
import { COMPETITION_KIND_LABEL } from '@shared/domain/competition-kind';
import { AppEmpty, AppPanel, COMPETITION_BAND, ResultBlock } from '@renderer/shared/ui';
import GameRow from '@renderer/features/competition/components/GameRow.vue';

/**
 * Los partidos del club este curso, de todas sus competiciones: a la izquierda
 * los jugados, del último hacia atrás, con su «V» o su «D»; a la derecha los que
 * quedan. Cada uno lleva la franja de su competición, del color de su tipo. Sólo
 * salen los que ya existen: una ronda sin sortear no tiene partido.
 */

const props = defineProps<{ profile: TeamProfile; games: readonly TeamProfileGame[] }>();

const played = computed(() => props.games.filter((game) => game.played).reverse());
const pending = computed(() => props.games.filter((game) => !game.played));

function wonBy(game: TeamProfileGame): boolean {
  const home = game.homeTeamId === props.profile.teamId;
  const own = (home ? game.homeScore : game.awayScore) ?? 0;
  const rival = (home ? game.awayScore : game.homeScore) ?? 0;
  return own > rival;
}
</script>

<template>
  <div class="grid min-h-0 flex-1 grid-cols-2 gap-4">
    <AppPanel title="Jugados" :hint="`${played.length}`" scroll class="min-h-0">
      <AppEmpty v-if="played.length === 0">
        Todavía no ha jugado ningún partido este curso.
      </AppEmpty>
      <ul v-else class="flex flex-col gap-[3px]">
        <li
          v-for="game in played"
          :key="game.gameId"
          class="grid grid-cols-[1.5rem_6.5rem_minmax(0,1fr)] items-center gap-[3px]"
        >
          <ResultBlock :won="wonBy(game)" size="sm" />
          <span
            class="truncate self-stretch px-2 py-1 text-xs font-bold"
            :class="COMPETITION_BAND[game.kind]"
            :title="`${COMPETITION_KIND_LABEL[game.kind]} · ${game.competitionName}`"
          >
            {{ COMPETITION_KIND_LABEL[game.kind] }}
          </span>
          <ul class="min-w-0">
            <GameRow :game="game" compact />
          </ul>
        </li>
      </ul>
    </AppPanel>

    <AppPanel title="Por jugar" :hint="`${pending.length}`" scroll class="min-h-0">
      <AppEmpty v-if="pending.length === 0">No le queda ningún partido este curso.</AppEmpty>
      <ul v-else class="flex flex-col gap-[3px]">
        <li
          v-for="game in pending"
          :key="game.gameId"
          class="grid grid-cols-[6.5rem_minmax(0,1fr)] items-center gap-[3px]"
        >
          <span
            class="truncate self-stretch px-2 py-1 text-xs font-bold"
            :class="COMPETITION_BAND[game.kind]"
            :title="`${COMPETITION_KIND_LABEL[game.kind]} · ${game.competitionName}`"
          >
            {{ COMPETITION_KIND_LABEL[game.kind] }}
          </span>
          <ul class="min-w-0">
            <GameRow :game="game" compact />
          </ul>
        </li>
      </ul>
    </AppPanel>
  </div>
</template>
