<script setup lang="ts">
/**
 * El día elegido del calendario, a la derecha de la rejilla (IBM, 130405): la
 * competición y la ronda en su color, los dos equipos con su escudo y su
 * marcador, dónde se juega, los enlaces al rival y al acta, lo que pasa ese día
 * y, abajo, la leyenda de colores.
 *
 * Va sobre el marco: es un panel entero.
 */
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import type {
  CalendarDayEvent,
  CalendarGame,
  CalendarTeam
} from '@shared/contracts/calendar.contract';
import { COMPETITION_KINDS, COMPETITION_KIND_LABEL } from '@shared/domain/competition-kind';
import { matchKits } from '@shared/domain/court';
import {
  AppButton,
  AppEmpty,
  AppPanel,
  AppSectionTitle,
  COMPETITION_BAND,
  COMPETITION_FILL,
  ResultBlock,
  TONE_FILL,
  TeamBadge
} from '@renderer/shared/ui';

const props = defineProps<{
  day: number;
  games: readonly CalendarGame[];
  events: readonly CalendarDayEvent[];
}>();

const router = useRouter();

const TITLE = new Intl.DateTimeFormat('es-ES', {
  timeZone: 'UTC',
  weekday: 'long',
  day: 'numeric',
  month: 'short',
  year: 'numeric'
});

const title = computed(() => TITLE.format(new Date(props.day)).replace('.', ''));

interface Row {
  team: CalendarTeam;
  score: number | null;
  mine: boolean;
}

/** Local arriba y visitante abajo, como se lee un partido. */
function rows(game: CalendarGame): Row[] {
  const home = game.side === 'home' ? game.team : game.rival;
  const away = game.side === 'home' ? game.rival : game.team;
  return [
    { team: home, score: game.homeScore, mine: game.side === 'home' },
    { team: away, score: game.awayScore, mine: game.side === 'away' }
  ];
}

function where(game: CalendarGame): string {
  if (game.neutralVenue) {
    return game.venue ? `Sede neutral · ${game.venue}` : 'Sede neutral';
  }
  return `${game.side === 'home' ? 'En casa' : 'Fuera'} · ${game.venue}`;
}

/** El marcador del usuario primero, que es lo que dice la «V» o la «D». */
function ownScore(game: CalendarGame): readonly [number, number] | null {
  if (game.homeScore === null || game.awayScore === null) return null;
  return game.side === 'home' ? [game.homeScore, game.awayScore] : [game.awayScore, game.homeScore];
}
</script>

<template>
  <AppPanel :title="title" scroll flush>
    <div class="flex flex-col gap-3 p-3">
      <article v-for="game in games" :key="game.gameId" class="flex flex-col gap-[3px]">
        <header :class="COMPETITION_BAND[game.kind]" class="px-3 py-1.5 text-center">
          <p class="truncate text-sm font-bold uppercase tracking-wide">
            {{ game.competitionName }}
          </p>
          <p class="truncate text-xs font-semibold uppercase">{{ game.roundLabel }}</p>
        </header>

        <ul class="flex flex-col gap-[3px]">
          <li
            v-for="row in rows(game)"
            :key="row.team.teamId"
            class="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 px-2 py-1"
            :class="row.mine ? 'bg-tv-select' : 'bg-tv-cell'"
          >
            <TeamBadge
              :name="row.team.name"
              :kit="matchKits(row.team.teamId, '').home"
              :nation-of="row.team.nationOf"
              :size="32"
            />
            <span class="truncate text-sm font-semibold uppercase" :title="row.team.name">
              {{ row.team.name }}
            </span>
            <span class="figure min-w-8 text-right text-lg font-bold">
              {{ game.played ? row.score : '-' }}
            </span>
          </li>
        </ul>

        <p class="flex items-center justify-between gap-2 bg-tv-cell px-2 py-1 text-xs">
          <span class="truncate text-tv-muted" :title="where(game)">{{ where(game) }}</span>
          <ResultBlock
            v-if="game.played && game.won !== null"
            :won="game.won"
            :score="ownScore(game)"
            size="sm"
          />
        </p>
        <p v-if="game.played && game.overtimes > 0" class="px-2 text-xs text-tv-muted">
          Con {{ game.overtimes }} prórroga{{ game.overtimes > 1 ? 's' : '' }}
        </p>

        <div class="mt-1 flex flex-wrap justify-end gap-2">
          <!-- La ficha es de clubes: una selección no la tiene. -->
          <AppButton
            v-if="!game.rival.nationOf"
            size="sm"
            @click="router.push({ name: 'team-profile', params: { teamId: game.rival.teamId } })"
          >
            Ver rival
          </AppButton>
          <AppButton
            v-if="game.played"
            size="sm"
            variant="primary"
            @click="router.push({ name: 'match', params: { gameId: game.gameId } })"
          >
            Ver acta
          </AppButton>
        </div>
      </article>

      <section v-if="events.length > 0" aria-label="Lo que pasa este día">
        <AppSectionTitle size="xs">Este día</AppSectionTitle>
        <ul class="mt-[3px] flex flex-col gap-[3px] text-xs">
          <li
            v-for="event in events"
            :key="event.kind"
            class="flex items-center gap-2 bg-tv-cell px-2 py-1"
          >
            <span class="h-1.5 w-1.5 shrink-0" :class="TONE_FILL.accent" aria-hidden="true"></span>
            {{ event.label }}
          </li>
        </ul>
      </section>

      <AppEmpty v-if="games.length === 0 && events.length === 0">
        Nada este día: ni partido ni citas del club.
      </AppEmpty>

      <section aria-label="Leyenda de colores">
        <AppSectionTitle size="xs">Competiciones</AppSectionTitle>
        <ul class="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
          <li v-for="kind in COMPETITION_KINDS" :key="kind" class="flex items-center gap-2">
            <span
              class="h-3 w-3 shrink-0"
              :class="COMPETITION_FILL[kind]"
              aria-hidden="true"
            ></span>
            {{ COMPETITION_KIND_LABEL[kind] }}
          </li>
        </ul>
      </section>
    </div>
  </AppPanel>
</template>
