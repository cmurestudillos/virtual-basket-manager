<script setup lang="ts">
/**
 * Un día del calendario mensual, como la casilla de IBM (130405): el escudo del
 * rival a la izquierda y, a la derecha, la franja del color de la competición
 * con el número del día y la «V» o la «D» si ya se jugó.
 *
 * Sin partido, la casilla gris con el número y lo que pasa ese día en pequeño
 * (nóminas, mercado, selecciones); con partido, eso mismo va en puntos, que no
 * cabe más. Hoy lleva el borde cian y el día elegido, el azul pálido de lo tuyo.
 *
 * Va sobre papel. Es un botón: pulsarlo lleva el día al panel de la derecha.
 */
import { computed } from 'vue';
import type { CalendarDayEvent, CalendarGame } from '@shared/contracts/calendar.contract';
import { COMPETITION_KIND_LABEL } from '@shared/domain/competition-kind';
import { matchKits } from '@shared/domain/court';
import {
  COMPETITION_BAND,
  ResultBlock,
  TONE_CHIP,
  TONE_FILL,
  TeamBadge
} from '@renderer/shared/ui';

const props = defineProps<{
  day: number;
  game: CalendarGame | null;
  events: readonly CalendarDayEvent[];
  isToday: boolean;
  isPast: boolean;
  selected: boolean;
}>();

defineEmits<{ select: [] }>();

/** Las citas del día sin repetir: «Mercado» abre y cierra, pero se escribe una vez. */
const shorts = computed(() => [...new Set(props.events.map((event) => event.short))]);

const spoken = computed(() =>
  [
    `Día ${props.day}`,
    props.game
      ? `${COMPETITION_KIND_LABEL[props.game.kind]}: ${props.game.side === 'home' ? 'contra' : 'en casa de'} ${props.game.rival.name}`
      : '',
    props.game?.played ? (props.game.won ? 'victoria' : 'derrota') : '',
    ...props.events.map((event) => event.label)
  ]
    .filter(Boolean)
    .join('. ')
);
</script>

<template>
  <button
    type="button"
    class="relative grid min-h-0 grid-cols-[minmax(0,1fr)_2.25rem] overflow-hidden text-left transition-colors"
    :class="[
      selected
        ? 'bg-tv-select'
        : isPast
          ? 'bg-tv-cell-strong hover:bg-tv-box'
          : 'bg-tv-cell hover:bg-tv-cell-strong',
      isToday ? 'outline-2 -outline-offset-2 outline-tv-cyan' : ''
    ]"
    :aria-label="spoken"
    :aria-pressed="selected"
    :aria-current="isToday ? 'date' : undefined"
    @click="$emit('select')"
  >
    <span class="flex min-h-0 min-w-0 flex-col items-center justify-center gap-0.5 p-1">
      <TeamBadge
        v-if="game"
        :name="game.rival.name"
        :kit="matchKits(game.rival.teamId, '').home"
        :nation-of="game.rival.nationOf"
        :size="34"
      />
      <template v-else>
        <span
          v-for="short in shorts.slice(0, 2)"
          :key="short"
          class="max-w-full truncate rounded-[3px] px-1 text-[10px] font-bold leading-4"
          :class="TONE_CHIP.neutral"
        >
          {{ short }}
        </span>
      </template>
    </span>

    <span
      class="flex flex-col items-center gap-1 pt-1"
      :class="game ? COMPETITION_BAND[game.kind] : ''"
    >
      <span class="figure text-sm font-bold" :class="game ? '' : 'text-tv-muted'">{{ day }}</span>
      <ResultBlock v-if="game?.played && game.won !== null" :won="game.won" size="sm" />
    </span>

    <!-- Con partido, las citas del día en puntos: no cabe el texto. -->
    <span
      v-if="game && events.length > 0"
      class="absolute bottom-1 left-1 flex gap-0.5"
      aria-hidden="true"
    >
      <span
        v-for="event in events.slice(0, 3)"
        :key="event.kind"
        class="h-1.5 w-1.5"
        :class="TONE_FILL.accent"
      ></span>
    </span>
  </button>
</template>
