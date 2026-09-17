<script setup lang="ts">
/**
 * Los clubes que te quieren.
 *
 * Sale en dos momentos que se leen distinto. Sin equipo, es la pantalla que
 * convierte el despido en el principio de otra cosa, y explica la opción de
 * esperar: cada mes se abren otros banquillos. Esperar ya no es un botón de
 * aquí: es lo que hace CONTINUAR en la barra de arriba (o «Esperar un mes» a su
 * lado, si hay selección que dirigir). Con equipo, sólo al acabar la
 * temporada y sólo con clubes claramente más grandes — y firmar ahí es dejar el
 * tuyo, así que se dice.
 *
 * Con la piel de IBM es un panel claro con una fila por club, como la lista de
 * equipos de 130945: escudo y nombre, liga, lo que pide su consejo, la
 * reputación en el anillo de la escala de cuatro tramos y el botón azul. Cada
 * oferta es un `li`: el arnés las lee así.
 */
import { matchKits } from '@shared/domain/court';
import type { CareerOffer } from '@shared/contracts/career.contract';
import { formatMatchDate } from '@renderer/shared/format';
import { AppButton, AppEmpty, AppPanel, AppRing, TeamBadge } from '@renderer/shared/ui';

defineProps<{
  offers: readonly CareerOffer[];
  reputationLabel: string;
  busy: boolean;
  /** Llegan teniendo equipo: aceptar es marcharse. */
  employed: boolean;
  canWait: boolean;
  currentDate: number;
}>();

const emit = defineEmits<{ accept: [teamId: string] }>();

const kitOf = (teamId: string) => matchKits(teamId, '').home;
</script>

<template>
  <AppPanel
    :title="employed ? 'Te buscan' : 'Estás sin equipo'"
    :hint="`Tu reputación: ${reputationLabel}`"
  >
    <p v-if="employed" class="text-sm text-tv-muted">
      Con la temporada cerrada, clubes más grandes preguntan por ti. Firmar con uno es dejar tu
      banquillo actual.
    </p>
    <p v-else class="text-sm text-tv-muted">
      {{ formatMatchDate(currentDate) }}. Estos clubes tienen el banquillo abierto este mes — el que
      elijas lo coges como esté.
      <template v-if="canWait">
        Si esperas (Continuar), el mundo sigue jugándose y el mes que viene se abren otros.
      </template>
    </p>

    <AppEmpty v-if="offers.length === 0">Nadie pregunta por ti ahora mismo.</AppEmpty>

    <ul v-else class="mt-3 flex flex-col gap-[3px]">
      <li
        v-for="offer in offers"
        :key="offer.teamId"
        class="grid grid-cols-[minmax(0,1.3fr)_minmax(0,1.4fr)_minmax(0,1fr)_auto_auto] items-center gap-[3px] text-sm"
      >
        <span class="flex h-full min-w-0 items-center gap-3 bg-tv-cell px-3 py-1.5">
          <TeamBadge :name="offer.teamName" :kit="kitOf(offer.teamId)" :size="32" />
          <span class="flex min-w-0 flex-col leading-tight">
            <span class="truncate font-bold">{{ offer.teamName }}</span>
            <span class="truncate text-xs text-tv-muted">{{ offer.stepLabel }}</span>
          </span>
        </span>
        <span
          class="flex h-full min-w-0 flex-col justify-center bg-tv-cell px-3 py-1.5 leading-tight"
        >
          <span class="truncate">
            {{ offer.competitionName }} ({{ offer.countryName }}){{
              offer.tier > 1 ? ' · 2ª división' : ''
            }}
          </span>
          <span class="truncate text-xs text-tv-muted">
            {{ offer.position ? `Va ${offer.position}º de ${offer.teams}` : 'Sin empezar' }}
          </span>
        </span>
        <span
          class="flex h-full min-w-0 flex-col justify-center bg-tv-cell px-3 py-1.5 leading-tight"
        >
          <span class="text-xs text-tv-muted">Te pedirán</span>
          <span class="truncate">{{ offer.objectiveLabel }}</span>
        </span>
        <span
          class="flex h-full flex-col items-center justify-center bg-tv-cell px-3 text-xs text-tv-muted"
        >
          Reputación
          <AppRing :value="offer.reputation" :size="32" />
        </span>
        <span class="flex h-full items-center bg-tv-cell px-3">
          <AppButton
            variant="primary"
            size="sm"
            :disabled="busy"
            @click="emit('accept', offer.teamId)"
          >
            Firmar
          </AppButton>
        </span>
      </li>
    </ul>
  </AppPanel>
</template>
