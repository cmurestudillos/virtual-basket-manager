<script setup lang="ts">
/**
 * La cabecera del partido, como el rótulo de una retransmisión: los dos
 * equipos con su escudo, el marcador en cifras de pabellón, el reloj, el
 * cuarto y los parciales. Los mandos van a la derecha, en la ranura.
 *
 * No sabe de dónde salen el marcador ni el reloj —directo, diferido o
 * repetición—: los recibe ya decididos, que es lo que permite que la cabecera
 * sea la misma en los tres casos.
 */
import { computed } from 'vue';
import type { PeriodScoreEntry } from '@shared/contracts/match.contract';
import type { CourtSide, Kit } from '@shared/domain/court';
import TeamBadge from './TeamBadge.vue';

const props = defineProps<{
  roundLabel: string;
  homeName: string;
  awayName: string;
  kits: Record<CourtSide, Kit>;
  homeNation: string | null;
  awayNation: string | null;
  managedSide: CourtSide | null;
  score: { home: number; away: number };
  /** «07:42», o vacío cuando no corre ningún cuarto. */
  clock: string;
  /** Cuarto que se juega o que se acaba de jugar; «PR» en la prórroga. */
  periodLabel: string;
  periods: readonly PeriodScoreEntry[];
  regulationPeriods: number;
  /** Lo que se lee debajo del reloj: «Descanso», «Final», «en pausa»… */
  status: string;
}>();

/** Siempre los cuatro cuartos a la vista, y las prórrogas si las hubo. */
const columns = computed(() => {
  const count = Math.max(props.regulationPeriods, props.periods.length);
  return Array.from({ length: count }, (_, index) => props.periods[index] ?? null);
});
</script>

<template>
  <header class="grid grid-cols-[14rem_1fr_auto_1fr_auto] items-stretch bg-tv-900 text-white">
    <!-- La competición, donde IBM pone el logo de la liga. -->
    <div
      class="flex flex-col justify-center gap-1 bg-white px-5 py-3 text-tv-ink [clip-path:polygon(0_0,100%_0,88%_100%,0_100%)]"
    >
      <slot name="corner" />
      <p class="pr-6 text-xs font-bold uppercase leading-tight tracking-wide text-tv-800">
        {{ roundLabel }}
      </p>
    </div>

    <div class="flex items-center justify-end gap-4 bg-gradient-to-r from-tv-900 to-tv-800 px-4">
      <p
        class="truncate text-right text-lg font-bold uppercase"
        :class="managedSide === 'home' ? 'text-tv-amber' : ''"
      >
        {{ homeName }}
      </p>
      <div class="rounded bg-white p-1">
        <TeamBadge :name="homeName" :kit="kits.home" :nation-of="homeNation" :size="56" />
      </div>
    </div>

    <!-- Marcador, reloj y parciales -->
    <div class="flex items-start gap-3 bg-tv-800 px-3 py-2">
      <div class="flex flex-col items-center gap-1">
        <span
          class="figure min-w-[4.5rem] border border-white/40 bg-black px-2 text-center text-4xl font-bold leading-[3.25rem] text-tv-amber"
        >
          {{ score.home }}
        </span>
        <span class="text-[0.65rem] font-semibold uppercase tracking-wide">Cuarto</span>
        <span
          class="figure border border-white/30 bg-black px-2 text-lg font-bold leading-6 text-tv-amber"
        >
          {{ periodLabel }}
        </span>
      </div>

      <div class="flex flex-col items-center gap-1">
        <span
          class="figure min-w-[6rem] border border-white/40 bg-black px-3 text-center text-3xl font-bold leading-[3.25rem] text-tv-amber"
          aria-label="Reloj"
        >
          {{ clock || '--:--' }}
        </span>
        <table class="figure text-sm" aria-label="Parciales">
          <tbody>
            <tr>
              <td
                v-for="(entry, index) in columns"
                :key="`h${index}`"
                class="w-8 border-b border-white/60 text-center"
              >
                {{ entry ? entry.home : '-' }}
              </td>
            </tr>
            <tr>
              <td v-for="(entry, index) in columns" :key="`a${index}`" class="w-8 text-center">
                {{ entry ? entry.away : '-' }}
              </td>
            </tr>
          </tbody>
        </table>
        <span class="text-[0.7rem] font-semibold uppercase tracking-wide text-white/80">
          {{ status }}
        </span>
      </div>

      <div class="flex flex-col items-center gap-1">
        <span
          class="figure min-w-[4.5rem] border border-white/40 bg-black px-2 text-center text-4xl font-bold leading-[3.25rem] text-tv-amber"
        >
          {{ score.away }}
        </span>
        <slot name="under-away" />
      </div>
    </div>

    <div class="flex items-center gap-4 bg-gradient-to-r from-tv-800 to-tv-900 px-4">
      <div class="rounded bg-white p-1">
        <TeamBadge :name="awayName" :kit="kits.away" :nation-of="awayNation" :size="56" />
      </div>
      <p
        class="truncate text-lg font-bold uppercase"
        :class="managedSide === 'away' ? 'text-tv-amber' : ''"
      >
        {{ awayName }}
      </p>
    </div>

    <div class="flex flex-col items-stretch justify-center gap-2 px-4 py-2">
      <slot name="actions" />
    </div>
  </header>
</template>
