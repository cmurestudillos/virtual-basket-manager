<script setup lang="ts">
/**
 * Las tres confianzas de IBM (130718), seguidas y del mismo tamaño: DIRECTIVA,
 * AFICIÓN y JUGADORES. Cada una en su anillo con la escala de cuatro tramos y,
 * debajo, cómo se lee («Plena confianza», «Tibia», «Contento»).
 *
 * Salen de datos que el juego ya tiene: la confianza del consejo, el apoyo de
 * la afición y la moral media de la plantilla. La que no tiene dato —sin club,
 * sin plantilla— no se pinta. Va sobre papel.
 */
import { computed } from 'vue';
import { moraleLabel } from '@shared/domain/morale';
import { AppRing } from '@renderer/shared/ui';

const props = withDefaults(
  defineProps<{
    board?: number | null;
    boardNote?: string;
    fans?: number | null;
    fansNote?: string;
    players?: number | null;
    size?: number;
  }>(),
  { board: null, boardNote: '', fans: null, fansNote: '', players: null, size: 64 }
);

const rings = computed(() =>
  [
    { id: 'board', label: 'Directiva', value: props.board, note: props.boardNote },
    { id: 'fans', label: 'Afición', value: props.fans, note: props.fansNote },
    {
      id: 'players',
      label: 'Jugadores',
      value: props.players,
      note: props.players === null ? '' : moraleLabel(props.players)
    }
  ].filter((ring): ring is { id: string; label: string; value: number; note: string } =>
    Number.isFinite(ring.value)
  )
);
</script>

<template>
  <ul v-if="rings.length > 0" class="flex items-start justify-around gap-3" aria-label="Confianza">
    <li v-for="ring in rings" :key="ring.id" class="flex flex-col items-center gap-0.5">
      <AppRing :value="ring.value" :label="ring.label" :size="size" />
      <span v-if="ring.note" class="text-xs text-tv-muted">{{ ring.note }}</span>
    </li>
  </ul>
</template>
