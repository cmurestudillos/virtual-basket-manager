<script setup lang="ts">
import { computed } from 'vue';
import { matchKits } from '@shared/domain/court';
import { formatShortDate } from '@renderer/shared/format';
import { AppFlag, TeamBadge } from '@renderer/shared/ui';

/**
 * Un partido en una línea, con el aspecto de la jornada del partido
 * (`RoundResultsView`): equipo, escudo en su caja blanca, los dos marcadores en
 * sus cajas, escudo y equipo. Tu partido, en azul pálido; el que gana, en
 * negrita.
 *
 * Jugado, el marcador lleva al acta; sin jugar, dice cuándo se juega. Es la
 * fila del calendario de la liga, de la Copa y de los grupos de selecciones.
 * `compact` la aprieta para las listas que van debajo de una tabla.
 */

export interface GameRowGame {
  gameId: string;
  homeTeamId: string;
  homeTeamName: string;
  awayTeamId: string;
  awayTeamName: string;
  homeScore: number | null;
  awayScore: number | null;
  played: boolean;
  involvesManaged: boolean;
  scheduledOn: number;
  overtimes?: number;
}

const props = withDefaults(
  defineProps<{
    game: GameRowGame;
    compact?: boolean;
    /** Para selecciones: la bandera en vez del escudo. */
    nationOf?: ((teamId: string) => string) | null;
  }>(),
  { compact: false, nationOf: null }
);

const homeWon = computed(
  () => props.game.played && (props.game.homeScore ?? 0) > (props.game.awayScore ?? 0)
);
const awayWon = computed(
  () => props.game.played && (props.game.awayScore ?? 0) > (props.game.homeScore ?? 0)
);

function kitOf(teamId: string) {
  return matchKits(teamId, '').home;
}

const badgeSize = computed(() => (props.compact ? 18 : 30));
const scoreBox = computed(() => [
  'figure flex items-center justify-center bg-tv-cell-strong font-semibold',
  props.compact ? 'py-0.5 text-sm' : 'py-1.5 text-xl'
]);
</script>

<template>
  <li
    class="grid items-center gap-[3px]"
    :class="[
      compact
        ? 'grid-cols-[minmax(0,1fr)_auto_2.5rem_2.5rem_auto_minmax(0,1fr)] text-xs'
        : 'grid-cols-[minmax(0,1fr)_auto_3.5rem_3.5rem_auto_minmax(0,1fr)] text-sm',
      game.involvesManaged ? 'bg-tv-select' : 'odd:bg-tv-cell'
    ]"
  >
    <span
      class="truncate px-3 text-right uppercase"
      :class="homeWon ? 'font-bold' : ''"
      :title="game.homeTeamName"
    >
      {{ game.homeTeamName }}
    </span>
    <span class="flex items-center justify-center self-stretch bg-white px-1.5">
      <AppFlag v-if="nationOf" :code="nationOf(game.homeTeamId)" :label="game.homeTeamName" />
      <TeamBadge v-else :name="game.homeTeamName" :kit="kitOf(game.homeTeamId)" :size="badgeSize" />
    </span>

    <RouterLink
      v-if="game.played"
      :to="{ name: 'match', params: { gameId: game.gameId } }"
      class="col-span-2 grid grid-cols-2 gap-[3px] hover:text-tv-blue-ink"
      :aria-label="`Acta: ${game.homeTeamName} ${game.homeScore}, ${game.awayTeamName} ${game.awayScore}`"
      :title="
        game.overtimes ? `Con ${game.overtimes} prórroga${game.overtimes > 1 ? 's' : ''}` : ''
      "
    >
      <span :class="scoreBox">{{ game.homeScore }}</span>
      <span :class="scoreBox">
        {{ game.awayScore }}
        <sup v-if="game.overtimes" class="ml-0.5 text-[0.6rem] font-bold text-tv-muted">PR</sup>
      </span>
    </RouterLink>
    <span v-else class="col-span-2 py-1 text-center text-xs text-tv-muted">
      {{ formatShortDate(game.scheduledOn) }}
    </span>

    <span class="flex items-center justify-center self-stretch bg-white px-1.5">
      <AppFlag v-if="nationOf" :code="nationOf(game.awayTeamId)" :label="game.awayTeamName" />
      <TeamBadge v-else :name="game.awayTeamName" :kit="kitOf(game.awayTeamId)" :size="badgeSize" />
    </span>
    <span
      class="truncate px-3 uppercase"
      :class="awayWon ? 'font-bold' : ''"
      :title="game.awayTeamName"
    >
      {{ game.awayTeamName }}
    </span>
  </li>
</template>
