<script setup lang="ts">
import { computed } from 'vue';
import { nameInitial, splitPlayerName } from '@shared/domain/player-name';

/**
 * El nombre de un jugador como lo escribe IBM: «Nombre APELLIDO».
 *
 * - `full`: «Adam KOZŁOWSKI», el de las tablas.
 * - `initial`: «A. KOZŁOWSKI», para lo estrecho (la pista, una fila con cara).
 * - `stacked`: el nombre encima y el apellido debajo, más grande, como en la
 *   previa del partido y la cabecera de la ficha.
 *
 * Se le pasa el nombre entero (`name`) o, si se tienen, las dos partes
 * (`first` y `last`), que no hay que adivinar. Las mayúsculas son de CSS: un
 * lector de pantalla oye el apellido y no un deletreo. No trae color: hereda el
 * del sitio donde va.
 */

const props = withDefaults(
  defineProps<{
    name?: string;
    first?: string;
    last?: string;
    mode?: 'full' | 'initial' | 'stacked';
  }>(),
  { name: '', first: undefined, last: undefined, mode: 'full' }
);

const parts = computed(() =>
  props.last !== undefined
    ? { first: props.first ?? '', last: props.last }
    : splitPlayerName(props.name)
);
const shownFirst = computed(() =>
  props.mode === 'initial' ? nameInitial(parts.value.first) : parts.value.first
);
</script>

<template>
  <span v-if="mode === 'stacked'" class="flex min-w-0 flex-col leading-tight">
    <span class="truncate text-sm">{{ parts.first }}</span>
    <span class="truncate text-base font-bold uppercase">{{ parts.last }}</span>
  </span>
  <span v-else class="truncate">
    <!-- El espacio va dentro de la interpolación: suelto, Vue lo recorta. -->
    <template v-if="shownFirst">{{ `${shownFirst} ` }}</template>
    <span class="uppercase">{{ parts.last }}</span>
  </span>
</template>
