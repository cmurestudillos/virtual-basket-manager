<script setup lang="ts">
/**
 * La previa, en tres pantallas seguidas como en IBM: los dos cincos cara a
 * cara con su media, los jugadores de referencia de cada equipo y cómo llegan
 * los dos equipos. Detrás, el pabellón vacío en 3D.
 *
 * Se pasa con «Continuar»; quien tenga prisa se la salta entera de una vez.
 */
import { computed, defineAsyncComponent, ref } from 'vue';
import { formatWhole } from '@renderer/shared/format';
import type {
  MatchPreview,
  MatchPreviewAverages,
  MatchPreviewTeam,
  MatchScouting
} from '@shared/contracts/match.contract';
import type { CourtSide, Kit } from '@shared/domain/court';
import {
  AppAvatar,
  AppBackdrop,
  AppButton,
  AppFlag,
  AppRing,
  PlayerName,
  PositionChip,
  TeamBadge
} from '@renderer/shared/ui';

const ArenaBackdrop = defineAsyncComponent(() => import('./ArenaBackdrop.vue'));

const props = defineProps<{
  preview: MatchPreview;
  kits: Record<CourtSide, Kit>;
  managedSide: CourtSide | null;
  scouting: MatchScouting | null;
}>();

const emit = defineEmits<{ done: [] }>();

const STEPS = ['starters', 'leaders', 'teams'] as const;
const step = ref(0);
const arenaFailed = ref(false);

const sides = computed(() => [
  { side: 'home' as const, team: props.preview.home },
  { side: 'away' as const, team: props.preview.away }
]);

function next(): void {
  if (step.value < STEPS.length - 1) {
    step.value += 1;
  } else {
    emit('done');
  }
}

function figure(averages: MatchPreviewAverages | null, key: keyof MatchPreviewAverages): string {
  return averages ? String(averages[key]).replace('.', ',') : '-';
}

const LEADER_ROWS: { key: keyof MatchPreviewAverages; label: string }[] = [
  { key: 'points', label: 'Puntos / partido' },
  { key: 'rebounds', label: 'Rebotes / partido' },
  { key: 'assists', label: 'Asistencias / partido' },
  { key: 'efficiency', label: 'Valoración / partido' }
];

const TEAM_ROWS: { key: keyof MatchPreviewAverages; label: string }[] = [
  { key: 'points', label: 'Puntos / partido' },
  { key: 'rebounds', label: 'Rebotes / partido' },
  { key: 'assists', label: 'Asistencias / partido' },
  { key: 'steals', label: 'Recuperaciones / partido' }
];

function keyPlayerOf(team: MatchPreviewTeam) {
  return team.keyPlayer;
}
</script>

<template>
  <div class="relative h-full min-h-[40rem] overflow-hidden bg-tv-950 text-white">
    <ArenaBackdrop
      v-if="!arenaFailed"
      :home-kit="kits.home"
      :away-kit="kits.away"
      @failed="arenaFailed = true"
    />
    <AppBackdrop v-else class="absolute inset-0" />

    <div class="relative flex h-full flex-col">
      <!-- Cabecera: competición, cruce y pabellón -->
      <header
        class="grid grid-cols-[1fr_auto_1fr] items-stretch bg-tv-900/95 shadow-lg shadow-black/50"
      >
        <div class="flex items-center gap-4 px-5">
          <RouterLink
            :to="{ name: 'dashboard' }"
            class="text-xs font-semibold uppercase tracking-wide text-white/70 hover:text-white"
          >
            ‹ Volver al club
          </RouterLink>
        </div>
        <div class="flex items-center gap-6 py-2">
          <div class="bg-white p-1">
            <TeamBadge
              :name="preview.home.teamName"
              :kit="kits.home"
              :nation-of="preview.home.nationOf"
              :size="60"
            />
          </div>
          <div class="text-center">
            <p class="text-lg font-bold uppercase">{{ preview.competitionName }}</p>
            <p class="text-base font-bold uppercase">{{ preview.roundLabel }}</p>
            <p class="text-sm text-white/80">
              {{ preview.neutralVenue ? 'Sede neutral' : preview.pavilionName }}
              <template v-if="!preview.neutralVenue">
                (aforo {{ formatWhole(preview.pavilionCapacity) }})
              </template>
            </p>
          </div>
          <div class="bg-white p-1">
            <TeamBadge
              :name="preview.away.teamName"
              :kit="kits.away"
              :nation-of="preview.away.nationOf"
              :size="60"
            />
          </div>
        </div>
        <div class="flex items-center justify-end gap-3 px-5">
          <button
            v-if="step < STEPS.length - 1"
            type="button"
            class="text-xs font-semibold uppercase tracking-wide text-white/70 hover:text-white"
            @click="emit('done')"
          >
            Saltar previa
          </button>
          <AppButton variant="primary" arrow="single" class="min-w-44" @click="next">
            Continuar
          </AppButton>
        </div>
      </header>

      <main class="flex flex-1 items-center justify-center p-8">
        <!-- 1. Los dos cincos, cara a cara -->
        <section
          v-if="STEPS[step] === 'starters'"
          class="grid w-full max-w-6xl grid-cols-2 gap-2"
          aria-label="Cinco inicial"
        >
          <div v-for="{ side, team } in sides" :key="side" class="flex flex-col">
            <h2 class="bg-tv-800/95 py-2 text-center text-sm font-bold uppercase tracking-wide">
              {{ team.teamName }}
            </h2>
            <div
              class="grid flex-1 bg-tv-950/70 backdrop-blur-sm"
              :class="side === 'home' ? 'grid-cols-[11rem_1fr]' : 'grid-cols-[1fr_11rem]'"
            >
              <div
                class="flex flex-col items-center justify-center gap-4 bg-tv-paper/95 p-4"
                :class="side === 'away' ? 'order-2' : ''"
              >
                <TeamBadge
                  :name="team.teamName"
                  :kit="kits[side]"
                  :nation-of="team.nationOf"
                  :size="120"
                />
                <RouterLink
                  v-if="managedSide === side"
                  :to="{ name: 'lineup' }"
                  class="bg-tv-blue px-4 py-1.5 text-xs font-bold uppercase text-white hover:brightness-110"
                >
                  Alineación
                </RouterLink>
              </div>
              <ul class="flex flex-col divide-y divide-white/15 px-4">
                <li
                  v-for="player in team.starters"
                  :key="player.playerId"
                  class="flex items-center gap-4 py-2.5"
                  :class="side === 'away' ? 'flex-row-reverse text-right' : ''"
                >
                  <AppAvatar
                    kind="player"
                    :seed="player.playerId"
                    :name="player.playerName"
                    :size="56"
                  />
                  <div class="min-w-0 flex-1">
                    <PlayerName :name="player.playerName" mode="stacked" />
                    <PositionChip :position="player.position" class="mt-1" />
                  </div>
                  <AppRing :value="player.overall" label="" :size="56" class="shrink-0" />
                </li>
              </ul>
            </div>
          </div>
        </section>

        <!-- 2 y 3. Jugadores de referencia y medias de equipo -->
        <section
          v-else
          class="w-full max-w-6xl shadow-2xl shadow-black/60"
          :aria-label="
            STEPS[step] === 'leaders' ? 'Jugadores de referencia' : 'Medias de los equipos'
          "
        >
          <header
            class="grid grid-cols-[1fr_auto_1fr] items-center bg-gradient-to-r from-tv-800 via-tv-700 to-tv-800 px-8 py-4"
          >
            <p class="text-lg font-bold uppercase">{{ preview.competitionName }}</p>
            <p class="text-sm font-bold uppercase tracking-wide text-white/80">
              {{ STEPS[step] === 'leaders' ? 'Jugadores de referencia' : 'Cómo llegan' }}
            </p>
            <p class="text-right text-lg font-bold uppercase">{{ preview.roundLabel }}</p>
          </header>
          <div class="grid grid-cols-[1fr_1.1fr_1fr]">
            <div
              v-for="{ side, team } in sides"
              :key="side"
              class="flex flex-col bg-tv-paper text-tv-ink"
              :class="side === 'away' ? 'order-3' : ''"
            >
              <div class="flex flex-1 items-center justify-center gap-4 p-6">
                <template v-if="STEPS[step] === 'leaders' && keyPlayerOf(team)">
                  <TeamBadge
                    :name="team.teamName"
                    :kit="kits[side]"
                    :nation-of="team.nationOf"
                    :size="72"
                  />
                  <AppAvatar
                    kind="player"
                    :seed="keyPlayerOf(team)!.playerId"
                    :name="keyPlayerOf(team)!.playerName"
                    :size="140"
                  />
                </template>
                <TeamBadge
                  v-else
                  :name="team.teamName"
                  :kit="kits[side]"
                  :nation-of="team.nationOf"
                  :size="150"
                />
              </div>
              <p
                class="flex items-center justify-center gap-2 bg-tv-800 py-2 text-sm font-bold uppercase text-white"
              >
                <template v-if="STEPS[step] === 'leaders' && keyPlayerOf(team)">
                  <AppFlag :code="keyPlayerOf(team)!.nationality" />
                  {{ keyPlayerOf(team)!.playerName }}
                </template>
                <template v-else>{{ team.teamName }}</template>
              </p>
            </div>

            <dl
              class="order-2 grid grid-cols-2 content-center gap-x-1 gap-y-3 bg-tv-950/85 px-3 py-4"
            >
              <template
                v-for="row in STEPS[step] === 'leaders' ? LEADER_ROWS : TEAM_ROWS"
                :key="row.key"
              >
                <template v-for="{ side, team } in sides" :key="`${row.key}-${side}`">
                  <div class="flex flex-col items-center gap-1">
                    <dt class="w-full bg-tv-800 py-1.5 text-center text-xs font-bold uppercase">
                      {{ row.label }}
                    </dt>
                    <dd class="figure text-2xl font-bold">
                      {{
                        figure(
                          STEPS[step] === 'leaders'
                            ? (keyPlayerOf(team)?.averages ?? null)
                            : team.averages,
                          row.key
                        )
                      }}
                    </dd>
                  </div>
                </template>
              </template>
            </dl>
          </div>

          <!-- Lo que ha visto el analista, al pie de las medias. -->
          <p
            v-if="STEPS[step] === 'teams' && scouting"
            class="bg-tv-900 px-6 py-3 text-center text-sm"
          >
            <span class="font-bold uppercase text-tv-amber">Informe del analista:</span>
            {{ scouting.teamName }} juega {{ scouting.offensiveSystem }} en ataque y
            {{ scouting.defensiveSystem }} en defensa · ritmo {{ scouting.pace }} · intensidad
            {{ scouting.defensiveIntensity }}
            <template v-if="scouting.focusPlayerName">
              · van a buscar a {{ scouting.focusPlayerName }}
            </template>
          </p>
          <p
            v-else-if="STEPS[step] === 'teams' && !preview.home.averages && !preview.away.averages"
            class="bg-tv-900 px-6 py-3 text-center text-sm text-white/80"
          >
            Primer partido de la competición: todavía no hay medias.
          </p>
        </section>
      </main>
    </div>
  </div>
</template>
