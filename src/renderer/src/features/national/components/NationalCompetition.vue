<script setup lang="ts">
import { computed } from 'vue';
import type { NationalCompetitionView } from '@shared/contracts/national.contract';
import type { FixtureEntry } from '@shared/contracts/season.contract';
import { formatMatchDate } from '@renderer/shared/format';
import { AppEmpty, AppPanel } from '@renderer/shared/ui';
import BracketColumns from '@renderer/features/competition/components/BracketColumns.vue';
import ChampionBanner from '@renderer/features/competition/components/ChampionBanner.vue';
import GameRow from '@renderer/features/competition/components/GameRow.vue';
import MatchupCard, {
  type MatchupSide
} from '@renderer/features/competition/components/MatchupCard.vue';
import StandingsTable from '@renderer/features/competition/components/StandingsTable.vue';

/**
 * Una competición de selecciones: sus grupos —tabla y partidos— y, en el
 * Mundial, el cuadro final. La clasificación y el Mundial se pintan igual
 * porque se leen igual: quién va primero y quién pasa.
 *
 * Con las piezas de la competición de clubes: la clasificación de IBM con tu
 * selección en azul pálido, la jornada en líneas y el cuadro en columnas, con
 * banderas en vez de escudos.
 */

const props = defineProps<{
  view: NationalCompetitionView | null;
  empty: string;
  passing: string;
}>();

/** El código de nacionalidad sale del id de la selección: `seleccion-esp`. */
function codeOf(teamId: string): string {
  return teamId.replace('seleccion-', '').toUpperCase();
}

const columns = computed(() =>
  (props.view?.knockout ?? []).map((round) => ({
    key: round.round,
    title: round.name,
    items: round.games
  }))
);

function sides(game: FixtureEntry): [MatchupSide, MatchupSide] {
  const homeWon = game.played && (game.homeScore ?? 0) > (game.awayScore ?? 0);
  const awayWon = game.played && (game.awayScore ?? 0) > (game.homeScore ?? 0);
  return [
    {
      teamId: game.homeTeamId,
      name: game.homeTeamName,
      value: game.homeScore,
      winner: homeWon,
      nation: codeOf(game.homeTeamId)
    },
    {
      teamId: game.awayTeamId,
      name: game.awayTeamName,
      value: game.awayScore,
      winner: awayWon,
      nation: codeOf(game.awayTeamId)
    }
  ];
}
</script>

<template>
  <AppPanel v-if="!view" title="Selecciones">
    <AppEmpty>{{ empty }}</AppEmpty>
  </AppPanel>

  <div v-else class="flex flex-col gap-4">
    <ChampionBanner
      v-if="view.championTeamName"
      :label="`Campeón del ${view.name}`"
      :team-name="view.championTeamName"
    />
    <p v-else-if="view.hostName" class="text-sm text-white/75">
      Anfitrión del Mundial: <span class="font-bold text-white">{{ view.hostName }}</span> ·
      {{ passing }}
    </p>
    <p v-else class="text-sm text-white/75">{{ passing }}</p>

    <BracketColumns v-if="columns.length > 0" :columns="columns" :item-key="(game) => game.gameId">
      <template #item="{ item }">
        <MatchupCard :sides="sides(item)" :highlighted="item.involvesManaged">
          <RouterLink
            v-if="item.played"
            :to="{ name: 'match', params: { gameId: item.gameId } }"
            class="text-tv-blue-ink hover:underline"
          >
            Ver el acta
          </RouterLink>
          <span v-else class="text-tv-muted">{{ formatMatchDate(item.scheduledOn) }}</span>
        </MatchupCard>
      </template>
    </BracketColumns>

    <div class="grid grid-cols-2 items-start gap-4">
      <AppPanel v-for="group in view.groups" :key="group.name" :title="group.name" flush>
        <StandingsTable :rows="group.standings" :nation-of="codeOf" />
        <ul class="flex flex-col gap-[3px] p-[3px]">
          <GameRow
            v-for="game in group.fixtures"
            :key="game.gameId"
            :game="game"
            :nation-of="codeOf"
            compact
          />
        </ul>
      </AppPanel>
    </div>
  </div>
</template>
