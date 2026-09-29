<script setup lang="ts">
/**
 * Un día del calendario mensual, como la casilla de IBM (130405): el escudo del
 * rival a la izquierda y, a la derecha, la franja del color de la competición
 * con el número del día y la «V» o la «D» si ya se jugó.
 *
 * Sin partido, la casilla gris con el número y lo que pasa ese día (nóminas,
 * mercado, selecciones, temporada) en etiquetas de su color con su icono, a
 * todo el ancho: la primera al lado del número y la segunda debajo, para que
 * quepan dos en 1280×720. Con partido no cabe el texto: van en cuadraditos del
 * mismo color abajo a la izquierda. Hoy lleva el borde cian y el día elegido,
 * el azul pálido de lo tuyo.
 *
 * Va sobre papel. Es un botón: pulsarlo lleva el día al panel de la derecha.
 */
import { computed } from 'vue';
import type { CalendarDayEvent, CalendarGame } from '@shared/contracts/calendar.contract';
import { COMPETITION_KIND_LABEL } from '@shared/domain/competition-kind';
import { matchKits } from '@shared/domain/court';
import { COMPETITION_BAND, ResultBlock, TeamBadge } from '@renderer/shared/ui';
import GameIcon from '@renderer/features/app-shell/components/GameIcon.vue';
import {
  CALENDAR_EVENT_FILL,
  CALENDAR_EVENT_GROUP,
  CALENDAR_EVENT_ICON,
  type CalendarEventGroup
} from '../calendar-event-style';

const props = defineProps<{
  day: number;
  game: CalendarGame | null;
  events: readonly CalendarDayEvent[];
  isToday: boolean;
  isPast: boolean;
  selected: boolean;
}>();

defineEmits<{ select: [] }>();

interface Tag {
  short: string;
  group: CalendarEventGroup;
}

/** Las citas del día sin repetir: «Mercado» abre y cierra, pero se escribe una vez. */
const tags = computed<Tag[]>(() => {
  const seen = new Map<string, Tag>();
  for (const event of props.events) {
    if (!seen.has(event.short)) {
      seen.set(event.short, { short: event.short, group: CALENDAR_EVENT_GROUP[event.kind] });
    }
  }
  return [...seen.values()];
});

/** Con partido, un cuadradito por color: dos citas del mercado son una marca. */
const marks = computed(() => [...new Set(tags.value.map((tag) => tag.group))]);

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
    class="relative min-h-0 overflow-hidden text-left transition-colors"
    :class="[
      game ? 'grid grid-cols-[minmax(0,1fr)_2.25rem]' : 'flex flex-col gap-[3px] p-1',
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
    <template v-if="game">
      <span class="flex min-h-0 min-w-0 flex-col items-center justify-center p-1">
        <TeamBadge
          :name="game.rival.name"
          :kit="matchKits(game.rival.teamId, '').home"
          :nation-of="game.rival.nationOf"
          :size="34"
        />
      </span>

      <span class="flex flex-col items-center gap-1 pt-1" :class="COMPETITION_BAND[game.kind]">
        <span class="figure text-sm font-bold">{{ day }}</span>
        <ResultBlock v-if="game.played && game.won !== null" :won="game.won" size="sm" />
      </span>

      <!-- Con partido, las citas del día en cuadraditos de su color: no cabe el texto. -->
      <span
        v-if="marks.length > 0"
        class="absolute bottom-1 left-1 flex gap-[3px]"
        aria-hidden="true"
      >
        <span
          v-for="group in marks.slice(0, 3)"
          :key="group"
          class="h-2.5 w-2.5 outline-1 outline-white"
          :class="CALENDAR_EVENT_FILL[group]"
        ></span>
      </span>
    </template>

    <template v-else>
      <span class="flex min-w-0 items-start gap-1">
        <span
          v-if="tags[0]"
          class="flex min-w-0 flex-1 items-center gap-1 px-1 text-xs font-bold leading-5"
          :class="CALENDAR_EVENT_FILL[tags[0].group]"
        >
          <GameIcon :name="CALENDAR_EVENT_ICON[tags[0].group]" :size="13" />
          <span class="truncate">{{ tags[0].short }}</span>
        </span>
        <span class="figure ml-auto pr-0.5 text-sm font-bold leading-5 text-tv-muted">
          {{ day }}
        </span>
      </span>
      <span
        v-if="tags[1]"
        class="flex min-w-0 items-center gap-1 px-1 text-xs font-bold leading-5"
        :class="CALENDAR_EVENT_FILL[tags[1].group]"
      >
        <GameIcon :name="CALENDAR_EVENT_ICON[tags[1].group]" :size="13" />
        <span class="truncate">{{ tags[1].short }}</span>
      </span>
    </template>
  </button>
</template>
