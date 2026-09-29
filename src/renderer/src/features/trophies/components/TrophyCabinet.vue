<script setup lang="ts">
/**
 * Una vitrina: cada título con su copa, cuántas veces se ganó y cuándo, y
 * detrás las placas de ascenso, que se ven pero no suman.
 *
 * Es la vitrina de la ficha del mánager; el historial tiene la suya, más
 * grande, con las mismas copas (`TrophyThumbnail`). Va sobre papel.
 */
import type { PromotionEntry, TrophyEntry } from '@shared/contracts/history.contract';
import { AppEmpty } from '@renderer/shared/ui';
import TrophyThumbnail from './TrophyThumbnail.vue';

withDefaults(
  defineProps<{
    trophies: TrophyEntry[];
    promotions?: PromotionEntry[];
    /** Lo que se dice con la vitrina vacía. */
    empty?: string;
  }>(),
  { promotions: () => [], empty: 'La vitrina está vacía. Todavía.' }
);
</script>

<template>
  <AppEmpty v-if="trophies.length === 0 && promotions.length === 0">{{ empty }}</AppEmpty>
  <ul
    v-else
    class="grid grid-cols-[repeat(auto-fill,minmax(15rem,1fr))] gap-[3px]"
    data-testid="trophy-cabinet"
  >
    <li
      v-for="trophy in trophies"
      :key="trophy.competitionId"
      class="flex items-center gap-2 bg-tv-cell px-2 py-1.5"
      :data-trophy-kind="trophy.trophyKind ?? ''"
    >
      <TrophyThumbnail
        v-if="trophy.trophyKind"
        :kind="trophy.trophyKind"
        :size="52"
        :label="trophy.competitionName"
      />
      <span class="flex min-w-0 flex-1 flex-col leading-tight">
        <span class="truncate text-sm font-semibold">{{ trophy.competitionName }}</span>
        <span class="truncate text-xs text-tv-muted">{{ trophy.years.join(', ') }}</span>
      </span>
      <span class="figure min-w-8 bg-tv-box py-0.5 text-center font-bold">
        {{ trophy.seasons.length }}
      </span>
    </li>
    <li
      v-for="promotion in promotions"
      :key="`ascenso-${promotion.seasonNumber}`"
      class="flex items-center gap-2 bg-tv-cell px-2 py-1.5"
      data-trophy-kind="promotion"
    >
      <TrophyThumbnail kind="promotion" :size="52" :label="`Ascenso ${promotion.years}`" />
      <span class="flex min-w-0 flex-1 flex-col leading-tight">
        <span class="truncate text-sm font-semibold"
          >Ascenso a {{ promotion.toCompetitionName }}</span
        >
        <span class="truncate text-xs text-tv-muted">{{ promotion.years }}</span>
      </span>
    </li>
  </ul>
</template>
