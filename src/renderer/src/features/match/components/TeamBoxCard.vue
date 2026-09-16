<script setup lang="ts">
/**
 * El acta corta de un equipo, la de la pestaña «Resumen»: los cinco titulares
 * arriba con su puesto, el banquillo debajo numerado, y sólo las cuatro cifras
 * que se miran durante un partido — puntos, rebotes, asistencias y valoración.
 * El acta entera está en «Estadísticas».
 *
 * Debajo va el jugador del partido de ese equipo: el de más valoración hasta
 * ahora. Es lo primero que se busca en un descanso.
 */
import { computed } from 'vue';
import type { BoxScoreLine } from '@shared/contracts/match.contract';
import { shirtNumbers } from '@shared/domain/court';
import { POSITION_ABBREVIATIONS, POSITION_LABELS } from '@shared/domain/positions';
import { AppAvatar, AppFlag } from '@renderer/shared/ui';
import BroadcastPanel from './BroadcastPanel.vue';

const props = defineProps<{
  lines: readonly BoxScoreLine[];
  /** Si es el equipo del usuario: sus nombres enlazan a la ficha. */
  managed: boolean;
}>();

const STARTERS = 5;

const numbers = computed(() => shirtNumbers(props.lines.map((line) => line.playerId)));
const starters = computed(() => props.lines.slice(0, STARTERS));
const bench = computed(() => props.lines.slice(STARTERS));

function rebounds(line: BoxScoreLine): number {
  return line.offensiveRebounds + line.defensiveRebounds;
}

/** El mejor del equipo hasta ahora; sin minutos jugados todavía no hay ninguno. */
const featured = computed(() => {
  const played = props.lines.filter((line) => line.secondsPlayed > 0);
  return [...played].sort((a, b) => b.efficiency - a.efficiency || b.points - a.points)[0] ?? null;
});
</script>

<template>
  <div class="flex min-w-0 flex-col gap-3">
    <BroadcastPanel flush>
      <template #header>
        <span class="grid w-full grid-cols-[2.25rem_2.25rem_1fr_repeat(4,2.75rem)] gap-1 text-xs">
          <span></span>
          <span class="text-center">Nº</span>
          <span class="text-center">Jugadores</span>
          <span class="text-center">Pts</span>
          <span class="text-center">Reb</span>
          <span class="text-center">Asi</span>
          <span class="text-center">Val</span>
        </span>
      </template>

      <ul class="flex flex-col gap-1 p-2 text-sm">
        <template v-for="(line, index) in lines" :key="line.playerId">
          <li
            v-if="index === STARTERS"
            aria-hidden="true"
            class="mx-12 my-1 border-t border-tv-muted/50"
          ></li>
          <li
            class="grid grid-cols-[2.25rem_2.25rem_1fr_repeat(4,2.75rem)] items-center gap-1"
            :class="line.secondsPlayed === 0 && index >= STARTERS ? 'opacity-60' : ''"
          >
            <span
              class="mx-auto flex h-6 min-w-7 items-center justify-center rounded px-1 text-xs font-bold text-white"
              :class="index < STARTERS ? 'bg-tv-blue' : 'bg-tv-800'"
              :title="index < STARTERS ? POSITION_LABELS[line.position] : undefined"
            >
              {{ index < STARTERS ? POSITION_ABBREVIATIONS[line.position] : index + 1 }}
            </span>
            <span class="figure text-center text-tv-muted">{{ numbers.get(line.playerId) }}</span>
            <span class="flex min-w-0 items-center gap-2 bg-tv-cell px-2 py-1">
              <AppFlag :code="line.nationality" />
              <RouterLink
                v-if="managed"
                :to="{ name: 'player', params: { playerId: line.playerId } }"
                class="truncate hover:text-tv-blue"
              >
                {{ line.playerName }}
              </RouterLink>
              <span v-else class="truncate">{{ line.playerName }}</span>
            </span>
            <span class="figure bg-tv-cell py-1 text-center font-semibold">{{ line.points }}</span>
            <span class="figure bg-tv-cell py-1 text-center">{{ rebounds(line) }}</span>
            <span class="figure bg-tv-cell py-1 text-center">{{ line.assists }}</span>
            <span class="figure bg-tv-cell py-1 text-center">{{ line.efficiency }}</span>
          </li>
        </template>
      </ul>
      <p v-if="starters.length === 0 && bench.length === 0" class="p-4 text-center text-sm">
        Sin convocados.
      </p>
    </BroadcastPanel>

    <!-- El jugador del partido de este equipo. -->
    <section
      class="grid grid-cols-[7rem_1fr] overflow-hidden bg-tv-paper text-tv-ink shadow-lg shadow-black/40"
    >
      <div class="flex items-end justify-center bg-tv-cell pt-2">
        <AppAvatar
          v-if="featured"
          kind="player"
          :seed="featured.playerId"
          :name="featured.playerName"
          :size="88"
        />
        <span v-else class="mb-3 text-4xl text-tv-muted" aria-hidden="true">●</span>
      </div>
      <div class="flex flex-col">
        <p
          class="truncate bg-tv-800 px-3 py-1.5 text-center text-sm font-semibold uppercase text-white"
        >
          {{ featured?.playerName ?? 'Jugador del partido' }}
        </p>
        <dl class="grid flex-1 grid-cols-4 gap-2 p-2 text-center">
          <div v-for="stat in ['Pts', 'Reb', 'Asi', 'Val']" :key="stat" class="flex flex-col gap-1">
            <dt class="text-xs font-semibold uppercase">{{ stat }}</dt>
            <dd class="figure bg-tv-cell py-2 text-xl font-bold">
              <template v-if="!featured">0</template>
              <template v-else-if="stat === 'Pts'">{{ featured.points }}</template>
              <template v-else-if="stat === 'Reb'">{{ rebounds(featured) }}</template>
              <template v-else-if="stat === 'Asi'">{{ featured.assists }}</template>
              <template v-else>{{ featured.efficiency }}</template>
            </dd>
          </div>
        </dl>
      </div>
    </section>
  </div>
</template>
