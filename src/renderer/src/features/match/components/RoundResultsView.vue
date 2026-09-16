<script setup lang="ts">
/**
 * La jornada, cuando suena la última bocina: todos los resultados con la
 * posición de cada equipo en la tabla y el mejor jugador de la jornada.
 *
 * El partido del usuario va resaltado. La posición sale ya actualizada con la
 * jornada: es la pregunta que uno se hace nada más acabar.
 */
import { matchKits } from '@shared/domain/court';
import type { RoundResults } from '@shared/contracts/match.contract';
import { AppAvatar, AppFlag } from '@renderer/shared/ui';
import BroadcastButton from './BroadcastButton.vue';
import TeamBadge from './TeamBadge.vue';

defineProps<{ results: RoundResults; busy: boolean }>();
const emit = defineEmits<{ continue: [] }>();

function kitOf(teamId: string) {
  return matchKits(teamId, '').home;
}

const MVP_STATS = [
  { key: 'points', label: 'Pts' },
  { key: 'rebounds', label: 'Reb' },
  { key: 'assists', label: 'Asi' },
  { key: 'steals', label: 'Rec' },
  { key: 'blocks', label: 'Tap' },
  { key: 'efficiency', label: 'Val' }
] as const;
</script>

<template>
  <div class="flex min-h-full flex-col">
    <header class="grid grid-cols-[1fr_auto_1fr] items-center bg-black/85 px-6 py-4">
      <span></span>
      <div class="text-center">
        <p class="text-2xl font-bold uppercase">Resultados</p>
        <p class="text-xl font-bold uppercase">{{ results.competitionName }}</p>
      </div>
      <div class="flex justify-end">
        <BroadcastButton arrow="single" class="min-w-48" :disabled="busy" @click="emit('continue')">
          Continuar
        </BroadcastButton>
      </div>
    </header>

    <main class="mx-auto flex w-full max-w-5xl flex-col gap-4 p-6">
      <section class="shadow-2xl shadow-black/50" aria-label="Resultados de la jornada">
        <header
          class="grid grid-cols-[6rem_1fr_6rem] bg-tv-800 px-4 py-2 text-sm font-bold uppercase"
        >
          <span>Posición</span>
          <span class="text-center">{{ results.roundLabel }}</span>
          <span class="text-right">Posición</span>
        </header>
        <ul class="flex flex-col gap-1 bg-tv-paper p-2 text-tv-ink">
          <li
            v-for="game in results.games"
            :key="game.gameId"
            class="grid grid-cols-[4rem_1fr_4.5rem_5rem_5rem_4.5rem_1fr_4rem] items-center gap-1"
            :class="game.involvesManaged ? 'bg-sky-200' : 'odd:bg-tv-cell'"
          >
            <span class="figure py-3 text-center text-lg">{{ game.homePosition ?? '' }}</span>
            <span class="truncate text-right text-sm">{{ game.homeTeamName }}</span>
            <span class="flex justify-center bg-white py-1">
              <TeamBadge :name="game.homeTeamName" :kit="kitOf(game.homeTeamId)" :size="44" />
            </span>
            <span class="figure bg-tv-cell py-3 text-center text-2xl font-semibold">
              {{ game.played ? game.homeScore : '-' }}
            </span>
            <span class="figure bg-tv-cell py-3 text-center text-2xl font-semibold">
              {{ game.played ? game.awayScore : '-' }}
            </span>
            <span class="flex justify-center bg-white py-1">
              <TeamBadge :name="game.awayTeamName" :kit="kitOf(game.awayTeamId)" :size="44" />
            </span>
            <span class="truncate text-sm">{{ game.awayTeamName }}</span>
            <span class="figure py-3 text-center text-lg">{{ game.awayPosition ?? '' }}</span>
          </li>
        </ul>
        <p v-if="results.pending > 0" class="bg-tv-900 px-4 py-2 text-center text-sm text-white/80">
          Quedan {{ results.pending }} partidos de la jornada por jugar.
        </p>
      </section>

      <section
        v-if="results.mvp"
        class="grid grid-cols-[11rem_1fr] shadow-2xl shadow-black/50"
        aria-label="MVP de la jornada"
      >
        <div class="flex items-end justify-center bg-tv-paper pt-3">
          <AppAvatar
            kind="player"
            :seed="results.mvp.playerId"
            :name="results.mvp.playerName"
            :size="140"
          />
        </div>
        <div class="flex flex-col bg-tv-paper text-tv-ink">
          <p class="bg-tv-800 py-2 text-center text-sm font-bold uppercase text-white">
            MVP de la jornada
          </p>
          <p class="flex items-center justify-center gap-2 bg-tv-cell py-2 font-semibold uppercase">
            <AppFlag :code="results.mvp.nationality" />
            {{ results.mvp.playerName }}
            <span class="text-sm font-normal normal-case text-tv-muted"
              >· {{ results.mvp.teamName }}</span
            >
          </p>
          <div class="grid grid-cols-[6rem_1fr] items-center gap-4 p-4">
            <TeamBadge :name="results.mvp.teamName" :kit="kitOf(results.mvp.teamId)" :size="84" />
            <dl class="grid grid-cols-6 gap-2 text-center">
              <div v-for="stat in MVP_STATS" :key="stat.key" class="flex flex-col gap-1">
                <dt class="bg-tv-800 py-1.5 text-sm font-bold uppercase text-white">
                  {{ stat.label }}
                </dt>
                <dd class="figure bg-tv-cell py-3 text-2xl">{{ results.mvp[stat.key] }}</dd>
              </div>
            </dl>
          </div>
        </div>
      </section>
    </main>
  </div>
</template>
