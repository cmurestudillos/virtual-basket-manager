<script setup lang="ts">
import { computed } from 'vue';
import type { TeamProfile, TeamProfileGame } from '@shared/contracts/teams.contract';
import { injuryLabel } from '@shared/domain/injuries';
import {
  AppEmpty,
  AppPanel,
  AppSectionTitle,
  AppStat,
  LeaderCard,
  PlayerName,
  PositionChip,
  ResultBlock,
  TONE_TEXT
} from '@renderer/shared/ui';
import GameRow from '@renderer/features/competition/components/GameRow.vue';

/**
 * El resumen de la ficha: cómo va la temporada, la racha y lo que se le pide; el
 * cara a cara con el club del usuario y el palmarés; y a la derecha, sus líderes
 * y quién está lesionado. En tres columnas para que quepa en 1280×720 sin
 * desplazar la pantalla.
 */

const props = defineProps<{ profile: TeamProfile; games: readonly TeamProfileGame[] }>();

const DECIMAL = new Intl.NumberFormat('es-ES', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1
});

const place = computed(() => {
  const standing = props.profile.standing;
  return standing ? `${standing.conferenceRank ?? standing.position}º` : '-';
});

const record = computed(() => {
  const standing = props.profile.standing;
  return standing ? `${standing.won}-${standing.lost}` : '-';
});

/**
 * Contra el usuario todos los partidos del cara a cara son suyos: sin resaltar.
 * En el club propio no hay cara a cara y en su sitio van los próximos partidos.
 */
const headToHeadGames = computed(() =>
  (props.profile.headToHead?.games ?? []).map((game) => ({ ...game, involvesManaged: false }))
);
const upcoming = computed(() => props.games.filter((game) => !game.played).slice(0, 4));

const injured = computed(() => props.profile.squad.filter((player) => player.injuryDaysLeft > 0));
</script>

<template>
  <div class="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)_minmax(0,1fr)] gap-4">
    <div class="flex min-h-0 flex-col gap-4">
      <AppPanel title="Temporada" :hint="profile.competitionName">
        <AppEmpty v-if="!profile.season && !profile.standing">
          Su liga todavía no ha echado a andar.
        </AppEmpty>
        <div v-else class="grid grid-cols-3 gap-3">
          <!-- Sin letra pequeña: con ella las tres columnas no caben en 1280×720. -->
          <AppStat label="Puesto" size="md">{{ place }}</AppStat>
          <AppStat label="Balance" size="md">{{ record }}</AppStat>
          <AppStat label="Partidos" size="md">{{ profile.season?.games ?? 0 }}</AppStat>
          <AppStat label="Anotados" size="md">
            {{ profile.season ? DECIMAL.format(profile.season.points) : '-' }}
          </AppStat>
          <AppStat label="Encajados" size="md">
            {{ profile.season ? DECIMAL.format(profile.season.pointsAgainst) : '-' }}
          </AppStat>
          <AppStat label="Valoración" size="md">
            {{ profile.season ? DECIMAL.format(profile.season.efficiency) : '-' }}
          </AppStat>
        </div>
      </AppPanel>

      <AppPanel title="Forma" hint="Últimos cinco">
        <div class="flex flex-col gap-3">
          <p v-if="profile.form.length === 0" class="text-center text-sm text-tv-muted">
            Todavía no ha jugado ningún partido este curso.
          </p>
          <ul v-else class="flex justify-center gap-3">
            <li v-for="result in profile.form" :key="result.gameId">
              <RouterLink
                :to="{ name: 'match', params: { gameId: result.gameId } }"
                class="flex outline-tv-blue hover:outline-2"
                :title="`${result.home ? 'En casa contra' : 'En casa de'} ${result.rivalTeamName}`"
              >
                <ResultBlock :won="result.won" :score="result.score" size="sm" placement="below" />
              </RouterLink>
            </li>
          </ul>
          <div class="flex items-center justify-between gap-3 bg-tv-cell px-3 py-1.5 text-sm">
            <span class="font-semibold">Objetivo</span>
            <span class="text-right">{{ profile.objective.label }}</span>
          </div>
        </div>
      </AppPanel>
    </div>

    <div class="flex min-h-0 flex-col gap-4">
      <AppPanel v-if="profile.headToHead" title="Cara a cara" hint="Contra tu club, de siempre">
        <div class="flex flex-col gap-3">
          <div class="grid grid-cols-3 gap-3">
            <AppStat label="Jugados" size="md">
              {{ profile.headToHead.played }}
            </AppStat>
            <AppStat
              label="Tuyos"
              size="md"
              :tone="profile.headToHead.managedWins > profile.headToHead.teamWins ? 'good' : null"
            >
              {{ profile.headToHead.managedWins }}
            </AppStat>
            <AppStat
              label="Suyos"
              size="md"
              :tone="profile.headToHead.teamWins > profile.headToHead.managedWins ? 'bad' : null"
            >
              {{ profile.headToHead.teamWins }}
            </AppStat>
          </div>
          <AppSectionTitle size="xs">Este curso</AppSectionTitle>
          <p v-if="headToHeadGames.length === 0" class="text-center text-sm text-tv-muted">
            Este curso no os toca jugar.
          </p>
          <ul v-else class="flex flex-col gap-[3px]">
            <GameRow v-for="game in headToHeadGames" :key="game.gameId" :game="game" compact />
          </ul>
        </div>
      </AppPanel>

      <AppPanel v-else title="Próximos partidos">
        <AppEmpty v-if="upcoming.length === 0">No queda ningún partido por jugar.</AppEmpty>
        <ul v-else class="flex flex-col gap-[3px]">
          <GameRow v-for="game in upcoming" :key="game.gameId" :game="game" compact />
        </ul>
      </AppPanel>

      <AppPanel title="Palmarés" :hint="profile.totalTrophies ? `${profile.totalTrophies}` : ''">
        <p v-if="profile.trophies.length === 0" class="text-center text-sm text-tv-muted">
          Ningún título en esta partida. Todavía.
        </p>
        <ul v-else class="flex flex-col gap-[3px]">
          <li
            v-for="trophy in profile.trophies"
            :key="trophy.competitionId"
            class="flex items-center gap-3 bg-tv-cell px-3 py-1 text-sm"
          >
            <span class="figure min-w-8 bg-tv-box py-0.5 text-center font-bold">
              {{ trophy.seasons.length }}
            </span>
            <span class="flex min-w-0 flex-col leading-tight">
              <span class="truncate font-semibold">{{ trophy.competitionName }}</span>
              <span class="truncate text-xs text-tv-muted">{{ trophy.years.join(', ') }}</span>
            </span>
          </li>
        </ul>
      </AppPanel>
    </div>

    <div class="flex min-h-0 flex-col gap-4">
      <AppPanel title="Líderes">
        <p v-if="profile.leaders.length === 0" class="text-center text-sm text-tv-muted">
          Los líderes salen con el primer partido jugado.
        </p>
        <div v-else class="flex flex-col gap-[3px]">
          <RouterLink
            v-for="leader in profile.leaders"
            :key="leader.category"
            :to="{ name: 'player', params: { playerId: leader.playerId } }"
            class="block outline-tv-blue hover:outline-2"
          >
            <LeaderCard
              :label="leader.label"
              :name="leader.playerName"
              :seed="leader.playerId"
              :nationality="leader.nationality"
              :value="DECIMAL.format(leader.value)"
              :note="`Partidos jugados: ${leader.games}`"
              name-mode="initial"
            />
          </RouterLink>
        </div>
      </AppPanel>

      <AppPanel title="Lesionados" :hint="injured.length ? `${injured.length}` : ''">
        <p v-if="injured.length === 0" class="text-center text-sm text-tv-muted">
          Nadie en la enfermería.
        </p>
        <ul v-else class="flex flex-col gap-[3px]">
          <li
            v-for="player in injured"
            :key="player.id"
            class="flex items-center gap-2 bg-tv-cell px-2 py-1 text-sm"
          >
            <PositionChip :position="player.position" />
            <RouterLink
              :to="{ name: 'player', params: { playerId: player.id } }"
              class="min-w-0 flex-1 truncate hover:text-tv-blue-ink"
            >
              <PlayerName :first="player.firstName" :last="player.lastName" />
            </RouterLink>
            <span
              class="shrink-0 text-xs font-bold"
              :class="TONE_TEXT.bad"
              :title="player.injuryName ?? ''"
            >
              {{ injuryLabel(player.injuryDaysLeft) }}
            </span>
          </li>
        </ul>
      </AppPanel>
    </div>
  </div>
</template>
