<script setup lang="ts">
/**
 * Los contratos de la plantilla, como la «Cartera» de IBM: quién es, cómo está,
 * cuánto cobra, cuánto le queda y lo que costaría renovarlo o echarlo, con las
 * tres acciones en la fila. Los años se ponen en rojo en la última temporada,
 * que es cuando hay que decidir.
 *
 * Las acciones avisan a la pantalla, que es la que habla con el club.
 */
import type { ContractEntry } from '@shared/contracts/market.contract';
import { formatMoney } from '@renderer/shared/format';
import {
  AppBadge,
  AppButton,
  AppFlag,
  AppPanel,
  AppRing,
  MoodIcon,
  PlayerName,
  PositionChip,
  TONE_TEXT
} from '@renderer/shared/ui';

defineProps<{ contracts: readonly ContractEntry[]; busy: boolean }>();

defineEmits<{
  renew: [entry: ContractEntry];
  loanOut: [entry: ContractEntry];
  release: [entry: ContractEntry];
}>();
</script>

<template>
  <AppPanel
    title="Contratos"
    :hint="`${contracts.length} jugadores`"
    scroll
    flush
    class="min-h-0 flex-1"
  >
    <table class="data-table">
      <thead>
        <tr>
          <th>Jugador</th>
          <th>Pos</th>
          <th class="numeric">Edad</th>
          <th class="numeric">Media</th>
          <th>Moral</th>
          <th class="numeric">Ficha</th>
          <th class="numeric">Años</th>
          <th class="numeric">Renovar por</th>
          <th class="numeric">Rescindir</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="entry in contracts" :key="entry.playerId">
          <td>
            <span class="flex items-center gap-2">
              <AppFlag :code="entry.nationality" />
              <RouterLink
                :to="{ name: 'player', params: { playerId: entry.playerId } }"
                class="max-w-44 truncate hover:text-tv-blue-ink"
              >
                <PlayerName :name="entry.playerName" />
              </RouterLink>
              <AppBadge v-if="entry.isHomegrown">Formación</AppBadge>
              <AppBadge v-if="entry.isOnLoan" tone="accent">Cedido aquí</AppBadge>
              <AppBadge v-if="entry.refusesRenewal" tone="bad">No renueva</AppBadge>
            </span>
          </td>
          <td><PositionChip :position="entry.position" /></td>
          <td class="numeric">{{ entry.age }}</td>
          <td class="numeric is-key py-0.5"><AppRing :value="entry.overall" :size="28" /></td>
          <td class="py-0.5"><MoodIcon :value="entry.morale" /></td>
          <td class="numeric">{{ formatMoney(entry.wageCents) }}</td>
          <td
            class="numeric"
            :class="entry.contractYearsLeft <= 1 ? `${TONE_TEXT.bad} font-bold` : ''"
          >
            {{ entry.contractYearsLeft }}
          </td>
          <td class="numeric">{{ formatMoney(entry.renewalWageCents) }}</td>
          <td class="numeric">{{ formatMoney(entry.releaseCostCents) }}</td>
          <td>
            <span class="flex justify-end gap-1">
              <AppButton
                size="sm"
                variant="primary"
                :disabled="busy || entry.refusesRenewal"
                :title="entry.refusesRenewal ? 'Está enfadado: no quiere renovar' : ''"
                @click="$emit('renew', entry)"
              >
                Renovar
              </AppButton>
              <AppButton
                size="sm"
                :disabled="busy || entry.isOnLoan"
                @click="$emit('loanOut', entry)"
              >
                Ceder
              </AppButton>
              <AppButton
                size="sm"
                variant="danger"
                :disabled="busy || entry.isOnLoan"
                @click="$emit('release', entry)"
              >
                Rescindir
              </AppButton>
            </span>
          </td>
        </tr>
      </tbody>
    </table>
  </AppPanel>
</template>
