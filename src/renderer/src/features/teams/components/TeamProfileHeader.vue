<script setup lang="ts">
import { computed } from 'vue';
import { formatWhole } from '@renderer/shared/format';
import type { TeamProfile } from '@shared/contracts/teams.contract';
import { matchKits } from '@shared/domain/court';
import { CONFERENCE_LABELS, type Conference } from '@shared/domain/nba';
import { countryName } from '@shared/domain/simulation-scope';
import { toStars } from '@shared/domain/stars';
import {
  AppAvatar,
  AppFlag,
  AppPanel,
  AppRing,
  AppSectionTitle,
  AppStars,
  TONE_TEXT,
  TeamBadge
} from '@renderer/shared/ui';
import CoachLink from '@renderer/features/coaches/components/CoachLink.vue';
import { coachAvatarSeed } from '@renderer/features/coaches/coach-avatar';

/**
 * «INFORMACIÓN DEL EQUIPO», a todo el ancho, como IBM (125912): escudo, nombre,
 * país y reputación; la media del equipo en su anillo; la competición con el
 * puesto; el pabellón, y el entrenador (cara, bandera, nombre que abre su ficha
 * y reputación en estrellas).
 *
 * La media es la que ve el ojeador: sin ojeador llega vacía y el anillo enseña
 * la «?». El entrenador de un club es público, sea de la IA o el usuario.
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

const capacity = computed(() => formatWhole(props.profile.pavilionCapacity));
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
        <div class="flex flex-1 items-center justify-center gap-3 px-3 py-2">
          <template v-if="profile.coach">
            <AppAvatar
              kind="coach"
              :seed="coachAvatarSeed(profile.coach)"
              :name="profile.coach.name"
              :size="40"
            />
            <div class="flex min-w-0 flex-col gap-1 text-sm">
              <CoachLink
                :id="profile.coach.id"
                :name="profile.coach.name"
                :nationality="profile.coach.nationality"
                :is-manager="profile.coach.isManager"
              />
              <AppStars
                :value="toStars(profile.coach.reputation)"
                label="Reputación del entrenador"
                :size="12"
                class="self-start"
              />
            </div>
          </template>
          <span v-else class="text-sm text-tv-muted">Sin entrenador</span>
        </div>
      </div>
    </div>
  </AppPanel>
</template>
