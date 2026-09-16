<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import type { FixtureEntry, LeagueEntry, StandingEntry } from '@shared/contracts/season.contract';
import { STANDING_ZONE_LABELS, type StandingZone } from '@shared/domain/promotion';
import { AppButton, AppPageHeader, AppTabs } from '@renderer/shared/ui';
import { useSeasonStore } from '@renderer/features/season/season.store';
import { formatMatchDate } from '@renderer/shared/format';
import PlayoffBracketView from '@renderer/features/competition/components/PlayoffBracketView.vue';
import CupBracketView from '@renderer/features/competition/components/CupBracketView.vue';
import ContinentalView from '@renderer/features/competition/components/ContinentalView.vue';
import DraftBoard from '@renderer/features/competition/components/DraftBoard.vue';
import { CONFERENCE_LABELS, type Conference } from '@shared/domain/nba';

const seasonStore = useSeasonStore();

type Tab = 'standings' | 'fixtures' | 'cup' | 'continental' | 'playoffs' | 'draft';
const tab = ref<Tab>('standings');
const standings = ref<StandingEntry[]>([]);
const fixtures = ref<FixtureEntry[]>([]);
const round = ref(1);
const leagues = ref<LeagueEntry[]>([]);
/** División que se está mirando; arranca en la del equipo del usuario. */
const league = ref<string | null>(null);
/** País que se está mirando: con varios países jugándose, primero se elige país. */
const country = ref<string | null>(null);

const selectedLeague = computed(() =>
  leagues.value.find((row) => row.competitionId === league.value)
);

/**
 * La tabla, de una pieza o por conferencias: en la liga NBA cada conferencia se
 * lee aparte, con su puesto y su división.
 */
const standingGroups = computed(() => {
  if (!selectedLeague.value?.nbaFormat) {
    return [{ title: null as string | null, rows: standings.value }];
  }
  return (['east', 'west'] as Conference[]).map((conference) => ({
    title: CONFERENCE_LABELS[conference] as string | null,
    rows: standings.value
      .filter((row) => row.conference === conference)
      .sort((a, b) => (a.conferenceRank ?? 99) - (b.conferenceRank ?? 99))
  }));
});

/** Sólo se pintan las zonas que esa división tiene de verdad. */
const zonesShown = computed(() => {
  const seen = new Set<StandingZone>(standings.value.map((row) => row.zone));
  return (['playoffs', 'playIn', 'promotion', 'relegation'] as const).filter((zone) =>
    seen.has(zone)
  );
});

const ZONE_CLASSES: Record<Exclude<StandingZone, null>, string> = {
  playoffs: 'border-ball-500',
  playIn: 'border-sky-500',
  promotion: 'border-emerald-500',
  relegation: 'border-red-500'
};

/**
 * Las pestañas de la pantalla.
 *
 * En segunda no hay cuadro que enseñar: lo que se juega allí es subir, y una
 * pestaña de playoffs siempre vacía sólo confunde.
 */
const hasPlayoffs = computed(() => (selectedLeague.value?.playoffTeams ?? 0) >= 2);
const countryOptions = computed(() => {
  const seen = new Map<string, string>();
  for (const row of leagues.value) {
    if (!seen.has(row.country)) {
      seen.set(row.country, row.countryName);
    }
  }
  const home = leagues.value.find((row) => row.isManaged)?.country;
  return [...seen.entries()].map(([id, label]) => ({
    id,
    label,
    hint: id === home ? ' · tu país' : ''
  }));
});
const leagueOptions = computed(() =>
  leagues.value
    .filter((row) => row.country === country.value)
    .map((row) => ({
      id: row.competitionId,
      label: row.name,
      hint: row.isManaged ? ' · tu liga' : ''
    }))
);

const tabs = computed(() => [
  { id: 'standings' as Tab, label: 'Clasificación' },
  { id: 'fixtures' as Tab, label: 'Calendario' },
  { id: 'cup' as Tab, label: 'Copa' },
  { id: 'continental' as Tab, label: 'Continental' },
  ...(hasPlayoffs.value ? [{ id: 'playoffs' as Tab, label: 'Playoffs' }] : []),
  ...(selectedLeague.value?.nbaFormat ? [{ id: 'draft' as Tab, label: 'Draft' }] : [])
]);

const totalRounds = computed(() => selectedLeague.value?.totalRounds || 34);
const roundDate = computed(() => fixtures.value[0]?.scheduledOn ?? null);

onMounted(async () => {
  await seasonStore.refresh();
  // Se abre en la jornada en curso, no en la primera: es la que interesa. Y con
  // la liga regular acabada, en el cuadro, que es donde está el juego.
  round.value = seasonStore.season?.currentRound ?? 1;
  leagues.value = await window.api.season.listLeagues();
  const managed = leagues.value.find((row) => row.isManaged);
  country.value = managed?.country ?? null;
  league.value = managed?.competitionId ?? null;
  if (seasonStore.season && seasonStore.season.stage !== 'regular' && hasPlayoffs.value) {
    tab.value = 'playoffs';
  }
  // La clasificación y la jornada las carga el watch de la liga.
});

watch(round, loadRound);
watch(league, async () => {
  // Otra liga, otro calendario: se abre en su jornada en curso.
  round.value = selectedLeague.value?.currentRound ?? 1;
  if (
    (tab.value === 'playoffs' && !hasPlayoffs.value) ||
    (tab.value === 'draft' && !selectedLeague.value?.nbaFormat)
  ) {
    tab.value = 'standings';
  }
  await loadStandings();
  await loadRound();
});

/** Al cambiar de país se mira su primera división. */
function selectCountry(code: string): void {
  country.value = code;
  league.value =
    leagues.value.find((row) => row.country === code && row.isManaged)?.competitionId ??
    leagues.value.find((row) => row.country === code)?.competitionId ??
    null;
}

async function loadStandings(): Promise<void> {
  standings.value = await window.api.season.getStandings(league.value ?? undefined);
}

async function loadRound(): Promise<void> {
  fixtures.value = await window.api.season.listFixtures(round.value, league.value ?? undefined);
}

function stepRound(delta: number): void {
  round.value = Math.min(totalRounds.value, Math.max(1, round.value + delta));
}

function streakLabel(streak: number): string {
  if (streak === 0) return '—';
  return `${streak > 0 ? 'V' : 'D'}${Math.abs(streak)}`;
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <AppPageHeader :title="selectedLeague?.name ?? seasonStore.season?.competitionName ?? 'Liga'">
      <span v-if="selectedLeague?.stage === 'regular'" class="text-sm text-court-300">
        Jornada {{ selectedLeague.currentRound }} de {{ totalRounds }}
      </span>
      <span
        v-else-if="selectedLeague?.championTeamName && tab !== 'playoffs'"
        class="text-sm text-court-300"
      >
        Campeón: <span class="text-ball-400">{{ selectedLeague.championTeamName }}</span>
      </span>
      <span v-else-if="selectedLeague" class="text-sm text-ball-400">Playoffs</span>
    </AppPageHeader>

    <!-- Con varios países jugándose, primero el país y luego la división. -->
    <div v-if="countryOptions.length > 1 || leagueOptions.length > 1" class="flex flex-col gap-2">
      <AppTabs
        v-if="countryOptions.length > 1"
        :model-value="country ?? ''"
        :options="countryOptions"
        variant="pills"
        @update:model-value="selectCountry($event)"
      />
      <AppTabs
        v-if="leagueOptions.length > 1 && tab !== 'cup' && tab !== 'continental'"
        :model-value="league ?? ''"
        :options="leagueOptions"
        variant="pills"
        @update:model-value="league = $event"
      />
    </div>

    <AppTabs :model-value="tab" :options="tabs" @update:model-value="tab = $event as Tab" />

    <div v-if="tab === 'standings'" class="flex flex-col gap-3">
      <div
        v-for="group in standingGroups"
        :key="group.title ?? 'liga'"
        class="overflow-auto rounded border border-court-700"
      >
        <p v-if="group.title" class="border-b border-court-700 bg-court-900 px-4 py-2 text-sm">
          {{ group.title }}
        </p>
        <table class="data-table">
          <thead>
            <tr>
              <th class="numeric">#</th>
              <th>Equipo</th>
              <th v-if="group.title">División</th>
              <th class="numeric">J</th>
              <th class="numeric">G</th>
              <th class="numeric">P</th>
              <th class="numeric">PF</th>
              <th class="numeric">PC</th>
              <th class="numeric">Dif</th>
              <th class="numeric">Racha</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="row in group.rows"
              :key="row.teamId"
              :class="row.isManaged ? 'bg-court-800 text-ball-400' : ''"
            >
              <td
                class="numeric border-l-4"
                :class="row.zone ? ZONE_CLASSES[row.zone] : 'border-transparent'"
              >
                {{ row.conferenceRank ?? row.position }}
              </td>
              <td>{{ row.teamName }}</td>
              <td v-if="group.title" class="text-court-300">{{ row.division }}</td>
              <td class="numeric">{{ row.played }}</td>
              <td class="numeric font-semibold">{{ row.won }}</td>
              <td class="numeric">{{ row.lost }}</td>
              <td class="numeric text-court-300">{{ row.pointsFor }}</td>
              <td class="numeric text-court-300">{{ row.pointsAgainst }}</td>
              <td class="numeric" :class="row.pointsDifference >= 0 ? 'text-good-400' : ''">
                {{ row.pointsDifference > 0 ? '+' : '' }}{{ row.pointsDifference }}
              </td>
              <td class="numeric text-court-300">{{ streakLabel(row.streak) }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <ul v-if="zonesShown.length > 0" class="flex gap-4 text-xs text-court-300">
        <li v-for="zone in zonesShown" :key="zone" class="flex items-center gap-2">
          <span class="h-3 w-1 rounded-sm border-l-4" :class="ZONE_CLASSES[zone]"></span>
          {{ STANDING_ZONE_LABELS[zone] }}
        </li>
      </ul>
    </div>

    <DraftBoard v-else-if="tab === 'draft'" />

    <CupBracketView
      v-else-if="tab === 'cup'"
      :key="`cup-${country}`"
      :country="country ?? undefined"
    />

    <ContinentalView v-else-if="tab === 'continental'" />

    <PlayoffBracketView
      v-else-if="tab === 'playoffs'"
      :key="`playoffs-${league}`"
      :competition-id="league ?? undefined"
    />

    <div v-else class="flex flex-col gap-3">
      <div class="flex items-center gap-3">
        <AppButton size="sm" @click="stepRound(-1)">‹</AppButton>
        <span class="text-sm">
          Jornada {{ round }}
          <span v-if="roundDate" class="text-court-300"> · {{ formatMatchDate(roundDate) }}</span>
        </span>
        <AppButton size="sm" @click="stepRound(1)">›</AppButton>
      </div>

      <ul class="flex flex-col gap-1">
        <li
          v-for="fixture in fixtures"
          :key="fixture.gameId"
          class="grid grid-cols-[1fr_6rem_1fr] items-center gap-3 rounded border border-court-700 px-4 py-2 text-sm"
          :class="fixture.involvesManaged ? 'border-ball-600' : ''"
        >
          <span class="text-right">{{ fixture.homeTeamName }}</span>
          <RouterLink
            v-if="fixture.played"
            :to="{ name: 'match', params: { gameId: fixture.gameId } }"
            class="text-center font-semibold tabular-nums hover:text-ball-400"
          >
            {{ fixture.homeScore }} - {{ fixture.awayScore }}
            <span v-if="fixture.overtimes > 0" class="text-xs text-court-300">
              ({{ fixture.overtimes }} pr)
            </span>
          </RouterLink>
          <span v-else class="text-center text-court-600">—</span>
          <span>{{ fixture.awayTeamName }}</span>
        </li>
      </ul>
    </div>
  </div>
</template>
