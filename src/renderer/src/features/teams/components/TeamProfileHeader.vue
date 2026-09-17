<script setup lang="ts">
import { computed } from 'vue';
import type { TeamProfile } from '@shared/contracts/teams.contract';
import { matchKits } from '@shared/domain/court';
import { CONFERENCE_LABELS, type Conference } from '@shared/domain/nba';
import { countryName } from '@shared/domain/simulation-scope';
import { toStars } from '@shared/domain/stars';
import {
  AppFlag,
  AppPanel,
  AppRing,
  AppSectionTitle,
  AppStars,
  TONE_TEXT,
  TeamBadge
} from '@renderer/shared/ui';

/**
 * «INFORMACIÓN DEL EQUIPO», a todo el ancho, como IBM (125912): escudo, nombre,
 * país y reputación; la media del equipo en su anillo; la competición con el
 * puesto; el pabellón, y el entrenador.
 *
 * La media es la que ve el ojeador: sin ojeador llega vacía y el anillo enseña
 * la «?». El entrenador es un hueco preparado: hasta que existan los de la IA
 * sólo dice que no hay datos.
 */

const props = defineProps<{ profile: TeamProfile }>();

const kit = computed(() => matchKits(props.profile.teamId, '').home);

const place = computed(() => {
  const standing = props.profile.standing;
  if (!standing) {
    return props.profile.tier === 1 ? 'Primera categoría' : `Categoría ${props.profile.tier}`;
  }
  // En la liga americana el puesto es el de la conferencia: «de 30» no cuadraría.
  if (standing.conferenceRank != null && standing.conference) {
    const conference = CONFERENCE_LABELS[standing.conference as Conference] ?? 'su conferencia';
    return `${standing.conferenceRank}º de la ${conference}`;
  }
  return `${standing.position}º de ${props.profile.leagueTeams}`;
});

const capacity = computed(() => props.profile.pavilionCapacity.toLocaleString('es-ES'));
</script>

<template>
  <AppPanel title="Información del equipo">
    <div
      class="grid grid-cols-[minmax(0,1.7fr)_auto_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)] gap-[3px]"
    >
      <div class="flex min-w-0 items-center gap-4 bg-tv-cell px-4 py-2">
        <TeamBadge :name="profile.name" :kit="kit" :size="64" />
        <div class="flex min-w-0 flex-col gap-1">
          <h1 class="truncate text-xl font-bold uppercase" :title="profile.name">
            {{ profile.name }}
          </h1>
          <span class="flex min-w-0 items-center gap-2 text-sm">
            <AppFlag :code="profile.country" :label="countryName(profile.country)" size="md" />
            <span class="truncate">{{ profile.city }} · {{ countryName(profile.country) }}</span>
          </span>
          <span class="flex items-center gap-2 text-xs font-bold uppercase tracking-wide">
            Reputación
            <AppStars :value="toStars(profile.reputation)" label="Reputación" :size="13" />
          </span>
        </div>
      </div>

      <div class="flex flex-col items-center justify-center gap-0.5 bg-tv-cell px-5 py-2">
        <AppRing
          :value="profile.overall"
          :unknown="profile.overall === null"
          label="Media"
          :size="56"
        />
        <span
          v-if="profile.overall !== null && profile.uncertainty > 0"
          class="figure text-xs font-bold"
          :class="TONE_TEXT.warn"
          :title="`Lo que ha visto tu ojeador: ±${profile.uncertainty} en cada atributo`"
        >
          ±{{ profile.uncertainty }}
        </span>
      </div>

      <div class="flex min-w-0 flex-col bg-tv-cell">
        <AppSectionTitle size="xs">Competición</AppSectionTitle>
        <div class="flex flex-1 flex-col items-center justify-center gap-1 px-3 py-2 text-center">
          <span class="line-clamp-2 font-bold uppercase" :title="profile.competitionName">
            {{ profile.competitionName }}
          </span>
          <span class="figure text-sm text-tv-muted">{{ place }}</span>
        </div>
      </div>

      <div class="flex min-w-0 flex-col bg-tv-cell">
        <AppSectionTitle size="xs">Pabellón</AppSectionTitle>
        <div class="flex flex-1 flex-col items-center justify-center gap-1 px-3 py-2 text-center">
          <span class="line-clamp-2 font-semibold" :title="profile.pavilionName">
            {{ profile.pavilionName }}
          </span>
          <span class="figure text-sm text-tv-muted">{{ capacity }} espectadores</span>
        </div>
      </div>

      <div class="flex min-w-0 flex-col bg-tv-cell">
        <AppSectionTitle size="xs">Entrenador</AppSectionTitle>
        <div class="flex flex-1 items-center justify-center gap-2 px-3 py-2 text-center">
          <template v-if="profile.coach">
            <AppFlag :code="profile.coach.nationality" size="md" />
            <span class="truncate font-semibold">{{ profile.coach.name }}</span>
          </template>
          <span v-else class="text-sm text-tv-muted">Sin datos</span>
        </div>
      </div>
    </div>
  </AppPanel>
</template>
