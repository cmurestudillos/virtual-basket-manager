<script setup lang="ts">
import type { TeamProfile } from '@shared/contracts/teams.contract';
import { AppEmpty, AppFlag, AppPanel, PlayerName, PositionChip } from '@renderer/shared/ui';

/**
 * Las medias de temporada de la plantilla en su liga, ordenadas por valoración.
 * Son públicas —salen de las actas— y por eso se ven igual de cualquier club.
 */

defineProps<{ profile: TeamProfile }>();

const DECIMAL = new Intl.NumberFormat('es-ES', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1
});
</script>

<template>
  <AppPanel
    title="Estadísticas de la temporada"
    :hint="profile.competitionName"
    scroll
    flush
    class="min-h-0 flex-1"
  >
    <AppEmpty v-if="profile.playerStats.length === 0">
      Las medias salen con el primer partido de liga jugado.
    </AppEmpty>
    <table v-else class="data-table">
      <thead>
        <tr>
          <th>Jugador</th>
          <th>Pos</th>
          <th class="numeric">PJ</th>
          <th class="numeric">Min</th>
          <th class="numeric">Pts</th>
          <th class="numeric">Reb</th>
          <th class="numeric">Ast</th>
          <th class="numeric">Rob</th>
          <th class="numeric">Tap</th>
          <th class="numeric">Pér</th>
          <th class="numeric">T2 %</th>
          <th class="numeric">T3 %</th>
          <th class="numeric">TL %</th>
          <th class="numeric">Val</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in profile.playerStats" :key="row.playerId">
          <td>
            <RouterLink
              :to="{ name: 'player', params: { playerId: row.playerId } }"
              class="flex max-w-56 items-center gap-2 hover:text-tv-blue-ink"
            >
              <AppFlag :code="row.nationality" />
              <PlayerName :name="row.playerName" />
            </RouterLink>
          </td>
          <td><PositionChip :position="row.position" /></td>
          <td class="numeric">{{ row.games }}</td>
          <td class="numeric">{{ DECIMAL.format(row.minutesPerGame) }}</td>
          <td class="numeric">{{ DECIMAL.format(row.pointsPerGame) }}</td>
          <td class="numeric">{{ DECIMAL.format(row.reboundsPerGame) }}</td>
          <td class="numeric">{{ DECIMAL.format(row.assistsPerGame) }}</td>
          <td class="numeric">{{ DECIMAL.format(row.stealsPerGame) }}</td>
          <td class="numeric">{{ DECIMAL.format(row.blocksPerGame) }}</td>
          <td class="numeric">{{ DECIMAL.format(row.turnoversPerGame) }}</td>
          <td class="numeric">{{ DECIMAL.format(row.twoPointPercentage) }}</td>
          <td class="numeric">{{ DECIMAL.format(row.threePointPercentage) }}</td>
          <td class="numeric">{{ DECIMAL.format(row.freeThrowPercentage) }}</td>
          <td class="numeric is-key font-bold">{{ DECIMAL.format(row.efficiencyPerGame) }}</td>
        </tr>
      </tbody>
    </table>
  </AppPanel>
</template>
