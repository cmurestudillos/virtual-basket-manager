<script setup lang="ts">
import { computed } from 'vue';
import type { StandingEntry } from '@shared/contracts/season.contract';
import { matchKits } from '@shared/domain/court';
import { AppFlag, TONE_TEXT, TeamBadge, toneForDelta } from '@renderer/shared/ui';
import { zoneCellClass, zonesIn } from '@renderer/features/competition/standing-zones';

/**
 * Una clasificación con la rejilla de IBM: puesto con la barra de zona, escudo
 * en su caja blanca, equipo y cifras. Tu equipo, en azul pálido.
 *
 * La usan la liga, la fase de liga continental y los grupos de selecciones.
 * `full` añade puntos a favor y en contra y la racha, que en una tabla de
 * cuatro selecciones sólo estorban; `division`, la división de la liga
 * americana. `nationOf` pinta la bandera en vez del escudo.
 *
 * El nombre y el escudo de un club abren su ficha; los de una selección, no.
 */

const props = withDefaults(
  defineProps<{
    rows: readonly StandingEntry[];
    full?: boolean;
    division?: boolean;
    nationOf?: ((teamId: string) => string) | null;
  }>(),
  { full: false, division: false, nationOf: null }
);

const zones = computed(() => zonesIn(props.rows));

function kitOf(teamId: string) {
  return matchKits(teamId, '').home;
}

function streakLabel(streak: number): string {
  if (streak === 0) return '-';
  return `${streak > 0 ? 'V' : 'D'}${Math.abs(streak)}`;
}
</script>

<template>
  <table class="data-table">
    <thead>
      <tr>
        <th class="numeric">Pos</th>
        <th class="w-9">
          <span class="sr-only">{{ nationOf ? 'Bandera' : 'Escudo' }}</span>
        </th>
        <th>{{ nationOf ? 'Selección' : 'Equipo' }}</th>
        <th v-if="division">División</th>
        <th class="numeric">PJ</th>
        <th class="numeric">PG</th>
        <th class="numeric">PP</th>
        <th v-if="full" class="numeric">PF</th>
        <th v-if="full" class="numeric">PC</th>
        <th class="numeric">Dif</th>
        <th v-if="full" class="numeric">Racha</th>
      </tr>
    </thead>
    <tbody>
      <tr v-for="row in rows" :key="row.teamId" :class="row.isManaged ? 'is-mine' : ''">
        <td class="numeric w-12" :class="zoneCellClass(row.zone, zones)">
          {{ row.conferenceRank ?? row.position }}
        </td>
        <td v-if="nationOf" class="text-center">
          <AppFlag :code="nationOf(row.teamId)" :label="row.teamName" size="md" />
        </td>
        <td v-else class="py-0.5">
          <!-- El escudo también abre la ficha, pero el enlace del teclado es el nombre. -->
          <RouterLink
            :to="{ name: 'team-profile', params: { teamId: row.teamId } }"
            class="flex justify-center bg-white p-0.5"
            tabindex="-1"
            aria-hidden="true"
          >
            <TeamBadge :name="row.teamName" :kit="kitOf(row.teamId)" :size="22" />
          </RouterLink>
        </td>
        <td class="max-w-64 truncate" :title="row.teamName">
          <!-- Las selecciones no tienen ficha de club: su nombre va sin enlace. -->
          <span v-if="nationOf">{{ row.teamName }}</span>
          <RouterLink
            v-else
            :to="{ name: 'team-profile', params: { teamId: row.teamId } }"
            class="hover:text-tv-blue-ink hover:underline"
          >
            {{ row.teamName }}
          </RouterLink>
        </td>
        <td v-if="division" class="text-tv-muted">{{ row.division }}</td>
        <td class="numeric">{{ row.played }}</td>
        <td class="numeric is-key font-bold">{{ row.won }}</td>
        <td class="numeric">{{ row.lost }}</td>
        <td v-if="full" class="numeric">{{ row.pointsFor }}</td>
        <td v-if="full" class="numeric">{{ row.pointsAgainst }}</td>
        <td class="numeric" :class="TONE_TEXT[toneForDelta(row.pointsDifference)]">
          {{ row.pointsDifference > 0 ? '+' : '' }}{{ row.pointsDifference }}
        </td>
        <td v-if="full" class="numeric">{{ streakLabel(row.streak) }}</td>
      </tr>
    </tbody>
  </table>
</template>
