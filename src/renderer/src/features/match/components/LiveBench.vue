<script setup lang="ts">
/**
 * El banquillo durante el partido.
 *
 * Es la pantalla desde la que se dirige: los cinco de pista arriba con lo que
 * llevan encima —minutos, faltas y piernas—, el banquillo debajo, y el cambio
 * se hace señalando a uno de cada lado. Nada de arrastrar ni de menús: en
 * mitad de un partido a treinta segundos por minuto hay que poder cambiar en
 * dos clics.
 *
 * Las piernas van con su color porque son la razón por la que se cambia: un
 * titular en rojo es la señal de que toca sentarlo, y verlo de un vistazo es
 * más útil que el número exacto.
 */
import { computed, ref } from 'vue';
import type { LiveBenchPlayer } from '@shared/contracts/match.contract';
import { POSITION_ABBREVIATIONS } from '@shared/domain/positions';
import { formatPlayedMinutes } from '@renderer/shared/format';
import {
  AppAvatar,
  AppButton,
  AppFlag,
  RATING_CHIP,
  TONE_TEXT,
  bandForValue
} from '@renderer/shared/ui';

const props = defineProps<{
  onCourt: readonly LiveBenchPlayer[];
  benched: readonly LiveBenchPlayer[];
  autoRotation: boolean;
  /** Motivo del último «no» del banquillo, si lo hubo. */
  refusal: string | null;
  disabled: boolean;
}>();

const emit = defineEmits<{
  substitute: [outgoingId: string, incomingId: string];
  autoRotation: [enabled: boolean];
}>();

/** El de pista señalado para salir, mientras se elige por quién. */
const outgoing = ref<string | null>(null);

const selected = computed(
  () => props.onCourt.find((player) => player.playerId === outgoing.value) ?? null
);

function pickOutgoing(player: LiveBenchPlayer): void {
  if (props.disabled) return;
  outgoing.value = outgoing.value === player.playerId ? null : player.playerId;
}

function pickIncoming(player: LiveBenchPlayer): void {
  if (props.disabled || !outgoing.value || player.fouledOut) return;
  emit('substitute', outgoing.value, player.playerId);
  outgoing.value = null;
}

/** Las piernas, en su cajita del color de la escala de 0 a 100. */
function legsTone(player: LiveBenchPlayer): string {
  return RATING_CHIP[bandForValue(player.freshness)];
}

/** Las faltas sólo cantan cuando empiezan a pesar. */
function foulsTone(player: LiveBenchPlayer): string {
  if (player.fouledOut) return TONE_TEXT.bad;
  if (player.fouls >= 4) return `${TONE_TEXT.warn} font-bold`;
  return TONE_TEXT.neutral;
}
</script>

<template>
  <div class="flex flex-col gap-3 text-tv-ink">
    <div class="flex items-center justify-between gap-3">
      <p class="text-sm text-tv-muted">
        {{ autoRotation ? 'Los cambios los hace el motor.' : 'Los cambios los haces tú.' }}
      </p>
      <AppButton
        :variant="autoRotation ? 'primary' : 'secondary'"
        :disabled="disabled"
        @click="emit('autoRotation', !autoRotation)"
      >
        {{ autoRotation ? 'Coger el mando' : 'Devolver al motor' }}
      </AppButton>
    </div>

    <p v-if="refusal" class="border-l-4 border-tv-red bg-white px-3 py-2 text-xs text-tv-red">
      {{ refusal }}
    </p>

    <p class="bg-tv-800 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-white">
      En pista
    </p>
    <ul class="flex flex-col gap-1">
      <li v-for="player in onCourt" :key="player.playerId">
        <button
          type="button"
          class="flex w-full items-center gap-2 border-l-4 px-2 py-1.5 text-left text-sm transition"
          :class="
            outgoing === player.playerId
              ? 'border-tv-blue bg-white'
              : 'border-transparent bg-tv-cell hover:bg-white'
          "
          :disabled="disabled"
          @click="pickOutgoing(player)"
        >
          <span class="w-7 shrink-0 font-bold text-tv-blue">{{
            POSITION_ABBREVIATIONS[player.playedPosition]
          }}</span>
          <AppAvatar kind="player" :seed="player.playerId" :size="22" />
          <AppFlag :code="player.nationality" />
          <span class="flex-1 truncate">{{ player.playerName }}</span>
          <span class="figure w-10 text-right text-xs text-tv-muted">
            {{ formatPlayedMinutes(player.secondsPlayed) }}
          </span>
          <span class="figure w-8 text-right text-xs font-semibold">{{ player.points }}</span>
          <span class="figure w-8 text-right text-xs" :class="foulsTone(player)">
            {{ player.fouls }}f
          </span>
          <span class="figure w-8 py-0.5 text-center text-xs font-bold" :class="legsTone(player)">
            {{ player.freshness }}
          </span>
        </button>
      </li>
    </ul>

    <p class="bg-tv-800 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-white">
      {{ selected ? `Entra por ${selected.playerName}` : 'Banquillo' }}
    </p>
    <ul class="flex flex-col gap-1">
      <li v-for="player in benched" :key="player.playerId">
        <button
          type="button"
          class="flex w-full items-center gap-2 border-l-4 border-transparent bg-tv-cell px-2 py-1.5 text-left text-sm transition"
          :class="[
            player.fouledOut ? 'opacity-50' : '',
            selected && !player.fouledOut ? 'hover:border-tv-blue hover:bg-white' : ''
          ]"
          :disabled="disabled || !selected || player.fouledOut"
          @click="pickIncoming(player)"
        >
          <span class="w-7 shrink-0 text-tv-muted">{{
            POSITION_ABBREVIATIONS[player.position]
          }}</span>
          <AppAvatar kind="player" :seed="player.playerId" :size="22" />
          <AppFlag :code="player.nationality" />
          <span class="flex-1 truncate">{{ player.playerName }}</span>
          <span v-if="player.fouledOut" class="text-xs text-tv-red">eliminado</span>
          <template v-else>
            <span class="figure w-10 text-right text-xs text-tv-muted">
              {{ formatPlayedMinutes(player.secondsPlayed) }}
            </span>
            <span class="figure w-8 text-right text-xs font-semibold">{{ player.points }}</span>
            <span class="figure w-8 text-right text-xs" :class="foulsTone(player)">
              {{ player.fouls }}f
            </span>
            <span class="figure w-8 py-0.5 text-center text-xs font-bold" :class="legsTone(player)">
              {{ player.freshness }}
            </span>
          </template>
        </button>
      </li>
    </ul>
  </div>
</template>
