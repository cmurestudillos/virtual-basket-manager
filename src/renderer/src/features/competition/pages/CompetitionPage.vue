<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import type { FixtureEntry, LeagueEntry, StandingEntry } from '@shared/contracts/season.contract';
import type { RoundMvp } from '@shared/contracts/match.contract';
import { STANDING_ZONE_LABELS } from '@shared/domain/promotion';
import { CONFERENCE_LABELS, type Conference } from '@shared/domain/nba';
import { formatMatchDate } from '@renderer/shared/format';
import { AppEmpty, AppFlag, AppPager, AppPanel, AppSelect, AppTabs } from '@renderer/shared/ui';
import { useSeasonStore } from '@renderer/features/season/season.store';
import PageToolbar from '@renderer/features/app-shell/components/PageToolbar.vue';
import { zoneSwatchClass, zonesIn } from '@renderer/features/competition/standing-zones';
import BestTeamsPanel from '@renderer/features/competition/components/BestTeamsPanel.vue';
import ContinentalView from '@renderer/features/competition/components/ContinentalView.vue';
import CupBracketView from '@renderer/features/competition/components/CupBracketView.vue';
import DraftBoard from '@renderer/features/competition/components/DraftBoard.vue';
import GameRow from '@renderer/features/competition/components/GameRow.vue';
import PlayoffBracketView from '@renderer/features/competition/components/PlayoffBracketView.vue';
import RoundMvpPanel from '@renderer/features/competition/components/RoundMvpPanel.vue';
import StandingsTable from '@renderer/features/competition/components/StandingsTable.vue';

/**
 * Competiciones: la clasificación, la jornada, la Copa, Europa, los playoffs y
 * el draft de la liga que se mire.
 *
 * Como IBM, las pestañas de la pantalla van en la barra de sección, detrás de
 * «Competiciones» y «Estadísticas», y el selector negro de competición a la
 * derecha. Con 21 ligas en 14 países las filas de pastillas no cabían: el
 * selector sí. En la Copa se elige país, que es de lo que va una copa; en
 * Europa, la competición continental (lo pone su propia vista).
 */

const seasonStore = useSeasonStore();

type Tab = 'standings' | 'fixtures' | 'cup' | 'continental' | 'playoffs' | 'draft';
const tab = ref<Tab>('standings');
const standings = ref<StandingEntry[]>([]);
const fixtures = ref<FixtureEntry[]>([]);
const round = ref(1);
const roundMvp = ref<RoundMvp | null>(null);
const leagues = ref<LeagueEntry[]>([]);
/** División que se está mirando; arranca en la del equipo del usuario. */
const league = ref<string | null>(null);
/** País que se está mirando: el de la división elegida, o el elegido en la Copa. */
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

/** Sólo se explican las zonas que esa división tiene de verdad. */
const zonesShown = computed(() => zonesIn(standings.value));

/**
 * Las pestañas de la pantalla.
 *
 * En segunda no hay cuadro que enseñar: lo que se juega allí es subir, y una
 * pestaña de playoffs siempre vacía sólo confunde.
 */
const hasPlayoffs = computed(() => (selectedLeague.value?.playoffTeams ?? 0) >= 2);
const manyCountries = computed(() => new Set(leagues.value.map((row) => row.country)).size > 1);

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
    label: id === home ? `${label} · tu país` : label
  }));
});

/**
 * Todas las divisiones en un selector. Con varios países, cada una lleva el
 * suyo detrás: si no cabe se corta por ahí, que es lo que ya dice la bandera.
 */
const leagueOptions = computed(() =>
  leagues.value.map((row) => {
    const name = manyCountries.value ? `${row.name} · ${row.countryName}` : row.name;
    return {
      id: row.competitionId,
      label: row.isManaged ? `${name} · tu liga` : name,
      // Cerrado, sólo el nombre de la liga: el país ya lo dice la bandera.
      short: row.name
    };
  })
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

/** Dónde va la liga: lo que antes decía la cabecera, ahora en el rótulo de la tabla. */
const leagueStatus = computed(() => {
  const row = selectedLeague.value;
  if (!row) return '';
  if (row.stage === 'regular') return `Jornada ${row.currentRound} de ${totalRounds.value}`;
  if (row.championTeamName) return `Campeón: ${row.championTeamName}`;
  return 'Playoffs';
});

/**
 * Quién descansa en la jornada que se mira: en una liga de número impar, el
 * equipo de la tabla que no sale en ningún partido. En una par no descansa nadie.
 */
const restingTeams = computed(() => {
  if (fixtures.value.length === 0) {
    return [];
  }
  const playing = new Set(fixtures.value.flatMap((row) => [row.homeTeamId, row.awayTeamId]));
  // Al cambiar de liga, la tabla y la jornada se cargan una detrás de otra: si
  // aún son de ligas distintas, mejor no enseñar nada que enseñar a toda la liga.
  const inTable = new Set(standings.value.map((row) => row.teamId));
  if ([...playing].some((teamId) => !inTable.has(teamId))) {
    return [];
  }
  return standings.value.filter((row) => !playing.has(row.teamId));
});

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
  if (selectedLeague.value) {
    country.value = selectedLeague.value.country;
  }
  if (
    (tab.value === 'playoffs' && !hasPlayoffs.value) ||
    (tab.value === 'draft' && !selectedLeague.value?.nbaFormat)
  ) {
    tab.value = 'standings';
  }
  await loadStandings();
  await loadRound();
});

/** Al cambiar de país (en la Copa) se mira también su primera división. */
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

/** Cuenta las cargas de jornada: si se pasan jornadas deprisa, sólo vale la última. */
let roundRequest = 0;

async function loadRound(): Promise<void> {
  const request = ++roundRequest;
  const rows = await window.api.season.listFixtures(round.value, league.value ?? undefined);
  if (request !== roundRequest) return;
  fixtures.value = rows;
  // El MVP sale de las actas de la jornada: sin nada jugado, no hay.
  const played = rows.find((row) => row.played);
  let mvp: RoundMvp | null = null;
  if (played) {
    try {
      mvp = (await window.api.match.roundResults(played.gameId)).mvp;
    } catch {
      // Sin MVP la jornada se lee igual: no merece un error en pantalla.
    }
  }
  if (request === roundRequest) {
    roundMvp.value = mvp;
  }
}
</script>

<template>
  <!-- El título visible es el de la barra de sección; este es para quien no la ve. -->
  <h1 class="sr-only">
    {{ selectedLeague?.name ?? seasonStore.season?.competitionName ?? 'Liga' }}
  </h1>

  <PageToolbar place="tabs">
    <AppTabs :model-value="tab" :options="tabs" @update:model-value="tab = $event as Tab" />
  </PageToolbar>

  <PageToolbar>
    <AppSelect
      v-if="tab === 'cup' && countryOptions.length > 1"
      :model-value="country ?? ''"
      :options="countryOptions"
      label="País"
      @update:model-value="selectCountry($event)"
    >
      <template #leading><AppFlag :code="country" /></template>
    </AppSelect>
    <AppSelect
      v-else-if="tab !== 'cup' && tab !== 'continental' && leagueOptions.length > 1"
      :model-value="league ?? ''"
      :options="leagueOptions"
      label="Competición"
      class="max-w-72 min-w-28!"
      @update:model-value="league = $event"
    >
      <template #leading><AppFlag :code="selectedLeague?.country" /></template>
    </AppSelect>
  </PageToolbar>

  <div v-if="tab === 'standings'" class="grid grid-cols-[minmax(0,1fr)_18rem] items-start gap-4">
    <div class="flex min-w-0 flex-col gap-4">
      <AppPanel
        v-for="group in standingGroups"
        :key="group.title ?? 'liga'"
        :title="group.title ?? 'Clasificación'"
        :hint="leagueStatus"
        flush
      >
        <StandingsTable :rows="group.rows" :division="group.title !== null" full />
      </AppPanel>

      <ul v-if="zonesShown.length > 0" class="flex flex-wrap gap-4 text-xs text-white/75">
        <li v-for="zone in zonesShown" :key="zone" class="flex items-center gap-2">
          <span class="h-3 w-1" :class="zoneSwatchClass(zone, zonesShown)"></span>
          {{ STANDING_ZONE_LABELS[zone] }}
        </li>
      </ul>
    </div>

    <BestTeamsPanel :rows="standings" />
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

  <div
    v-else
    class="grid items-start gap-4"
    :class="roundMvp ? 'grid-cols-[minmax(0,1fr)_18rem]' : 'grid-cols-1'"
  >
    <AppPanel flush>
      <template #header>
        <AppPager v-model="round" :max="totalRounds" label="Jornada">
          <template #default="{ value }">Jornada {{ value }}</template>
        </AppPager>
        <span v-if="roundDate" class="text-xs font-semibold text-white/75">
          {{ formatMatchDate(roundDate) }}
        </span>
      </template>

      <AppEmpty v-if="fixtures.length === 0">Esta jornada no tiene partidos.</AppEmpty>
      <ul v-else class="flex flex-col gap-[3px] p-[3px]">
        <GameRow v-for="fixture in fixtures" :key="fixture.gameId" :game="fixture" />
      </ul>

      <p
        v-if="restingTeams.length > 0"
        class="bg-tv-800 px-4 py-2 text-center text-sm text-white/80"
      >
        Descansa:
        <span
          v-for="(row, index) in restingTeams"
          :key="row.teamId"
          :class="row.isManaged ? 'font-bold text-tv-select' : 'text-white'"
          >{{ index > 0 ? ', ' : '' }}{{ row.teamName }} ({{ row.position }}º)</span
        >
      </p>
    </AppPanel>

    <RoundMvpPanel v-if="roundMvp" :mvp="roundMvp" />
  </div>
</template>
