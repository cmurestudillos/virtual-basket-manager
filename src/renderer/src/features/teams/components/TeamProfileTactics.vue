<script setup lang="ts">
import { computed } from 'vue';
import type { TeamProfile } from '@shared/contracts/teams.contract';
import {
  AppEmpty,
  AppFlag,
  AppPanel,
  AppRing,
  KeyValueList,
  PlayerName,
  PositionChip,
  type KeyValueItem
} from '@renderer/shared/ui';

/**
 * La pizarra del club y el quinteto que suele sacar. De un club ajeno sólo con
 * un analista competente (el mismo informe que la previa del partido); sin él,
 * el aviso de que no hay informe. Del propio, siempre.
 */

const props = defineProps<{ profile: TeamProfile }>();

const items = computed<KeyValueItem[]>(() => {
  const tactics = props.profile.report?.tactics;
  if (!tactics) return [];
  return [
    { id: 'offense', label: 'Sistema ofensivo', value: tactics.offensiveSystem },
    { id: 'defense', label: 'Sistema defensivo', value: tactics.defensiveSystem },
    { id: 'pace', label: 'Ritmo', value: `${tactics.pace} / 10` },
    { id: 'intensity', label: 'Intensidad defensiva', value: `${tactics.defensiveIntensity} / 10` },
    { id: 'focus', label: 'Jugador de referencia', value: tactics.focusPlayerName ?? 'Ninguno' }
  ];
});
</script>

<template>
  <AppPanel v-if="!profile.report" title="Tácticas">
    <AppEmpty>
      Sin informe del analista. Con un analista competente en tu cuerpo técnico sabrás cómo juega
      este club y quién sale de inicio.
    </AppEmpty>
  </AppPanel>

  <div v-else class="grid min-h-0 flex-1 grid-cols-2 items-start gap-4">
    <AppPanel title="Pizarra" :hint="profile.isManaged ? '' : 'Informe del analista'">
      <KeyValueList :items="items" />
    </AppPanel>

    <AppPanel title="Quinteto habitual" flush>
      <AppEmpty v-if="profile.report.usualFive.length === 0">Sin quinteto que enseñar.</AppEmpty>
      <table v-else class="data-table">
        <thead>
          <tr>
            <th>Pos</th>
            <th>Jugador</th>
            <th class="numeric">Media</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="player in profile.report.usualFive" :key="player.playerId">
            <td><PositionChip :position="player.position" /></td>
            <td>
              <RouterLink
                :to="{ name: 'player', params: { playerId: player.playerId } }"
                class="flex max-w-64 items-center gap-2 hover:text-tv-blue-ink"
              >
                <AppFlag :code="player.nationality" />
                <PlayerName :name="player.playerName" />
              </RouterLink>
            </td>
            <td class="numeric is-key py-0.5">
              <span class="inline-flex items-center gap-1">
                <AppRing :value="player.overall" :unknown="profile.overall === null" :size="28" />
                <span
                  v-if="player.uncertainty > 0 && profile.overall !== null"
                  class="text-xs text-tv-muted"
                >
                  ±{{ player.uncertainty }}
                </span>
              </span>
            </td>
          </tr>
        </tbody>
      </table>
    </AppPanel>
  </div>
</template>
