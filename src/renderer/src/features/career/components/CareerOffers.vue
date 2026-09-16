<script setup lang="ts">
/**
 * Sin equipo: los clubes que te quieren.
 *
 * Es la pantalla que convierte el despido en el principio de otra cosa. Cada
 * oferta dice lo que de verdad hace falta para decidir —en qué categoría juega,
 * qué tamaño de club es, cómo va este año y qué te van a pedir— porque coger un
 * banquillo en enero es heredar lo que lleve hecho el equipo.
 */
import type { CareerOffer } from '@shared/contracts/career.contract';
import { AppBadge, AppButton, AppEmpty } from '@renderer/shared/ui';

defineProps<{
  offers: readonly CareerOffer[];
  reputationLabel: string;
  busy: boolean;
}>();

const emit = defineEmits<{ accept: [teamId: string] }>();

/** Un club grande no se lee igual que uno modesto: el tono lo dice. */
function reputationTone(reputation: number): 'good' | 'warn' | 'neutral' {
  if (reputation >= 70) return 'good';
  if (reputation >= 45) return 'warn';
  return 'neutral';
}
</script>

<template>
  <section class="rounded border border-ball-500 px-5 py-4">
    <div class="flex flex-wrap items-baseline justify-between gap-2">
      <h2 class="text-lg">Estás sin equipo</h2>
      <span class="text-sm text-court-300">{{ reputationLabel }}</span>
    </div>
    <p class="mt-1 text-sm text-court-300">
      Te han destituido, pero la carrera sigue. Estos clubes preguntan por ti — el que elijas lo
      coges como esté, con la temporada empezada.
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
  </section>
</template>
