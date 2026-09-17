<script setup lang="ts">
import { matchKits } from '@shared/domain/court';
import { TeamBadge } from '@renderer/shared/ui';

/**
 * El campeón de una competición terminada, en una franja de papel encima del
 * cuadro: escudo, de qué es campeón y quién. Si el campeón es tu equipo, en
 * azul pálido.
 *
 * Sin `teamId` (las selecciones sólo traen el nombre) va sin escudo.
 */

withDefaults(
  defineProps<{
    /** «Campeón de Euroliga». */
    label: string;
    teamName: string;
    teamId?: string | null;
    mine?: boolean;
  }>(),
  { teamId: null, mine: false }
);
</script>

<template>
  <div
    class="flex items-center gap-4 px-4 py-2 text-tv-ink"
    :class="mine ? 'bg-tv-select' : 'bg-tv-paper'"
  >
    <span v-if="teamId" class="flex items-center justify-center bg-white p-1">
      <TeamBadge :name="teamName" :kit="matchKits(teamId, '').home" :size="36" />
    </span>
    <p class="flex flex-wrap items-baseline gap-x-3">
      <span class="text-xs font-bold uppercase tracking-wide text-tv-muted">{{ label }}:</span>
      <span class="text-lg font-bold uppercase">{{ teamName }}</span>
    </p>
  </div>
</template>
