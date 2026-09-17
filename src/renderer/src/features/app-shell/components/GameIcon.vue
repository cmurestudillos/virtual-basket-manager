<script lang="ts">
/**
 * Los iconos del marco. Dibujados aquí, a trazo y en blanco: se copia la
 * distribución de IBM, nunca sus iconos. Van en 24×24 con trazo de 2, así que
 * pegan con cualquier tamaño de letra y heredan el color de quien los pinta.
 */

/** Trazos de cada icono, en una rejilla de 24×24. */
const PATHS = {
  // Una casa: tejado a dos aguas y puerta.
  home: 'M3 11.5 L12 4 L21 11.5 M5.5 9.5 V20 H10 V14.5 H14 V20 H18.5 V9.5',
  // Un sobre.
  mail: 'M3 6 H21 V18 H3 Z M3 6.5 L12 13 L21 6.5',
  // Una camiseta de tirantes.
  team: 'M8 3 H10 C10.5 5.5 13.5 5.5 14 3 H16 C16 6 17 8 19 9 V21 H5 V9 C7 8 8 6 8 3 Z',
  // Una copa con asas.
  trophy:
    'M8 4 H16 V9.5 C16 12 14 13.5 12 13.5 C10 13.5 8 12 8 9.5 Z M8 6 H5 C5 9 6 10.5 8 10.5 M16 6 H19 C19 9 18 10.5 16 10.5 M12 13.5 V17 M8.5 20.5 H15.5 V17 H8.5 Z',
  // Dos flechas que se cruzan: lo que sale y lo que entra.
  market: 'M4 8 H19 M15 4 L19 8 L15 12 M20 16 H5 M9 12 L5 16 L9 20',
  // Una hoja de calendario con los días en puntos.
  calendar:
    'M4 5.5 H20 V20 H4 Z M4 9.5 H20 M8 3 V7 M16 3 V7 M8 13 H8.01 M12 13 H12.01 M16 13 H16.01 M8 16.5 H8.01 M12 16.5 H12.01 M16 16.5 H16.01',
  // Un busto con corbata: el entrenador.
  manager:
    'M12 4 A3.5 3.5 0 1 0 12.01 4 Z M4.5 21 C4.5 16 7.5 13.5 12 13.5 C16.5 13.5 19.5 16 19.5 21 M12 13.5 L10.8 15.5 L12 19.5 L13.2 15.5 Z',
  // Un edificio con columnas: la sede del club.
  club: 'M3 9 L12 4 L21 9 Z M5.5 9.5 V17.5 M10 9.5 V17.5 M14 9.5 V17.5 M18.5 9.5 V17.5 M4 17.5 H20 M3 20.5 H21',
  // Una bandera en su mástil.
  national: 'M5 21 V3 M5 4 H18 L15 8 L18 12 H5',
  // Una rueda dentada sencilla.
  settings:
    'M12 8.5 A3.5 3.5 0 1 0 12.01 8.5 Z M12 2.5 V5 M12 19 V21.5 M2.5 12 H5 M19 12 H21.5 M5.3 5.3 L7 7 M17 17 L18.7 18.7 M5.3 18.7 L7 17 M17 7 L18.7 5.3',
  // Una puerta con la flecha saliendo.
  exit: 'M13 3.5 H20 V20.5 H13 M10 8 L6 12 L10 16 M6 12 H16',
  // Una hoja de calendario con el día siguiente.
  day: 'M4 6 H20 V20 H4 Z M4 10 H20 M8 3.5 V7.5 M16 3.5 V7.5 M10 15 H15 M13 13 L15 15 L13 17'
} as const;

export type GameIconName = keyof typeof PATHS;
</script>

<script setup lang="ts">
withDefaults(defineProps<{ name: GameIconName; size?: number }>(), { size: 24 });
</script>

<template>
  <svg
    viewBox="0 0 24 24"
    :width="size"
    :height="size"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
    class="shrink-0"
  >
    <path :d="PATHS[name]" />
  </svg>
</template>
