<script setup lang="ts">
import type { RoundMvp } from '@shared/contracts/match.contract';
import { matchKits } from '@shared/domain/court';
import { AppAvatar, AppFlag, AppPanel, AppStat, PlayerName, TeamBadge } from '@renderer/shared/ui';

/**
 * El mejor jugador de la jornada, al lado de los resultados, como en IBM: la
 * cara, bandera y nombre, su equipo y su línea de estadística en cajas. Es el
 * mismo MVP que sale al acabar la jornada en el partido (`RoundResultsView`):
 * la valoración más alta de todas las actas de la jornada.
 */

defineProps<{ mvp: RoundMvp }>();

const STATS = [
  { key: 'efficiency', label: 'Val' },
  { key: 'points', label: 'Pts' },
  { key: 'rebounds', label: 'Reb' },
  { key: 'assists', label: 'Asi' },
  { key: 'steals', label: 'Rob' },
  { key: 'blocks', label: 'Tap' }
] as const;
</script>

<template>
  <AppPanel title="MVP de la jornada">
    <div class="flex flex-col gap-3">
      <div class="flex items-center gap-3">
        <AppAvatar kind="player" :seed="mvp.playerId" :name="mvp.playerName" :size="72" />
        <div class="flex min-w-0 flex-col gap-1.5 text-sm">
          <RouterLink
            :to="{ name: 'player', params: { playerId: mvp.playerId } }"
            class="flex min-w-0 items-center gap-2 font-semibold hover:text-tv-blue-ink"
          >
            <AppFlag :code="mvp.nationality" />
            <PlayerName :name="mvp.playerName" />
          </RouterLink>
          <span class="flex min-w-0 items-center gap-2">
            <TeamBadge :name="mvp.teamName" :kit="matchKits(mvp.teamId, '').home" :size="20" />
            <span class="truncate">{{ mvp.teamName }}</span>
          </span>
        </div>
      </div>
      <div class="grid grid-cols-3 gap-[3px]">
        <AppStat v-for="stat in STATS" :key="stat.key" :label="stat.label" size="md" boxed>
          {{ mvp[stat.key] }}
        </AppStat>
      </div>
    </div>
  </AppPanel>
</template>
