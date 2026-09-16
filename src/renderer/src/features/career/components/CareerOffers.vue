<script setup lang="ts">
/**
 * Los clubes que te quieren.
 *
 * Sale en dos momentos que se leen distinto. Sin equipo, es la pantalla que
 * convierte el despido en el principio de otra cosa, y trae la opción de
 * esperar: cada mes se abren otros banquillos. Con equipo, sólo al acabar la
 * temporada y sólo con clubes claramente más grandes — y firmar ahí es dejar el
 * tuyo, así que se dice.
 */
import type { CareerOffer } from '@shared/contracts/career.contract';
import { formatMatchDate } from '@renderer/shared/format';
import { AppBadge, AppButton, AppEmpty } from '@renderer/shared/ui';

defineProps<{
  offers: readonly CareerOffer[];
  reputationLabel: string;
  busy: boolean;
  /** Llegan teniendo equipo: aceptar es marcharse. */
  employed: boolean;
  canWait: boolean;
  currentDate: number;
}>();

const emit = defineEmits<{ accept: [teamId: string]; wait: [] }>();

/** Un club grande no se lee igual que uno modesto: el tono lo dice. */
function reputationTone(reputation: number): 'good' | 'warn' | 'neutral' {
  if (reputation >= 70) return 'good';
  if (reputation >= 45) return 'warn';
  return 'neutral';
}
</script>

<template>
  <section
    class="rounded border px-5 py-4"
    :class="employed ? 'border-court-600' : 'border-ball-500'"
  >
    <div class="flex flex-wrap items-baseline justify-between gap-2">
      <h2 class="text-lg">{{ employed ? 'Te buscan' : 'Estás sin equipo' }}</h2>
      <span class="text-sm text-court-300">{{ reputationLabel }}</span>
    </div>
    <p v-if="employed" class="mt-1 text-sm text-court-300">
      Con la temporada cerrada, clubes más grandes preguntan por ti. Firmar con uno es dejar tu
      banquillo actual.
    </p>
    <p v-else class="mt-1 text-sm text-court-300">
      {{ formatMatchDate(currentDate) }}. Estos clubes tienen el banquillo abierto este mes — el que
      elijas lo coges como esté. Si esperas, el mundo sigue jugándose y el mes que viene se abren
      otros.
    </p>

    <AppEmpty v-if="offers.length === 0" class="mt-4">
      Nadie pregunta por ti ahora mismo.
    </AppEmpty>

    <ul v-else class="mt-4 flex flex-col gap-2">
      <li
        v-for="offer in offers"
        :key="offer.teamId"
        class="flex flex-wrap items-center justify-between gap-4 rounded border border-court-700 px-4 py-3"
      >
        <div>
          <p class="flex items-center gap-2">
            <span class="text-base">{{ offer.teamName }}</span>
            <AppBadge :tone="reputationTone(offer.reputation)">{{ offer.reputation }}</AppBadge>
            <span v-if="offer.tier > 1" class="text-xs text-court-300">2ª división</span>
          </p>
          <p class="text-sm text-court-300">
            {{ offer.competitionName }} ·
            <span v-if="offer.position">va {{ offer.position }}º de {{ offer.teams }}</span>
            <span v-else>sin empezar</span>
            · {{ offer.stepLabel }}
          </p>
          <p class="text-xs text-court-300">Te pedirán: {{ offer.objectiveLabel.toLowerCase() }}</p>
        </div>
        <AppButton variant="primary" :disabled="busy" @click="emit('accept', offer.teamId)">
          Firmar
        </AppButton>
      </li>
    </ul>

    <div v-if="canWait" class="mt-4 flex items-center justify-end gap-3">
      <span v-if="busy" class="text-sm text-court-300">Pasa el mes…</span>
      <AppButton variant="secondary" :disabled="busy" @click="emit('wait')">
        Esperar un mes
      </AppButton>
    </div>
  </section>
</template>
