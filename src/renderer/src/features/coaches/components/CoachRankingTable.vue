<script setup lang="ts">
import { computed } from 'vue';
import type { CoachRankingRow } from '@shared/contracts/coaches.contract';
import { matchKits } from '@shared/domain/court';
import { toStars } from '@shared/domain/stars';
import { formatPoints } from '@renderer/shared/format';
import { AppStars, TONE_TEXT, TeamBadge } from '@renderer/shared/ui';
import CoachLink from './CoachLink.vue';

/**
 * Filas del ranking de entrenadores, como la tabla RANKING ENTRENADORES de IBM
 * (130718): puesto, entrenador, club, reputación en estrellas y puntos.
 *
 * Sirve para el ranking entero (con edad, victorias y derrotas del curso y
 * títulos) y, con `compact`, para el top 5 de la ficha. La fila del usuario va
 * en azul pálido; si no sale entre las filas, `pinned` la pone debajo, separada
 * por un hueco, que es como IBM la deja a la vista aunque sea la 161. En un
 * panel con desplazamiento se queda pegada abajo, como el rótulo arriba.
 *
 * Los puntos son los de este curso enteros y la mitad de los del anterior: el
 * desglose sale al pasar por encima de la cifra.
 */

const props = withDefaults(
  defineProps<{
    rows: readonly CoachRankingRow[];
    /** La fila del usuario, que se pone debajo si no está entre las de arriba. */
    pinned?: CoachRankingRow | null;
    /** Sólo puesto, entrenador, club, reputación y puntos. */
    compact?: boolean;
    /** Un entrenador que resaltar (el de la ficha abierta), en azul pálido. */
    highlight?: string | null;
  }>(),
  { pinned: null, compact: false, highlight: null }
);

/** Las filas y, si no está entre ellas, la del usuario aparte. */
const groups = computed(() => {
  const pinned = props.pinned;
  const apart = pinned && !props.rows.some((row) => row.coachId === pinned.coachId);
  return [{ id: 'rows', rows: props.rows }, ...(apart ? [{ id: 'pinned', rows: [pinned] }] : [])];
});

const columns = computed(() => (props.compact ? 5 : 8));

const kitOf = (teamId: string) => matchKits(teamId, '').home;

function rowClass(row: CoachRankingRow): string {
  if (row.isManager) return 'is-mine';
  return row.coachId === props.highlight ? 'is-selected' : '';
}

function pointsTitle(row: CoachRankingRow): string {
  return `Este curso: ${formatPoints(row.currentPoints)} · Curso anterior: ${formatPoints(row.previousPoints)} (cuenta la mitad)`;
}
</script>

<template>
  <table class="data-table">
    <thead>
      <tr>
        <th class="numeric w-14">Puesto</th>
        <th>Entrenador</th>
        <th v-if="!compact" class="numeric">Edad</th>
        <th>Club</th>
        <th>Reputación</th>
        <th v-if="!compact" class="numeric" title="Victorias y derrotas de este curso">V-D</th>
        <th v-if="!compact" class="numeric">Títulos</th>
        <th class="numeric">Puntos</th>
      </tr>
    </thead>
    <!-- La fila del usuario, fuera de la página, va en su propio cuerpo: un hueco de papel y ella. -->
    <tbody
      v-for="group in groups"
      :key="group.id"
      :class="group.id === 'pinned' ? 'sticky bottom-0 z-[1]' : ''"
    >
      <tr v-if="group.id === 'pinned'" aria-hidden="true">
        <td :colspan="columns" class="h-2 bg-tv-paper p-0"></td>
      </tr>
      <tr v-for="row in group.rows" :key="row.coachId" :class="rowClass(row)">
        <td class="numeric font-bold">{{ row.rank }}</td>
        <td class="max-w-56">
          <CoachLink
            :id="row.coachId"
            :name="row.name"
            :nationality="row.nationality"
            :is-manager="row.isManager"
          />
        </td>
        <td v-if="!compact" class="numeric">{{ row.age ?? '-' }}</td>
        <td class="max-w-56">
          <span v-if="row.teamId && row.teamName" class="flex min-w-0 items-center gap-2">
            <TeamBadge :name="row.teamName" :kit="kitOf(row.teamId)" :size="20" />
            <RouterLink
              :to="{ name: 'team-profile', params: { teamId: row.teamId } }"
              class="min-w-0 truncate hover:text-tv-blue-ink hover:underline"
              :title="
                row.competitionName ? `${row.teamName} · ${row.competitionName}` : row.teamName
              "
            >
              {{ row.teamName }}
            </RouterLink>
          </span>
          <span v-else :class="TONE_TEXT.neutral">Libre</span>
        </td>
        <td class="py-0.5" :title="`Reputación ${row.reputation}`">
          <AppStars :value="toStars(row.reputation)" label="Reputación" :size="12" />
        </td>
        <td v-if="!compact" class="numeric">
          {{ row.seasonWins }}-{{ row.seasonGames - row.seasonWins }}
        </td>
        <td v-if="!compact" class="numeric">{{ row.titles }}</td>
        <td class="numeric is-key font-bold" :title="pointsTitle(row)">
          {{ formatPoints(row.points) }}
        </td>
      </tr>
    </tbody>
  </table>
</template>
