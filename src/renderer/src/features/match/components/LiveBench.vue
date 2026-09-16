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
import { formatPlayedMinutes } from '@renderer/shared/format';
import { AppButton, AppPanel } from '@renderer/shared/ui';
import { TONE_TEXT, toneForLevel } from '@renderer/shared/ui/tones';

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

function legsTone(player: LiveBenchPlayer): string {
  return TONE_TEXT[toneForLevel(player.freshness)];
}

/** Las faltas sólo cantan cuando empiezan a pesar. */
function foulsTone(player: LiveBenchPlayer): string {
  if (player.fouledOut) return TONE_TEXT.bad;
  if (player.fouls >= 4) return TONE_TEXT.warn;
  return 'text-court-300';
}
</script>

<template>
  <AppPanel title="Banquillo" :hint="autoRotation ? 'rotación automática' : 'la llevas tú'">
    <template #actions>
      <AppButton
        size="sm"
        :variant="autoRotation ? 'secondary' : 'ghost'"
        :disabled="disabled"
        @click="emit('autoRotation', !autoRotation)"
      >
        {{ autoRotation ? 'Coger el mando' : 'Devolver al motor' }}
      </AppButton>
    </template>

    <p v-if="refusal" class="mb-3 rounded border border-warn-500 px-3 py-2 text-xs text-warn-400">
      {{ refusal }}
    </p>

    <p class="mb-2 text-xs uppercase tracking-wide text-court-300">En pista</p>
    <ul class="flex flex-col gap-1">
      <li v-for="player in onCourt" :key="player.playerId">
        <button
          type="button"
          class="flex w-full items-center gap-2 rounded border px-2 py-1.5 text-left text-sm transition"
          :class="
            outgoing === player.playerId
              ? 'border-ball-500 bg-court-800'
              : 'border-court-700 hover:border-court-600'
          "
          :disabled="disabled"
          @click="pickOutgoing(player)"
        >
          <span class="w-7 shrink-0 text-ball-400">{{ player.playedPosition }}</span>
          <span class="flex-1 truncate">{{ player.playerName }}</span>
          <span class="figure w-10 text-right text-xs text-court-300">
            {{ formatPlayedMinutes(player.secondsPlayed) }}
          </span>
          <span class="figure w-8 text-right text-xs font-semibold">{{ player.points }}</span>
          <span class="figure w-8 text-right text-xs" :class="foulsTone(player)">
            {{ player.fouls }}f
          </span>
          <span class="figure w-8 text-right text-xs" :class="legsTone(player)">
            {{ player.freshness }}
          </span>
        </button>
      </li>
    </ul>

    <p class="mb-2 mt-4 text-xs uppercase tracking-wide text-court-300">
      {{ selected ? `Entra por ${selected.playerName}` : 'Banquillo' }}
    </p>
    <ul class="flex flex-col gap-1">
      <li v-for="player in benched" :key="player.playerId">
        <button
          type="button"
          class="flex w-full items-center gap-2 rounded border px-2 py-1.5 text-left text-sm transition"
          :class="[
            player.fouledOut ? 'border-court-800 text-court-600' : 'border-court-700',
            selected && !player.fouledOut ? 'hover:border-ball-500' : ''
          ]"
          :disabled="disabled || !selected || player.fouledOut"
          @click="pickIncoming(player)"
        >
          <span class="w-7 shrink-0 text-court-300">{{ player.position }}</span>
          <span class="flex-1 truncate">{{ player.playerName }}</span>
          <span v-if="player.fouledOut" class="text-xs text-bad-400">eliminado</span>
          <template v-else>
            <span class="figure w-10 text-right text-xs text-court-300">
              {{ formatPlayedMinutes(player.secondsPlayed) }}
            </span>
            <span class="figure w-8 text-right text-xs font-semibold">{{ player.points }}</span>
            <span class="figure w-8 text-right text-xs" :class="foulsTone(player)">
              {{ player.fouls }}f
            </span>
            <span class="figure w-8 text-right text-xs" :class="legsTone(player)">
              {{ player.freshness }}
            </span>
          </template>
        </button>
      </li>
    </ul>
  </AppPanel>
</template>
