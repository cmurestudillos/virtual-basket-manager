<script setup lang="ts">
/**
 * La rueda de prensa: una pregunta y tres maneras de contestarla.
 *
 * Los efectos no se enseñan antes de contestar, y a propósito: con los números
 * delante nadie contesta, calcula. Lo que sí se ve es el tono de cada
 * respuesta, que es lo que un entrenador sabe antes de abrir la boca. Después
 * llega la reacción, en palabras.
 */
import { ref } from 'vue';
import type { PressConference } from '@shared/contracts/inbox.contract';
import type { PressTone } from '@shared/domain/press';
import { AppBadge, AppButton, AppPanel } from '@renderer/shared/ui';

const props = defineProps<{ conference: PressConference }>();
const emit = defineEmits<{ answered: [conference: PressConference] }>();

const busy = ref(false);
const error = ref<string | null>(null);

const TONE_BADGE: Record<PressTone, 'neutral' | 'accent' | 'warn'> = {
  humble: 'neutral',
  confident: 'accent',
  combative: 'warn'
};

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
  <AppPanel title="Rueda de prensa">
    <p class="text-lg">«{{ conference.question }}»</p>

    <!-- Ya contestada: lo que dijiste y cómo sentó. -->
    <div v-if="conference.answeredTone" class="mt-4 flex flex-col gap-2">
      <p
        v-for="option in conference.options.filter((o) => o.tone === conference.answeredTone)"
        :key="option.tone"
        class="rounded border border-ball-500 px-3 py-2 text-sm"
      >
        {{ option.text }}
      </p>
      <p class="text-sm text-court-300">{{ conference.reaction }}</p>
    </div>

    <p v-else-if="conference.expired" class="mt-4 text-sm text-court-300">
      Dejaste pasar esta rueda de prensa. Ya hay otra más reciente.
    </p>

    <ul v-else class="mt-4 flex flex-col gap-2">
      <li v-for="option in conference.options" :key="option.tone">
        <button
          type="button"
          class="flex w-full items-start gap-3 rounded border border-court-700 px-3 py-2 text-left text-sm transition hover:border-ball-500"
          :disabled="busy"
          @click="answer(option.tone)"
        >
          <AppBadge :tone="TONE_BADGE[option.tone]" class="shrink-0">
            {{ option.toneLabel }}
          </AppBadge>
          <span>{{ option.text }}</span>
        </button>
      </li>
    </ul>

    <p v-if="error" class="mt-2 text-sm text-warn-400">{{ error }}</p>

    <template v-if="!conference.answeredTone && !conference.expired" #actions>
      <AppButton size="sm" variant="ghost" :disabled="busy" @click="emit('answered', conference)">
        Ahora no
      </AppButton>
    </template>
  </AppPanel>
</template>
