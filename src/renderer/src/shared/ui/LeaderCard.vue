<script setup lang="ts">
import AppAvatar from './AppAvatar.vue';
import AppFlag from './AppFlag.vue';
import PlayerName from './PlayerName.vue';

/**
 * El líder de una estadística: quién mete más puntos, quién coge más rebotes.
 * Es la mini ficha de IBM (125858): la cara a la izquierda; en medio, qué se
 * mide, la bandera y el nombre, y la letra pequeña de cuántos partidos; a la
 * derecha, la cifra grande en su caja gris.
 *
 * Va sobre papel, en su franja gris. `rank` le pone delante el puesto en su
 * banda añil, para las listas de los cinco primeros.
 */

withDefaults(
  defineProps<{
    /** Qué se mide: «Puntos», «Valoración». */
    label: string;
    name: string;
    /** Semilla de la cara: el id del jugador. */
    seed: string;
    /** Ya formateada: «11,4». */
    value: string | number;
    valueLabel?: string;
    nationality?: string | null;
    /** Letra pequeña: «Partidos jugados: 15». */
    note?: string;
    rank?: number | null;
    /** `initial` («A. KOZŁOWSKI») para columnas estrechas. */
    nameMode?: 'full' | 'initial';
  }>(),
  { valueLabel: 'Media', nationality: null, note: '', rank: null, nameMode: 'full' }
);
</script>

<template>
  <article class="flex min-w-0 items-stretch bg-tv-cell text-tv-ink">
    <span
      v-if="rank !== null"
      class="figure flex w-7 shrink-0 items-center justify-center bg-tv-800 text-sm font-bold text-white"
    >
      {{ rank }}
    </span>
    <div class="flex min-w-0 flex-1 items-center gap-3 px-2 py-1.5">
      <AppAvatar kind="player" :seed="seed" :name="name" :size="44" />
      <div class="flex min-w-0 flex-1 flex-col leading-tight">
        <span class="truncate text-sm">{{ label }}</span>
        <span class="flex min-w-0 items-center gap-1.5 text-sm font-bold">
          <AppFlag v-if="nationality" :code="nationality" />
          <PlayerName :name="name" :mode="nameMode" />
        </span>
        <span v-if="note" class="truncate text-xs italic text-tv-muted">{{ note }}</span>
      </div>
      <div class="flex shrink-0 flex-col items-center gap-0.5">
        <span class="text-xs">{{ valueLabel }}</span>
        <span class="figure min-w-14 bg-tv-box px-2 py-1 text-center text-lg font-bold">
          {{ value }}
        </span>
      </div>
    </div>
  </article>
</template>
