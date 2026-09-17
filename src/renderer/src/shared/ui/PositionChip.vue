<script setup lang="ts">
import { POSITION_ABBREVIATIONS, POSITION_LABELS, type Position } from '@shared/domain/positions';

/**
 * El puesto de un jugador en su chip: B, E, A, AP o P, en el cuadradito cian de
 * IBM. Las siglas son las del acta de la retransmisión y salen del dominio; el
 * nombre entero va en el `title`, para quien no se las sepa todavía.
 *
 * Se lee sobre papel y sobre el marco. Es una de las dos piezas con esquinas
 * (3 px): así no se confunde con una celda.
 */

withDefaults(defineProps<{ position: Position; size?: 'sm' | 'md' }>(), { size: 'sm' });
</script>

<template>
  <abbr
    class="inline-flex items-center justify-center rounded-[3px] bg-tv-cyan font-bold text-white no-underline"
    :class="size === 'md' ? 'h-7 min-w-8 px-1.5 text-sm' : 'h-5 min-w-6 px-1 text-xs'"
    :title="POSITION_LABELS[position]"
  >
    {{ POSITION_ABBREVIATIONS[position] }}
  </abbr>
</template>
