<script setup lang="ts">
import { matchKits } from '@shared/domain/court';
import { AppFlag, TONE_CHIP, TeamBadge } from '@renderer/shared/ui';

/**
 * Un cruce de un cuadro: los dos equipos, uno encima del otro, cada uno con su
 * cifra en una caja —las victorias de la serie o los puntos del partido—, y
 * debajo lo que haga falta (los partidos de la serie, la fecha).
 *
 * El que pasa lleva su cifra en verde, como el bloque de victoria de IBM; el
 * cruce donde juegas tú, en azul pálido. Es la pieza común de los playoffs, la
 * Copa, Europa y el Mundial: de ella sale `SeriesCard`.
 */

export interface MatchupSide {
  teamId: string;
  name: string;
  /** Puesto con el que entra al cuadro, si lo tiene. */
  seed?: number | null;
  value: string | number | null;
  winner: boolean;
  /** Para selecciones: el código de la bandera. */
  nation?: string | null;
}

defineProps<{ sides: readonly [MatchupSide, MatchupSide]; highlighted: boolean }>();

function kitOf(teamId: string) {
  return matchKits(teamId, '').home;
}
</script>

<template>
  <li
    class="flex flex-col gap-[3px] p-[3px] text-sm text-tv-ink"
    :class="highlighted ? 'bg-tv-select' : 'bg-tv-paper'"
  >
    <div
      v-for="side in sides"
      :key="side.teamId"
      class="grid grid-cols-[auto_minmax(0,1fr)_2.5rem] items-center gap-[3px]"
    >
      <span class="flex h-8 w-9 items-center justify-center bg-white">
        <AppFlag v-if="side.nation" :code="side.nation" :label="side.name" />
        <TeamBadge v-else :name="side.name" :kit="kitOf(side.teamId)" :size="24" />
      </span>
      <span
        class="flex h-8 min-w-0 items-center gap-2 px-2"
        :class="highlighted ? '' : 'bg-tv-cell'"
      >
        <span v-if="side.seed" class="figure text-xs text-tv-muted">{{ side.seed }}</span>
        <span class="truncate" :class="side.winner ? 'font-bold' : ''" :title="side.name">
          {{ side.name }}
        </span>
      </span>
      <span
        class="figure flex h-8 items-center justify-center text-lg font-bold"
        :class="side.winner ? TONE_CHIP.good : 'bg-tv-cell-strong'"
      >
        {{ side.value ?? '-' }}
      </span>
    </div>
    <div v-if="$slots.default" class="flex flex-wrap gap-x-3 gap-y-0.5 px-1 text-xs">
      <slot />
    </div>
  </li>
</template>
