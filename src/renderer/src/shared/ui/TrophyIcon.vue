<script setup lang="ts">
/**
 * El trofeo plano: una copa genérica dibujada en SVG y pintada del metal que
 * toque (oro, plata, bronce o platino).
 *
 * Es el respaldo de la copa en 3D (`TrophyThumbnail`) cuando el equipo no
 * puede dibujar en WebGL, y el trofeo de la guía de estilo. Nació en el
 * historial, donde se coloreaba por tipo de competición; desde los trofeos
 * (2026-09-29) el color es el metal, el mismo que la copa en 3D.
 *
 * Va sobre papel y sobre el marco oscuro: el trazo hondo del metal lo despega
 * de los dos fondos. Relleno y trazo escritos enteros, que Tailwind sólo
 * genera las clases que ve.
 */
import type { TrophyMetal } from '@shared/domain/trophies';

withDefaults(defineProps<{ metal?: TrophyMetal; size?: number; label?: string }>(), {
  metal: 'gold',
  size: 48,
  label: ''
});

/** El cuerpo: relleno del metal y trazo hondo. */
const METAL_CLASS: Record<TrophyMetal, string> = {
  gold: 'fill-tv-metal-gold stroke-tv-metal-gold-deep',
  silver: 'fill-tv-metal-silver stroke-tv-metal-silver-deep',
  bronze: 'fill-tv-metal-bronze stroke-tv-metal-bronze-deep',
  platinum: 'fill-tv-metal-platinum stroke-tv-metal-platinum-deep'
};

/** Las asas son sólo trazo: el metal encima de su sombra, para que se vean en cualquier fondo. */
const HANDLE_CLASS: Record<TrophyMetal, string> = {
  gold: 'stroke-tv-metal-gold',
  silver: 'stroke-tv-metal-silver',
  bronze: 'stroke-tv-metal-bronze',
  platinum: 'stroke-tv-metal-platinum'
};
</script>

<template>
  <svg
    viewBox="0 0 48 56"
    :width="size"
    :height="size"
    class="shrink-0"
    :role="label ? 'img' : undefined"
    :aria-label="label || undefined"
    :aria-hidden="label ? undefined : 'true'"
    :data-metal="metal"
  >
    <g :class="METAL_CLASS[metal]" stroke-linejoin="round">
      <path stroke-width="1.5" d="M12 4 H36 V16 C36 26 31 32 24 32 C17 32 12 26 12 16 Z" />
      <path stroke-width="1.5" d="M21 31 H27 V42 H21 Z" />
      <path stroke-width="1.5" d="M13 42 H35 V50 H13 Z" />
      <path class="fill-none" stroke-width="4.5" d="M12 8 H6 V13 C6 19 9 22 13 23" />
      <path class="fill-none" stroke-width="4.5" d="M36 8 H42 V13 C42 19 39 22 35 23" />
    </g>
    <g class="fill-none" :class="HANDLE_CLASS[metal]" stroke-width="2">
      <path d="M12 8 H6 V13 C6 19 9 22 13 23" />
      <path d="M36 8 H42 V13 C42 19 39 22 35 23" />
    </g>
  </svg>
</template>
