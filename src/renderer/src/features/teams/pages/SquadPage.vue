<script setup lang="ts">
import { onMounted, ref } from 'vue';
import type { PlayerSummary } from '@shared/contracts/players.contract';
import { conditionLabel } from '@shared/domain/conditioning';
import { injuryLabel } from '@shared/domain/injuries';
import { POSITION_LABELS } from '@shared/domain/positions';
import { useGameStateStore } from '@renderer/shared/game-state.store';
import { formatHeight, formatMoney } from '@renderer/shared/format';
import { AppAvatar, AppFlag, AppPageHeader } from '@renderer/shared/ui';
import { nationName } from '@shared/domain/national-teams';
import { moraleLabel, moraleTone, type MoraleTone } from '@shared/domain/morale';

/** El ánimo se lee por color: el que está mal tiene que saltar a la vista. */
const MORALE_TEXT: Record<MoraleTone, string> = {
  good: 'text-good-400',
  neutral: 'text-court-300',
  warn: 'text-line-500',
  bad: 'text-bad-400'
};

const store = useGameStateStore();
const players = ref<PlayerSummary[]>([]);

onMounted(async () => {
  if (!store.state) {
    await store.refresh();
  }
  if (store.state) {
    players.value = await window.api.players.listByTeam(store.state.teamId);
  }
});
</script>

<template>
  <div class="flex flex-col gap-4">
    <AppPageHeader title="Plantilla" />

    <div class="overflow-auto rounded border border-court-700">
      <table class="data-table">
        <thead>
          <tr>
            <th>Pos</th>
            <th>Jugador</th>
            <th class="numeric">Edad</th>
            <th class="numeric">Altura</th>
            <th>Nac.</th>
            <th class="numeric">Media</th>
            <th class="numeric">Pot.</th>
            <th>Forma</th>
            <th>Ánimo</th>
            <th>Estado</th>
            <th class="numeric">T3</th>
            <th class="numeric">Reb</th>
            <th class="numeric">Pase</th>
            <th class="numeric">Def</th>
            <th class="numeric">Sueldo</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="player in players" :key="player.id">
            <td>
              <span class="text-ball-400">{{ player.position }}</span>
              <span class="ml-1 text-xs text-court-600">{{
                POSITION_LABELS[player.position]
              }}</span>
            </td>
            <td>
              <RouterLink
                :to="{ name: 'player', params: { playerId: player.id } }"
                class="inline-flex items-center gap-2 hover:text-ball-400"
              >
                <AppAvatar kind="player" :seed="player.id" />
                {{ player.firstName }} {{ player.lastName }}
              </RouterLink>
            </td>
            <td class="numeric">{{ player.age }}</td>
            <td class="numeric">{{ formatHeight(player.heightCm) }}</td>
            <td class="text-court-300">
              <span class="inline-flex items-center gap-1.5">
                <AppFlag :code="player.nationality" :label="nationName(player.nationality)" />
                {{ player.nationality }}
              </span>
            </td>
            <td class="numeric font-semibold">{{ player.overall }}</td>
            <td class="numeric text-court-300">{{ player.potential }}</td>
            <td :class="player.condition >= 75 ? 'text-court-300' : 'text-line-500'">
              {{ conditionLabel(player.condition) }}
            </td>
            <td :class="MORALE_TEXT[moraleTone(player.morale)]" :title="`Ánimo ${player.morale}`">
              {{ moraleLabel(player.morale) }}
            </td>
            <td :class="player.injuryDaysLeft > 0 ? 'text-bad-400' : 'text-court-600'">
              {{
                player.injuryDaysLeft > 0
                  ? `${player.injuryName} · ${injuryLabel(player.injuryDaysLeft)}`
                  : '—'
              }}
            </td>
            <td class="numeric">{{ player.attributes.threePoint }}</td>
            <td class="numeric">{{ player.attributes.defensiveRebound }}</td>
            <td class="numeric">{{ player.attributes.passing }}</td>
            <td class="numeric">{{ player.attributes.perimeterDefense }}</td>
            <td class="numeric text-court-300">{{ formatMoney(player.wageCents) }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
