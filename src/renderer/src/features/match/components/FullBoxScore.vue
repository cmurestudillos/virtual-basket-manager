<script setup lang="ts">
/**
 * El acta entera de un equipo: la pestaña «Estadísticas». Todo lo que el
 * resumen se calla —minutos, tiros por tipo, robos, tapones, pérdidas, faltas
 * y el más/menos— con los totales del equipo al pie.
 */
import { computed } from 'vue';
import type { BoxScoreLine } from '@shared/contracts/match.contract';
import { POSITION_ABBREVIATIONS } from '@shared/domain/positions';
import { formatPlayedMinutes } from '@renderer/shared/format';
import { AppFlag, AppPanel } from '@renderer/shared/ui';

const props = defineProps<{
  teamName: string;
  lines: readonly BoxScoreLine[];
  managed: boolean;
}>();

type NumericKey = {
  [K in keyof BoxScoreLine]: BoxScoreLine[K] extends number ? K : never;
}[keyof BoxScoreLine];

function total(key: NumericKey): number {
  return props.lines.reduce((sum, line) => sum + line[key], 0);
}

const totals = computed(() => ({
  fieldGoals: `${total('twoPointMade') + total('threePointMade')}/${total('twoPointAttempted') + total('threePointAttempted')}`,
  threes: `${total('threePointMade')}/${total('threePointAttempted')}`,
  freeThrows: `${total('freeThrowMade')}/${total('freeThrowAttempted')}`
}));

function fieldGoals(line: BoxScoreLine): string {
  return `${line.twoPointMade + line.threePointMade}/${line.twoPointAttempted + line.threePointAttempted}`;
}
</script>

<template>
  <AppPanel :title="teamName" flush>
    <div class="overflow-x-auto">
      <table class="w-full text-sm">
        <thead class="bg-tv-cell text-xs uppercase text-tv-muted">
          <tr>
            <th class="px-2 py-1.5 text-left">Jugador</th>
            <th class="px-1.5 text-right">Min</th>
            <th class="px-1.5 text-right">Pts</th>
            <th class="px-1.5 text-right">TC</th>
            <th class="px-1.5 text-right">T3</th>
            <th class="px-1.5 text-right">TL</th>
            <th class="px-1.5 text-right">RO</th>
            <th class="px-1.5 text-right">RD</th>
            <th class="px-1.5 text-right">As</th>
            <th class="px-1.5 text-right">Rec</th>
            <th class="px-1.5 text-right">Tap</th>
            <th class="px-1.5 text-right">Pér</th>
            <th class="px-1.5 text-right">F</th>
            <th class="px-1.5 text-right">+/-</th>
            <th class="px-2 text-right">Val</th>
          </tr>
        </thead>
        <tbody class="figure">
          <tr
            v-for="line in lines"
            :key="line.playerId"
            class="border-t border-tv-cell"
            :class="line.secondsPlayed === 0 ? 'text-tv-muted' : ''"
          >
            <td class="px-2 py-1">
              <span class="inline-flex min-w-0 items-center gap-1.5">
                <span class="w-6 text-xs font-bold text-tv-blue">
                  {{ POSITION_ABBREVIATIONS[line.position] }}
                </span>
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
            </td>
            <td class="px-1.5 text-right">{{ formatPlayedMinutes(line.secondsPlayed) }}</td>
            <td class="px-1.5 text-right font-bold">{{ line.points }}</td>
            <td class="px-1.5 text-right">{{ fieldGoals(line) }}</td>
            <td class="px-1.5 text-right">
              {{ line.threePointMade }}/{{ line.threePointAttempted }}
            </td>
            <td class="px-1.5 text-right">
              {{ line.freeThrowMade }}/{{ line.freeThrowAttempted }}
            </td>
            <td class="px-1.5 text-right">{{ line.offensiveRebounds }}</td>
            <td class="px-1.5 text-right">{{ line.defensiveRebounds }}</td>
            <td class="px-1.5 text-right">{{ line.assists }}</td>
            <td class="px-1.5 text-right">{{ line.steals }}</td>
            <td class="px-1.5 text-right">{{ line.blocks }}</td>
            <td class="px-1.5 text-right">{{ line.turnovers }}</td>
            <td class="px-1.5 text-right">{{ line.fouls }}</td>
            <td class="px-1.5 text-right">
              {{ line.plusMinus > 0 ? `+${line.plusMinus}` : line.plusMinus }}
            </td>
            <td
              class="px-2 text-right font-semibold"
              :class="
                line.efficiency >= 15 ? 'text-tv-green' : line.efficiency < 0 ? 'text-tv-red' : ''
              "
            >
              {{ line.efficiency }}
            </td>
          </tr>
        </tbody>
        <tfoot class="figure bg-tv-800 text-white">
          <tr>
            <th class="px-2 py-1.5 text-left text-xs uppercase">Equipo</th>
            <td></td>
            <td class="px-1.5 text-right font-bold">{{ total('points') }}</td>
            <td class="px-1.5 text-right">{{ totals.fieldGoals }}</td>
            <td class="px-1.5 text-right">{{ totals.threes }}</td>
            <td class="px-1.5 text-right">{{ totals.freeThrows }}</td>
            <td class="px-1.5 text-right">{{ total('offensiveRebounds') }}</td>
            <td class="px-1.5 text-right">{{ total('defensiveRebounds') }}</td>
            <td class="px-1.5 text-right">{{ total('assists') }}</td>
            <td class="px-1.5 text-right">{{ total('steals') }}</td>
            <td class="px-1.5 text-right">{{ total('blocks') }}</td>
            <td class="px-1.5 text-right">{{ total('turnovers') }}</td>
            <td class="px-1.5 text-right">{{ total('fouls') }}</td>
            <td></td>
            <td class="px-2 text-right font-semibold">{{ total('efficiency') }}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  </AppPanel>
</template>
