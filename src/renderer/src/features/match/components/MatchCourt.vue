<script setup lang="ts">
/**
 * La pista del partido, en 2D o en 3D.
 *
 * La escena vive aquí y no en cada vista: cambiar de 2D a 3D a mitad de jugada
 * no la reinicia, sólo cambia cómo se dibuja. La 3D se carga aparte la primera
 * vez que alguien la pide, para no cargar three.js a quien nunca la abre.
 */
import { defineAsyncComponent, toRef } from 'vue';
import type { CourtEvent } from '@shared/contracts/match.contract';
import type { CourtRosterPlayer, CourtSide, Kit } from '@shared/domain/court';
import Court2D from './Court2D.vue';
import { useCourtScene } from '../composables/useCourtScene';
import type { PlaybackSpeed } from '../composables/usePlayback';

const Court3D = defineAsyncComponent(() => import('./Court3D.vue'));

const props = defineProps<{
  view: '2d' | '3d';
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
  <Court2D v-if="view === '2d'" :scene="scene" :kits="kits" />
  <Court3D v-else :scene="scene" :kits="kits" :regulation-periods="regulationPeriods" />
</template>
