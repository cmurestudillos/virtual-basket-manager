<script setup lang="ts">
/**
 * Los dos equipos cara a cara, estadística a estadística: el centro de la
 * pestaña «Resumen». Los tiros van con aciertos, intentos y porcentaje porque
 * «19/39 (48%)» cuenta el partido mejor que cualquiera de las tres cifras solas.
 */
import { computed } from 'vue';
import type { BoxScoreLine } from '@shared/contracts/match.contract';
import { percentage } from '@shared/domain/box-score';
import { AppPanel } from '@renderer/shared/ui';

const props = defineProps<{
  home: readonly BoxScoreLine[];
  away: readonly BoxScoreLine[];
  homeScore: number;
  awayScore: number;
}>();

type Key = keyof BoxScoreLine;

function sum(lines: readonly BoxScoreLine[], key: Key): number {
  return lines.reduce((total, line) => total + (line[key] as number), 0);
}

function shots(lines: readonly BoxScoreLine[], made: Key, attempted: Key): string {
  const m = sum(lines, made);
  const a = sum(lines, attempted);
  return `${m}/${a} (${Math.round(percentage(m, a))}%)`;
}

const rows = computed(() => {
  const row = (label: string, of: (lines: readonly BoxScoreLine[]) => string | number) => ({
    label,
    home: of(props.home),
    away: of(props.away)
  });
  return [
    { label: 'Puntos', home: props.homeScore, away: props.awayScore },
    row('Tiros de 2', (lines) => shots(lines, 'twoPointMade', 'twoPointAttempted')),
    row('Tiros de 3', (lines) => shots(lines, 'threePointMade', 'threePointAttempted')),
    row('Tiros libres', (lines) => shots(lines, 'freeThrowMade', 'freeThrowAttempted')),
    row('Rebotes', (lines) => sum(lines, 'offensiveRebounds') + sum(lines, 'defensiveRebounds')),
    row('Asistencias', (lines) => sum(lines, 'assists')),
    row('Recuperaciones', (lines) => sum(lines, 'steals')),
    row('Pérdidas', (lines) => sum(lines, 'turnovers')),
    row('Tapones', (lines) => sum(lines, 'blocks')),
    row('Faltas personales', (lines) => sum(lines, 'fouls')),
    row('Valoración', (lines) => sum(lines, 'efficiency'))
  ];
});
</script>

<template>
  <AppPanel flush>
    <template #header>
      <span class="grid w-full grid-cols-[1fr_1.4fr_1fr] text-center text-xs">
        <span>Local</span>
        <span>Estadística</span>
        <span>Visitante</span>
      </span>
    </template>
    <table class="w-full text-sm" aria-label="Comparativa de equipos">
      <tbody>
        <tr v-for="entry in rows" :key="entry.label" class="odd:bg-tv-cell">
          <td class="figure w-1/3 py-1 text-center">{{ entry.home }}</td>
          <th scope="row" class="py-1 text-center font-semibold">{{ entry.label }}</th>
          <td class="figure w-1/3 py-1 text-center">{{ entry.away }}</td>
        </tr>
      </tbody>
    </table>
  </AppPanel>
</template>
