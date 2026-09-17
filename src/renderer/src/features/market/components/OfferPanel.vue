<script setup lang="ts">
/**
 * La negociación con un jugador, como el «Estado de la oferta» de IBM: la cara,
 * el escudo y la media del objetivo, su ficha en clave-valor y, al lado, lo que
 * se le ofrece —traspaso, ficha y años— con el botón de ofertar.
 *
 * Lo que decide está en la pantalla del mercado; aquí sólo se pinta y se avisa.
 * El «Ofertar» de este panel tiene que ir en el documento **antes** que los de
 * las filas de la tabla: el arnés abre la oferta desde una fila y la manda con
 * el primero que encuentra.
 */
import { computed } from 'vue';
import type { MarketPlayer } from '@shared/contracts/market.contract';
import { MAX_CONTRACT_YEARS, MIN_CONTRACT_YEARS } from '@shared/domain/market';
import { matchKits } from '@shared/domain/court';
import { toStars } from '@shared/domain/stars';
import { formatMoney } from '@renderer/shared/format';
import {
  AppAvatar,
  AppButton,
  AppField,
  AppFlag,
  AppInput,
  AppPanel,
  AppRing,
  AppStars,
  AppStepper,
  KeyValueList,
  PlayerName,
  PositionChip,
  TONE_TEXT,
  TeamBadge,
  type KeyValueItem
} from '@renderer/shared/ui';

const props = defineProps<{
  target: MarketPlayer;
  /** Hay ventana abierta: fuera de ella no se oferta. */
  open: boolean;
  busy: boolean;
  canAfford: boolean;
  /** Lo que aceptaría el club, si la última oferta se quedó cerca. */
  counterOffer: number | null;
  wageHeadroomCents: number;
}>();

const fee = defineModel<number>('fee', { required: true });
const wage = defineModel<number>('wage', { required: true });
const years = defineModel<number>('years', { required: true });

defineEmits<{ submit: []; cancel: []; acceptCounter: [] }>();

const FACTS: KeyValueItem[] = [
  { id: 'player', label: 'Jugador' },
  { id: 'team', label: 'Equipo' },
  { id: 'position', label: 'Puesto y edad' },
  { id: 'potential', label: 'Potencial' }
];

const kit = computed(() => (props.target.teamId ? matchKits(props.target.teamId, '').home : null));
</script>

<template>
  <AppPanel title="Estado de la oferta" :hint="target.isFreeAgent ? 'Agente libre' : ''">
    <div class="grid grid-cols-[auto_minmax(0,17rem)_minmax(0,1fr)] items-start gap-4">
      <div class="flex items-center gap-3">
        <AppAvatar kind="player" :seed="target.playerId" :name="target.playerName" :size="64" />
        <AppRing :value="target.overall" label="Media" :size="56" />
      </div>

      <KeyValueList :items="FACTS">
        <template #value="{ item }">
          <template v-if="item.id === 'player'">
            <AppFlag :code="target.nationality" />
            <span class="font-semibold text-tv-ink"><PlayerName :name="target.playerName" /></span>
          </template>
          <template v-else-if="item.id === 'team'">
            <TeamBadge
              v-if="kit && target.teamName"
              :name="target.teamName"
              :kit="kit"
              :size="22"
            />
            <span class="truncate">{{ target.teamName ?? 'Agente libre' }}</span>
          </template>
          <template v-else-if="item.id === 'position'">
            <PositionChip :position="target.position" />
            <span>{{ target.age }} años</span>
          </template>
          <AppStars v-else :value="toStars(target.potential)" label="Potencial" />
        </template>
      </KeyValueList>

      <div class="flex flex-col gap-3">
        <div class="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] items-end gap-3">
          <AppField label="Traspaso (€)">
            <AppInput
              v-model="fee"
              type="number"
              min="0"
              class="w-full"
              :disabled="target.isFreeAgent"
            />
          </AppField>
          <AppField label="Ficha anual (€)">
            <AppInput v-model="wage" type="number" min="0" class="w-full" />
          </AppField>
          <!-- Sin `AppField`: una etiqueta que envuelve el paso a paso pulsaría su «−». -->
          <div class="flex flex-col gap-1 text-tv-ink">
            <span class="text-xs font-bold uppercase tracking-wide">Años</span>
            <AppStepper
              v-model="years"
              :min="MIN_CONTRACT_YEARS"
              :max="MAX_CONTRACT_YEARS"
              label="Años de contrato"
            />
          </div>
        </div>

        <div class="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
          <p v-if="!canAfford" class="font-semibold" :class="TONE_TEXT.bad">
            No hay tanto dinero en caja.
          </p>
          <template v-if="counterOffer !== null">
            <p class="text-tv-ink">El club se lo dejaría en {{ formatMoney(counterOffer) }}.</p>
            <AppButton variant="primary" size="sm" :disabled="busy" @click="$emit('acceptCounter')">
              Aceptar contraoferta
            </AppButton>
          </template>
        </div>

        <div class="flex items-center gap-3">
          <p class="text-xs text-tv-muted">
            Margen de nómina antes del tope: {{ formatMoney(wageHeadroomCents) }}
          </p>
          <AppButton class="ml-auto" @click="$emit('cancel')">Cancelar</AppButton>
          <AppButton
            variant="primary"
            :disabled="busy || !open || !canAfford"
            @click="$emit('submit')"
          >
            Ofertar
          </AppButton>
        </div>
      </div>
    </div>
  </AppPanel>
</template>
