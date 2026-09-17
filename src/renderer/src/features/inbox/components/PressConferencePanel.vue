<script setup lang="ts">
/**
 * La rueda de prensa: una pregunta y tres maneras de contestarla.
 *
 * Los efectos no se enseñan antes de contestar, y a propósito: con los números
 * delante nadie contesta, calcula. Lo que sí se ve es el tono de cada
 * respuesta, que es lo que un entrenador sabe antes de abrir la boca. Después
 * llega la reacción, en palabras.
 *
 * Como la presentación de IBM (131021): panel claro, el escudo del club a la
 * izquierda, la pregunta en un bocadillo blanco y las respuestas debajo como
 * botones azules, cada uno con su tono delante. Lo primero que se lee del panel
 * es la pregunta: a la izquierda no hay párrafos que se le adelanten.
 */
import { computed, ref } from 'vue';
import { matchKits } from '@shared/domain/court';
import type { PressConference } from '@shared/contracts/inbox.contract';
import type { PressTone } from '@shared/domain/press';
import { AppButton, AppPanel, TeamBadge, TONE_TEXT } from '@renderer/shared/ui';
import { formatShortDate } from '@renderer/shared/format';
import { useGameStateStore } from '@renderer/shared/game-state.store';

const props = defineProps<{ conference: PressConference }>();
const emit = defineEmits<{ answered: [conference: PressConference] }>();

const gameState = useGameStateStore();

const busy = ref(false);
const error = ref<string | null>(null);

const club = computed(() => {
  const state = gameState.state;
  return state?.teamId ? { name: state.teamName, kit: matchKits(state.teamId, '').home } : null;
});
const answered = computed(() =>
  props.conference.options.find((option) => option.tone === props.conference.answeredTone)
);

async function answer(tone: PressTone): Promise<void> {
  if (busy.value) return;
  busy.value = true;
  error.value = null;
  try {
    emit('answered', await window.api.inbox.answerPress(props.conference.id, tone));
  } catch {
    error.value = 'Esta rueda de prensa ya no se puede contestar.';
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <AppPanel title="Rueda de prensa" :hint="formatShortDate(conference.createdOn)" scroll>
    <div class="grid grid-cols-[9rem_minmax(0,1fr)] gap-4">
      <div class="flex flex-col items-center gap-2 text-center text-sm">
        <TeamBadge v-if="club" :name="club.name" :kit="club.kit" :size="88" />
        <span class="flex w-full flex-col">
          <span class="bg-tv-cell-strong px-2 py-1.5">{{ gameState.state?.managerName }}</span>
          <span class="bg-tv-cell px-2 py-1.5 text-tv-muted">Sala de prensa</span>
        </span>
      </div>

      <div class="flex min-w-0 flex-col gap-4">
        <div class="rounded-lg border border-tv-box bg-white px-4 py-3">
          <p class="text-base">«{{ conference.question }}»</p>
        </div>

        <!-- Ya contestada: lo que dijiste y cómo sentó. -->
        <div v-if="conference.answeredTone" class="flex flex-col gap-2">
          <p v-if="answered" class="bg-tv-select px-3 py-2 text-sm">
            <span class="font-bold uppercase tracking-wide">{{ answered.toneLabel }}:</span>
            {{ answered.text }}
          </p>
          <p class="text-sm">{{ conference.reaction }}</p>
        </div>

        <p v-else-if="conference.expired" class="text-sm text-tv-muted">
          Dejaste pasar esta rueda de prensa. Ya hay otra más reciente.
        </p>

        <template v-else>
          <ul class="flex flex-col gap-2">
            <li v-for="option in conference.options" :key="option.tone">
              <AppButton variant="primary" block :disabled="busy" @click="answer(option.tone)">
                <span class="flex flex-col items-start gap-0.5 text-left">
                  <span>{{ option.toneLabel }}</span>
                  <span class="text-sm font-normal normal-case tracking-normal">
                    {{ option.text }}
                  </span>
                </span>
              </AppButton>
            </li>
          </ul>
          <div class="flex justify-end">
            <AppButton size="sm" :disabled="busy" @click="emit('answered', conference)">
              Ahora no
            </AppButton>
          </div>
        </template>

        <p v-if="error" class="text-sm" :class="TONE_TEXT.bad">{{ error }}</p>
      </div>
    </div>
  </AppPanel>
</template>
