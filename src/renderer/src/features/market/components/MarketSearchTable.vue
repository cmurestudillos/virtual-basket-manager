<script setup lang="ts">
/**
 * Los fichables, en la tabla del mercado de IBM: bandera y «Nombre APELLIDO»,
 * escudo del club, puesto, media en su aro, potencial en estrellas, contrato y
 * lo que cuesta. La media es la que ve tu ojeador: lleva su margen de error al
 * lado.
 *
 * Las acciones de cada fila avisan a la pantalla, que es la que negocia.
 */
import type { MarketPlayer } from '@shared/contracts/market.contract';
import { matchKits } from '@shared/domain/court';
import { toStars } from '@shared/domain/stars';
import { formatMoney } from '@renderer/shared/format';
import {
  AppButton,
  AppFlag,
  AppPanel,
  AppRing,
  AppStars,
  PlayerName,
  PositionChip,
  TONE_TEXT,
  TeamBadge
} from '@renderer/shared/ui';

defineProps<{ players: readonly MarketPlayer[]; open: boolean; busy: boolean }>();

defineEmits<{ offer: [player: MarketPlayer]; loanIn: [player: MarketPlayer] }>();

const kitOf = (teamId: string) => matchKits(teamId, '').home;
</script>

<template>
  <AppPanel
    title="Jugadores"
    :hint="`${players.length} fichables`"
    scroll
    flush
    class="min-h-0 flex-1"
  >
    <template #actions>
      <span class="text-xs font-semibold text-white/75">
        Lo que ves de un jugador de fuera lleva el margen de tu ojeador
      </span>
    </template>
    <table class="data-table">
      <thead>
        <tr>
          <th>Jugador</th>
          <th>Equipo</th>
          <th>Pos</th>
          <th class="numeric">Edad</th>
          <th class="numeric">Media</th>
          <th>Potencial</th>
          <th class="numeric">Años</th>
          <th class="numeric">Traspaso</th>
          <th class="numeric">Ficha</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        <tr v-if="players.length === 0">
          <td colspan="10" class="text-center text-tv-muted">Nadie encaja con esos filtros.</td>
        </tr>
        <tr v-for="player in players" :key="player.playerId">
          <td>
            <RouterLink
              :to="{ name: 'player', params: { playerId: player.playerId } }"
              class="flex max-w-52 items-center gap-2 hover:text-tv-blue-ink"
            >
              <AppFlag :code="player.nationality" />
              <PlayerName :name="player.playerName" />
            </RouterLink>
          </td>
          <td>
            <!-- El club abre su ficha: a quién se le compra, y cómo juega. -->
            <RouterLink
              v-if="player.teamId && player.teamName"
              :to="{ name: 'team-profile', params: { teamId: player.teamId } }"
              class="flex max-w-40 items-center gap-2 hover:text-tv-blue-ink"
            >
              <TeamBadge :name="player.teamName" :kit="kitOf(player.teamId)" :size="20" />
              <span class="truncate">{{ player.teamName }}</span>
            </RouterLink>
            <span v-else :class="TONE_TEXT.neutral">Libre</span>
          </td>
          <td><PositionChip :position="player.position" /></td>
          <td class="numeric">{{ player.age }}</td>
          <td class="numeric is-key py-0.5">
            <span class="inline-flex items-center gap-1">
              <AppRing :value="player.overall" :size="28" />
              <span class="text-xs text-tv-muted">±{{ player.uncertainty }}</span>
            </span>
          </td>
          <td class="py-0.5">
            <AppStars :value="toStars(player.potential)" label="Potencial" :size="12" />
          </td>
          <td class="numeric" :class="player.contractYearsLeft <= 1 ? TONE_TEXT.bad : ''">
            {{ player.contractYearsLeft }}
          </td>
          <td class="numeric">
            {{ player.isFreeAgent ? '—' : formatMoney(player.askingPriceCents) }}
          </td>
          <td class="numeric">{{ formatMoney(player.wageDemandCents) }}</td>
          <td>
            <span class="flex justify-end gap-1">
              <AppButton
                size="sm"
                variant="primary"
                :disabled="!open"
                @click="$emit('offer', player)"
              >
                Ofertar
              </AppButton>
              <AppButton
                v-if="!player.isFreeAgent"
                size="sm"
                :disabled="!open || busy"
                @click="$emit('loanIn', player)"
              >
                Pedir cedido
              </AppButton>
            </span>
          </td>
        </tr>
      </tbody>
    </table>
  </AppPanel>
</template>
