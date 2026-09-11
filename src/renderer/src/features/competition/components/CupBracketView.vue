<script setup lang="ts">
import { onMounted, ref } from 'vue';
import type { CupBracket } from '@shared/contracts/season.contract';
import { formatMatchDate } from '@renderer/shared/format';
import { AppSectionTitle } from '@renderer/shared/ui';

const bracket = ref<CupBracket | null>(null);
const loaded = ref(false);

onMounted(async () => {
  bracket.value = await window.api.season.getCup();
  loaded.value = true;
});
</script>

<template>
  <div v-if="loaded" class="flex flex-col gap-6">
    <p v-if="!bracket" class="text-sm text-court-300">
      La Copa se sortea al cerrar la primera vuelta: la juegan los ocho primeros de la
      clasificación, a partido único y en sede neutral.
    </p>

    <template v-else>
      <p v-if="bracket.championTeamName" class="text-lg">
        <span class="text-court-300">Campeón de {{ bracket.competitionName }}:</span>
        <span class="ml-2 font-semibold text-ball-400">{{ bracket.championTeamName }}</span>
      </p>

      <section v-for="round in bracket.rounds" :key="round.round" class="flex flex-col gap-2">
        <AppSectionTitle
          >{{ round.name }}
          <span class="text-court-600">· partido único en sede neutral</span></AppSectionTitle
        >

        <ul class="flex flex-col gap-1">
          <li
            v-for="tie in round.ties"
            :key="tie.gameId"
            class="grid grid-cols-[1fr_7rem_1fr] items-center gap-3 rounded border px-4 py-2 text-sm"
            :class="tie.involvesManaged ? 'border-ball-600' : 'border-court-700'"
          >
            <span
              class="text-right"
              :class="
                tie.played && (tie.homeScore ?? 0) > (tie.awayScore ?? 0) ? 'font-semibold' : ''
              "
            >
              {{ tie.homeTeamName }}
            </span>
            <RouterLink
              v-if="tie.played"
              :to="{ name: 'match', params: { gameId: tie.gameId } }"
              class="text-center font-semibold tabular-nums hover:text-ball-400"
            >
              {{ tie.homeScore }} - {{ tie.awayScore }}
            </RouterLink>
            <span v-else class="text-center text-xs text-court-600">
              {{ formatMatchDate(tie.scheduledOn) }}
            </span>
            <span
              :class="
                tie.played && (tie.awayScore ?? 0) > (tie.homeScore ?? 0) ? 'font-semibold' : ''
              "
            >
              {{ tie.awayTeamName }}
            </span>
          </li>
        </ul>
      </section>
    </template>
  </div>
</template>
