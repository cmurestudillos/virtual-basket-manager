<script setup lang="ts">
/**
 * Las cesiones en marcha, como la lista de traspasos de IBM: el jugador, hacia
 * dónde va la cesión y el otro club. Uno tuyo cedido fuera y uno que juega aquí
 * prestado se distinguen por la etiqueta, no por el color de la fila.
 */
import type { LoanEntry } from '@shared/contracts/market.contract';
import {
  AppBadge,
  AppFlag,
  AppPanel,
  AppRing,
  PlayerName,
  PositionChip
} from '@renderer/shared/ui';

defineProps<{ loans: readonly LoanEntry[] }>();
</script>

<template>
  <AppPanel
    title="Cesiones"
    :hint="`${loans.length} en marcha`"
    scroll
    flush
    class="min-h-0 flex-1"
  >
    <table class="data-table">
      <thead>
        <tr>
          <th>Jugador</th>
          <th>Pos</th>
          <th class="numeric">Media</th>
          <th>Cesión</th>
          <th>Club</th>
        </tr>
      </thead>
      <tbody>
        <tr v-if="loans.length === 0">
          <td colspan="5" class="text-center text-tv-muted">No hay ninguna cesión en marcha.</td>
        </tr>
        <tr v-for="loan in loans" :key="loan.playerId">
          <td>
            <span class="flex items-center gap-2">
              <AppFlag :code="loan.nationality" />
              <PlayerName :name="loan.playerName" />
            </span>
          </td>
          <td><PositionChip :position="loan.position" /></td>
          <td class="numeric is-key py-0.5"><AppRing :value="loan.overall" :size="28" /></td>
          <td>
            <AppBadge :tone="loan.direction === 'out' ? 'neutral' : 'accent'">
              {{ loan.direction === 'out' ? 'Cedido fuera' : 'Cedido aquí' }}
            </AppBadge>
          </td>
          <td>{{ loan.otherTeamName }}</td>
        </tr>
      </tbody>
    </table>
  </AppPanel>
</template>
