<script setup lang="ts">
/**
 * El escudo de un equipo en la retransmisión.
 *
 * Los clubes no tienen escudo propio —el mundo es inventado y no hay imágenes—,
 * así que se dibuja uno con los colores de su equipación y sus iniciales. Sale
 * siempre igual para el mismo club porque la equipación sale de su id: el
 * jugador aprende a reconocer al rival por el color, como con un escudo de
 * verdad. Una selección lleva su bandera.
 */
import { computed } from 'vue';
import type { Kit } from '@shared/domain/court';
import { AppFlag } from '@renderer/shared/ui';

const props = withDefaults(
  defineProps<{ name: string; kit: Kit; nationOf?: string | null; size?: number }>(),
  { nationOf: null, size: 64 }
);

/** «Club Baloncesto Ciudad Norte» → «CN»: las dos palabras con más peso. */
const initials = computed(() => {
  const words = props.name
    .split(/\s+/)
    .filter((word) => word.length > 2 && !/^(club|baloncesto|basket|cb|bc|de|del)$/i.test(word));
  const source = words.length > 0 ? words : props.name.split(/\s+/);
  return source
    .slice(0, 2)
    .map((word) => word.charAt(0).toUpperCase())
    .join('');
});
</script>

<template>
  <div
    class="flex shrink-0 items-center justify-center"
    :style="{ width: `${size}px`, height: `${size}px` }"
  >
    <AppFlag v-if="nationOf" :code="nationOf" size="lg" />
    <svg
      v-else
      viewBox="0 0 64 72"
      class="h-full w-full"
      role="img"
      :aria-label="`Escudo de ${name}`"
    >
      <path
        d="M32 2 L60 10 V34 C60 52 47 64 32 70 C17 64 4 52 4 34 V10 Z"
        :fill="kit.shirt"
        stroke="#ffffff"
        stroke-width="3"
      />
      <path d="M32 8 L54 14 V20 H10 V14 Z" fill="rgba(255,255,255,0.18)" />
      <text
        x="32"
        y="44"
        text-anchor="middle"
        dominant-baseline="middle"
        font-size="22"
        font-weight="800"
        font-family="system-ui, sans-serif"
        :fill="kit.number"
      >
        {{ initials }}
      </text>
    </svg>
  </div>
</template>
