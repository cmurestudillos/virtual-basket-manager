<script setup lang="ts">
/**
 * La pista del partido, vista desde arriba.
 *
 * El director de la escena vive aquí y no dentro del dibujo: así la pista sabe
 * qué pasa y cuándo, y `Court2D` sólo sabe dibujarlo.
 *
 * Hubo una vista 3D con la misma coreografía. Se quitó al acercar el partido a
 * International Basketball Manager, que no anima el partido en 3D: el 3D se
 * quedó como pabellón de fondo de la previa (`ArenaBackdrop`).
 */
import { toRef } from 'vue';
import type { CourtEvent } from '@shared/contracts/match.contract';
import type { CourtRosterPlayer, CourtSide, Kit } from '@shared/domain/court';
import Court2D from './Court2D.vue';
import { useCourtScene } from '../composables/useCourtScene';
import type { PlaybackSpeed } from '../composables/usePlayback';

const props = defineProps<{
  events: readonly CourtEvent[];
  visibleCount: number;
  roster: readonly CourtRosterPlayer[];
  kits: Record<CourtSide, Kit>;
  regulationPeriods: number;
  speed: PlaybackSpeed;
}>();

const scene = useCourtScene(
  toRef(props, 'events'),
  toRef(props, 'visibleCount'),
  toRef(props, 'roster'),
  toRef(props, 'regulationPeriods'),
  toRef(props, 'speed')
);
</script>

<template>
  <Court2D :scene="scene" :kits="kits" />
</template>
