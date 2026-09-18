<script setup lang="ts">
/**
 * La ficha del mánager, primera pestaña de la sección Mánager (IBM 130718): la
 * ficha de entrenador del usuario, la misma vista que la de cualquier otro.
 *
 * En modo carrera lleva además lo que antes era la pestaña Carrera del
 * historial: dimitir y dejar la selección al pie de INFO, y las etapas en clubes
 * y selecciones debajo del historial. Las ofertas y el paro siguen en el inicio.
 *
 * Irse de un banquillo no se deshace: dimitir y dejar la selección van en dos
 * pasos, el primero pregunta.
 */
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import type { CareerStatus } from '@shared/contracts/career.contract';
import { matchKits } from '@shared/domain/court';
import {
  AppBadge,
  AppButton,
  AppEmpty,
  AppFlag,
  AppPanel,
  TONE_TEXT,
  TeamBadge
} from '@renderer/shared/ui';
import { useContinueStore } from '@renderer/features/season/continue.store';
import CoachProfileView from '../components/CoachProfileView.vue';

const router = useRouter();
const continuing = useContinueStore();

/** La hoja de servicios. Sólo cuenta en partidas de carrera. */
const career = ref<CareerStatus | null>(null);
const view = ref<InstanceType<typeof CoachProfileView> | null>(null);

onMounted(async () => {
  career.value = await window.api.career.getStatus();
});

const confirmingResign = ref(false);
const confirmingLeave = ref(false);
const resigning = ref(false);

async function resign(): Promise<void> {
  if (!confirmingResign.value) {
    confirmingResign.value = true;
    return;
  }
  resigning.value = true;
  try {
    career.value = await window.api.career.resign();
    // La barra de arriba y CONTINUAR se enteran al cambiar de pantalla; el
    // inicio es donde se buscan banquillos.
    await router.push({ name: 'dashboard' });
  } finally {
    resigning.value = false;
    confirmingResign.value = false;
  }
}

/** Dejar la selección: el club no se toca, así que se queda en la ficha. */
async function leaveNational(): Promise<void> {
  if (!confirmingLeave.value) {
    confirmingLeave.value = true;
    return;
  }
  resigning.value = true;
  try {
    career.value = await window.api.career.leaveNational();
    await Promise.all([view.value?.reload(), continuing.refresh()]);
  } finally {
    resigning.value = false;
    confirmingLeave.value = false;
  }
}

/** «Temporadas 1-3» o «Temporada 4 · en curso». */
function spellYears(spell: CareerStatus['spells'][number]): string {
  if (spell.endSeason === null) {
    return `Temporada ${spell.startSeason} · en curso`;
  }
  if (spell.endSeason === spell.startSeason) {
    return `Temporada ${spell.startSeason}`;
  }
  return `Temporadas ${spell.startSeason}-${spell.endSeason}`;
}

function spellEnd(spell: CareerStatus['spells'][number]): string {
  if (spell.endReason === 'dismissed') return 'destituido';
  if (spell.endReason === 'left') return 'se marchó';
  return '';
}

const kitOf = (teamId: string) => matchKits(teamId, '').home;
</script>

<template>
  <CoachProfileView ref="view" :coach-id="null">
    <template v-if="career?.careerMode" #info>
      <div v-if="career.canResign" class="flex flex-col gap-2 bg-tv-cell px-3 py-2">
        <p class="text-sm">
          {{
            confirmingResign
              ? `¿Dejar ${career.currentTeamName}? Te quedas sin equipo y buscas otro banquillo.`
              : `Diriges a ${career.currentTeamName}.`
          }}
        </p>
        <span class="flex justify-end gap-2">
          <AppButton
            v-if="confirmingResign"
            size="sm"
            variant="ghost"
            :disabled="resigning"
            @click="confirmingResign = false"
          >
            Seguir en el club
          </AppButton>
          <AppButton
            size="sm"
            :variant="confirmingResign ? 'danger' : 'secondary'"
            :disabled="resigning"
            @click="resign"
          >
            {{ confirmingResign ? 'Confirmar dimisión' : 'Dimitir' }}
          </AppButton>
        </span>
      </div>

      <div v-if="career.canLeaveNational" class="flex flex-col gap-2 bg-tv-cell px-3 py-2">
        <p class="text-sm">
          {{
            confirmingLeave
              ? `¿Dejar ${career.nationalTeamName}? El club no se toca.`
              : `Diriges a ${career.nationalTeamName}.`
          }}
        </p>
        <span class="flex justify-end gap-2">
          <AppButton
            v-if="confirmingLeave"
            size="sm"
            variant="ghost"
            :disabled="resigning"
            @click="confirmingLeave = false"
          >
            Seguir con la selección
          </AppButton>
          <AppButton
            size="sm"
            :variant="confirmingLeave ? 'danger' : 'secondary'"
            :disabled="resigning"
            @click="leaveNational"
          >
            {{ confirmingLeave ? 'Confirmar' : 'Dejar la selección' }}
          </AppButton>
        </span>
      </div>
    </template>

    <!-- La hoja de servicios: clubes y selecciones dirigidos. Son listas y no
         tablas porque el arnés cuenta las etapas como `li`. -->
    <div v-if="career?.careerMode" class="grid grid-cols-2 items-start gap-4">
      <AppPanel title="Clubes dirigidos" flush>
        <AppEmpty v-if="career.spells.length === 0">Todavía no has dirigido a nadie.</AppEmpty>
        <ul v-else class="flex flex-col gap-[3px] p-[3px] text-sm">
          <li
            v-for="spell in [...career.spells].reverse()"
            :key="`${spell.teamId}-${spell.startSeason}`"
            class="flex min-h-10 items-center gap-3 px-3 py-1.5"
            :class="spell.endSeason === null ? 'bg-tv-select' : 'bg-tv-cell'"
          >
            <TeamBadge :name="spell.teamName" :kit="kitOf(spell.teamId)" :size="24" />
            <span class="font-semibold">{{ spell.teamName }}</span>
            <span class="text-xs" :class="TONE_TEXT.neutral">{{ spellYears(spell) }}</span>
            <AppBadge v-if="spell.endReason === 'dismissed'" tone="bad">
              {{ spellEnd(spell) }}
            </AppBadge>
            <AppBadge v-else-if="spellEnd(spell)">{{ spellEnd(spell) }}</AppBadge>
            <span v-if="spell.titles > 0" class="ml-auto font-bold">
              {{ spell.titles }} {{ spell.titles === 1 ? 'título' : 'títulos' }}
            </span>
          </li>
        </ul>
      </AppPanel>

      <AppPanel title="Selecciones" flush>
        <AppEmpty v-if="career.nationalSpells.length === 0">
          Todavía no has dirigido a ninguna selección.
        </AppEmpty>
        <ul v-else class="flex flex-col gap-[3px] p-[3px] text-sm">
          <li
            v-for="spell in [...career.nationalSpells].reverse()"
            :key="`${spell.teamId}-${spell.startSeason}`"
            class="flex min-h-10 items-center gap-3 px-3 py-1.5"
            :class="spell.endSeason === null ? 'bg-tv-select' : 'bg-tv-cell'"
          >
            <AppFlag :code="spell.teamId.replace('seleccion-', '').toUpperCase()" />
            <span class="font-semibold">{{ spell.teamName }}</span>
            <span class="text-xs" :class="TONE_TEXT.neutral">{{ spellYears(spell) }}</span>
            <AppBadge v-if="spellEnd(spell)">{{ spellEnd(spell) }}</AppBadge>
            <span v-if="spell.titles > 0" class="ml-auto font-bold">
              {{ spell.titles }} {{ spell.titles === 1 ? 'Mundial' : 'Mundiales' }}
            </span>
          </li>
        </ul>
      </AppPanel>
    </div>
  </CoachProfileView>
</template>
