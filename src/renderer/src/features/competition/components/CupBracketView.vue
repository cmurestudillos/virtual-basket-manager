<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import type { CupBracket, CupTie } from '@shared/contracts/season.contract';
import { formatMatchDate } from '@renderer/shared/format';
import { AppEmpty, AppPanel } from '@renderer/shared/ui';
import { useGameStateStore } from '@renderer/shared/game-state.store';
import BracketColumns from '@renderer/features/competition/components/BracketColumns.vue';
import ChampionBanner from '@renderer/features/competition/components/ChampionBanner.vue';
import MatchupCard, {
  type MatchupSide
} from '@renderer/features/competition/components/MatchupCard.vue';

/**
 * La Copa en su cuadro: cuartos, semifinales y final en columnas, cada cruce
 * con los puntos de cada equipo. A partido único y en sede neutral, así que no
 * hay más que un marcador por cruce: jugado, lleva al acta; sin jugar, dice
 * cuándo se juega.
 */

/** País de la copa; sin él, la del país del club. */
const props = defineProps<{ country?: string }>();

const store = useGameStateStore();
const bracket = ref<CupBracket | null>(null);
const loaded = ref(false);

onMounted(async () => {
  bracket.value = await window.api.season.getCup(props.country);
  loaded.value = true;
});

const columns = computed(() =>
  (bracket.value?.rounds ?? []).map((round) => ({
    key: round.round,
    title: round.name,
    note: 'Partido único en sede neutral',
    items: round.ties
  }))
);

function sides(tie: CupTie): [MatchupSide, MatchupSide] {
  const homeWon = tie.played && (tie.homeScore ?? 0) > (tie.awayScore ?? 0);
  const awayWon = tie.played && (tie.awayScore ?? 0) > (tie.homeScore ?? 0);
  return [
    { teamId: tie.homeTeamId, name: tie.homeTeamName, value: tie.homeScore, winner: homeWon },
    { teamId: tie.awayTeamId, name: tie.awayTeamName, value: tie.awayScore, winner: awayWon }
  ];
}
</script>

<template>
  <div v-if="loaded" class="flex flex-col gap-4">
    <AppPanel v-if="!bracket" title="Copa">
      <AppEmpty>
        La Copa se sortea al cerrar la primera vuelta: la juegan los ocho primeros de la
        clasificación, a partido único y en sede neutral.
      </AppEmpty>
    </AppPanel>

    <template v-else>
      <ChampionBanner
        v-if="bracket.championTeamName"
        :label="`Campeón de ${bracket.competitionName}`"
        :team-id="bracket.championTeamId"
        :team-name="bracket.championTeamName"
        :mine="bracket.championTeamId === store.state?.teamId"
      />

      <BracketColumns :columns="columns" :item-key="(tie) => tie.gameId">
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
    </template>
  </div>
</template>
