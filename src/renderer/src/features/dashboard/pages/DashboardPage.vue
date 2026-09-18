<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { RouterLink } from 'vue-router';
import { storeToRefs } from 'pinia';
import { matchKits } from '@shared/domain/court';
import type {
  FixtureEntry,
  PlayoffBracket,
  StandingEntry
} from '@shared/contracts/season.contract';
import type { TeamSummary } from '@shared/contracts/teams.contract';
import type { ClubFinances } from '@shared/contracts/club.contract';
import type { PlayerSeasonStats } from '@shared/contracts/stats.contract';
import type { InboxMessage } from '@shared/contracts/inbox.contract';
import { SEASON_VERDICT_LABELS, type SeasonVerdict } from '@shared/domain/board';
import { squadMorale } from '@shared/domain/morale';
import type { StandingZone } from '@shared/domain/promotion';
import {
  AppButton,
  AppEmpty,
  AppFlag,
  AppMeter,
  AppPanel,
  AppStat,
  FixtureCard,
  KeyValueList,
  LeaderCard,
  TONE_TEXT,
  TeamBadge,
  type FixtureSide,
  type Tone
} from '@renderer/shared/ui';
import { useGameStateStore } from '@renderer/shared/game-state.store';
import { useSeasonStore } from '@renderer/features/season/season.store';
import { useContinueStore } from '@renderer/features/season/continue.store';
import { useInboxStore } from '@renderer/features/inbox/inbox.store';
import {
  formatMatchDate,
  formatMoney,
  formatShortDate,
  formatWhole
} from '@renderer/shared/format';
import CareerOffers from '@renderer/features/career/components/CareerOffers.vue';
import ConfidenceRings from '@renderer/features/club/components/ConfidenceRings.vue';
import MailPanel from '@renderer/features/inbox/components/MailPanel.vue';
import MailRow from '@renderer/features/inbox/components/MailRow.vue';
import PanelMore from '../components/PanelMore.vue';

/*
 * El inicio, como el menú principal de IBM (125858): arriba la tira de partidos
 * —los dos últimos, el PRÓXIMO PARTIDO en grande y los dos siguientes— y debajo
 * una rejilla de paneles que resumen cada pantalla, con el «+» que lleva a ella.
 *
 * Los botones que movían el calendario («Avanzar día», «Ir a la jornada»,
 * «Jugar partido», «Avanzar», «Empezar temporada», «Esperar un mes») están
 * desde la fase 2 del estilo IBM en el CONTINUAR de la barra de arriba
 * (`features/season/continue.store.ts`). Esta pantalla cuenta qué toca; el
 * marco lo hace. Por eso tampoco usa la barra de acciones de abajo.
 */

const gameState = useGameStateStore();
const seasonStore = useSeasonStore();
const continuing = useContinueStore();
const inbox = useInboxStore();

const team = ref<TeamSummary | null>(null);
const standings = ref<StandingEntry[]>([]);
const fixtures = ref<FixtureEntry[]>([]);
const playoffs = ref<PlayoffBracket | null>(null);
const finances = ref<ClubFinances | null>(null);
const squadStats = ref<PlayerSeasonStats[]>([]);
/** La moral media de la plantilla: la confianza de los jugadores. */
const playersConfidence = ref<number | null>(null);
const mail = ref<InboxMessage[]>([]);
/**
 * El consejo y la carrera, si la partida se juega en ese modo. La carrera es lo
 * que convierte el despido en «busca otro banquillo» en vez de en el final de
 * la partida. Los guarda el store de CONTINUAR, que decide con ellos.
 */
const { board, career, unemployed, nationalOnly } = storeToRefs(continuing);
const signing = ref(false);

/** Una federación te quiere: se acepta sin dejar el club. */
async function acceptNational(teamId: string): Promise<void> {
  if (signing.value) {
    return;
  }
  signing.value = true;
  try {
    career.value = await window.api.career.acceptNational(teamId);
    await seasonStore.refresh();
  } finally {
    signing.value = false;
  }
}

const stage = computed(() => seasonStore.season?.stage ?? 'regular');

/** La eliminatoria que juega el equipo del usuario ahora mismo, si la juega. */
const currentSeries = computed(() => {
  const seriesId = seasonStore.nextGame?.seriesId;
  if (!seriesId) {
    return null;
  }
  return (
    playoffs.value?.rounds
      .flatMap((round) => round.series)
      .find((series) => series.seriesId === seriesId) ?? null
  );
});

/** «Jornada 12» en liga, «Cuartos de final · 2º partido (1-0)» en playoffs. */
const nextGameLabel = computed(() => {
  const next = seasonStore.nextGame;
  if (!next) {
    return '';
  }
  if ([next.homeTeamId, next.awayTeamId].some((id) => id.startsWith('seleccion-'))) {
    return 'Partido de selección';
  }
  const series = currentSeries.value;
  if (!series) {
    return `Jornada ${next.round}`;
  }

  const managedIsHigher = series.higherSeedTeamId === gameState.state?.teamId;
  const own = managedIsHigher ? series.higherSeedWins : series.lowerSeedWins;
  const rival = managedIsHigher ? series.lowerSeedWins : series.higherSeedWins;
  return `${series.roundName} · ${next.seriesGame}º partido (${own}-${rival})`;
});

/** Semana de descanso: la jornada se juega sin el club. */
const restingRound = computed(() =>
  continuing.roundBefore?.managedRests ? continuing.roundBefore : null
);

onMounted(async () => {
  if (!gameState.state) {
    await gameState.refresh();
  }
  await seasonStore.refresh();
  await reload();
});

// CONTINUAR se pulsa en el marco, fuera de esta pantalla: al acabar —y al
// cambiar de club o de temporada— se vuelve a leer todo. A mitad de un avance
// no, que la fecha cambia a cada paso.
watch(
  () =>
    continuing.busy
      ? null
      : `${gameState.state?.teamId}|${gameState.state?.currentDate}|${seasonStore.season?.seasonNumber}`,
  (key) => {
    if (key) {
      void reload();
    }
  }
);

async function reload(): Promise<void> {
  if (!gameState.state) {
    return;
  }
  // Primero la carrera: sin banquillo no hay club del que enseñar nada.
  await continuing.refresh();
  const teamId = gameState.state.teamId;
  if (unemployed.value || !teamId) {
    team.value = null;
    standings.value = [];
    fixtures.value = [];
    finances.value = null;
    squadStats.value = [];
    playersConfidence.value = null;
  } else {
    let roster: { morale: number | null }[];
    [team.value, standings.value, fixtures.value, finances.value, squadStats.value, roster] =
      await Promise.all([
        window.api.teams.get(teamId),
        window.api.season.getStandings(),
        window.api.season.listTeamFixtures(teamId),
        window.api.club.getFinances(teamId),
        window.api.stats.teamSeason(teamId),
        window.api.players.listByTeam(teamId)
      ]);
    // La plantilla es la propia: la moral llega de todos (sólo la de fuera viene vacía).
    playersConfidence.value = squadMorale(
      roster.flatMap((player) => (player.morale === null ? [] : [player.morale]))
    );
  }
  // El cuadro sólo existe cuando acaba la liga regular; antes no hay nada que pedir.
  playoffs.value = stage.value === 'regular' ? null : await window.api.season.getPlayoffs();
  const view = await window.api.inbox.get();
  mail.value = view.messages.slice(0, 4);
  inbox.unread = view.unread;
}

/** Coge el banquillo ofrecido y vuelve a cargar el club, que ya es otro. */
async function acceptOffer(teamId: string): Promise<void> {
  if (signing.value) {
    return;
  }
  signing.value = true;
  try {
    career.value = await window.api.career.accept(teamId);
    await gameState.refresh();
    await seasonStore.refresh();
    await reload();
  } finally {
    signing.value = false;
  }
}

/** Ofertas teniendo equipo: sólo al cerrar la temporada, y sólo si alguien tienta. */
const employedOffers = computed(
  () =>
    career.value?.careerMode === true &&
    !career.value.unemployed &&
    career.value.offersWhileEmployed &&
    career.value.offers.length > 0
);

// --- La tira de partidos -----------------------------------------------------

/** Con banquillo, o sin él pero con selección que dirigir. */
const showStrip = computed(
  () => (!board.value?.dismissed && !unemployed.value) || nationalOnly.value
);

const kitOf = (teamId: string) => matchKits(teamId, '').home;
/** Las selecciones llevan bandera y no escudo: `seleccion-esp` → `ESP`. */
const nationOf = (teamId: string) =>
  teamId.startsWith('seleccion-') ? teamId.replace('seleccion-', '').toUpperCase() : null;

function side(teamId: string, name: string, score: number | null, played: boolean): FixtureSide {
  return { name, kit: kitOf(teamId), nationOf: nationOf(teamId), score: played ? score : null };
}

function homeOf(fixture: FixtureEntry): FixtureSide {
  return side(fixture.homeTeamId, fixture.homeTeamName, fixture.homeScore, fixture.played);
}

function awayOf(fixture: FixtureEntry): FixtureSide {
  return side(fixture.awayTeamId, fixture.awayTeamName, fixture.awayScore, fixture.played);
}

/**
 * La ficha del rival de un partido por jugar: la del equipo que no es el del
 * usuario. Una selección no tiene ficha de club, así que su partido no enlaza.
 */
function rivalProfile(fixture: FixtureEntry) {
  const venue = venueOf(fixture);
  const rivalId =
    venue === 'home' ? fixture.awayTeamId : venue === 'away' ? fixture.homeTeamId : null;
  return rivalId && !nationOf(rivalId)
    ? { name: 'team-profile', params: { teamId: rivalId } }
    : null;
}

/** Lo que envuelve una tarjeta por jugar: el enlace a la ficha del rival o, sin ella, nada. */
function rivalWrapper(fixture: FixtureEntry) {
  return rivalProfile(fixture) ? RouterLink : 'div';
}

function rivalLink(fixture: FixtureEntry) {
  const to = rivalProfile(fixture);
  if (!to) {
    return {};
  }
  const rival =
    to.params.teamId === fixture.homeTeamId ? fixture.homeTeamName : fixture.awayTeamName;
  return {
    to,
    class: 'block outline-tv-blue hover:outline-2',
    title: `Ficha del rival: ${rival}`
  };
}

/** En casa o fuera, visto desde el club o la selección del usuario. */
function venueOf(fixture: FixtureEntry): 'home' | 'away' | null {
  const national = career.value?.nationalTeamName ?? null;
  if (fixture.homeTeamId === gameState.state?.teamId || fixture.homeTeamName === national) {
    return 'home';
  }
  if (fixture.awayTeamId === gameState.state?.teamId || fixture.awayTeamName === national) {
    return 'away';
  }
  return null;
}

/** El pie de una tarjeta pequeña: la jornada o el partido de la eliminatoria. */
function fixtureFooter(fixture: FixtureEntry): string {
  return fixture.seriesId
    ? `Playoffs · ${fixture.seriesGame}º partido`
    : `Jornada ${fixture.round}`;
}

/** Siempre dos huecos a cada lado, para que el próximo partido quede en el centro. */
const pastSlots = computed(() => {
  const played = fixtures.value.filter((fixture) => fixture.played).slice(-2);
  return [null, null, ...played].slice(-2);
});

const futureSlots = computed(() => {
  const nextId = restingRound.value ? null : seasonStore.nextGame?.gameId;
  const upcoming = fixtures.value
    .filter((fixture) => !fixture.played && fixture.gameId !== nextId)
    .slice(0, 2);
  return [...upcoming, null, null].slice(0, 2);
});

const seasonYears = computed(() => {
  const start = seasonStore.season?.startYear ?? 0;
  return `${start}-${start + 1}`;
});

// --- Los paneles -------------------------------------------------------------

/** Los ocho primeros y, si queda fuera, tu equipo detrás. */
const standingsRows = computed(() => {
  const top = standings.value.slice(0, 8);
  const mine = standings.value.find((row) => row.isManaged);
  return mine && !top.includes(mine) ? [...top, mine] : top;
});

function zoneClass(zone: StandingZone): string {
  if (zone === 'playoffs' || zone === 'promotion') return 'zone-up';
  if (zone === 'relegation') return 'zone-down';
  return '';
}

const standingsHint = computed(() => {
  if (stage.value === 'playoffs') return 'Playoffs';
  if (stage.value === 'finished') return 'Terminada';
  return `J${seasonStore.season?.currentRound ?? 1} / ${seasonStore.season?.totalRounds ?? 34}`;
});

const AVERAGE = new Intl.NumberFormat('es-ES', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1
});

const LEADER_CATEGORIES: { id: string; label: string; pick: (row: PlayerSeasonStats) => number }[] =
  [
    { id: 'efficiency', label: 'Valoración', pick: (row) => row.efficiencyPerGame },
    { id: 'points', label: 'Puntos', pick: (row) => row.pointsPerGame },
    { id: 'rebounds', label: 'Rebotes', pick: (row) => row.reboundsPerGame }
  ];

/** El mejor de la plantilla en cada categoría, entre los que han jugado. */
const leaders = computed(() => {
  const played = squadStats.value.filter((row) => row.games > 0);
  if (played.length === 0) {
    return [];
  }
  return LEADER_CATEGORIES.map((category) => {
    const best = played.reduce((top, row) => (category.pick(row) > category.pick(top) ? row : top));
    return { ...category, player: best, value: AVERAGE.format(category.pick(best)) };
  });
});

const VERDICT_TONE: Record<SeasonVerdict, Tone> = {
  exceeded: 'good',
  met: 'good',
  failed: 'bad'
};

const boardItems = computed(() =>
  board.value
    ? [
        { id: 'objective', label: 'Objetivo', value: board.value.objectiveLabel },
        { id: 'target', label: 'Hace falta', value: `${board.value.targetPosition}º o mejor` },
        {
          id: 'position',
          label: 'Puesto actual',
          value: board.value.position ? `${board.value.position}º` : '—'
        },
        {
          id: 'verdict',
          label: 'Con lo de ahora',
          value: SEASON_VERDICT_LABELS[board.value.verdict]
        }
      ]
    : []
);

const economyItems = computed(() =>
  finances.value
    ? [
        { id: 'wages', label: 'Nómina anual', value: formatMoney(finances.value.seasonWagesCents) },
        {
          id: 'income',
          label: 'Ingresos del curso',
          value: formatMoney(finances.value.seasonIncomeCents)
        },
        {
          id: 'expense',
          label: 'Gastos del curso',
          value: formatMoney(finances.value.seasonExpenseCents)
        }
      ]
    : []
);

const arenaItems = computed(() =>
  finances.value
    ? [
        { id: 'capacity', label: 'Aforo', value: formatWhole(finances.value.capacity) },
        {
          id: 'attendance',
          label: 'Asistencia prevista',
          value: formatWhole(finances.value.expectedAttendance)
        },
        {
          id: 'season-tickets',
          label: 'Abonados',
          value: formatWhole(finances.value.seasonTicketHolders)
        }
      ]
    : []
);
</script>

<template>
  <div v-if="gameState.state" class="flex flex-col gap-4">
    <!-- Sin equipo, lo primero es elegir banquillo; con él, quién te busca en verano. -->
    <CareerOffers
      v-if="career && (unemployed || employedOffers)"
      :offers="career.offers"
      :reputation-label="career.reputationLabel"
      :busy="signing || continuing.busy"
      :employed="!unemployed"
      :can-wait="career.canWait"
      :current-date="career.currentDate"
      @accept="acceptOffer"
    />

    <!-- La tira de partidos: dos jugados, el próximo en grande y dos por jugar. -->
    <section
      v-if="showStrip"
      aria-label="Partidos"
      class="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)] items-center gap-2"
    >
      <template v-for="(fixture, index) in pastSlots" :key="fixture?.gameId ?? `pasado-${index}`">
        <RouterLink
          v-if="fixture"
          :to="{ name: 'match', params: { gameId: fixture.gameId } }"
          class="block outline-tv-blue hover:outline-2"
          :title="`Ver el acta: ${fixture.homeTeamName} - ${fixture.awayTeamName}`"
        >
          <FixtureCard
            :home="homeOf(fixture)"
            :away="awayOf(fixture)"
            :date="formatShortDate(fixture.scheduledOn)"
            :venue="venueOf(fixture)"
            :footer="fixtureFooter(fixture)"
          />
        </RouterLink>
        <div v-else></div>
      </template>

      <!-- Semana de descanso en una liga impar: la jornada se juega sin el club. -->
      <FixtureCard
        v-if="restingRound"
        featured
        title="Descanso"
        :date="formatShortDate(restingRound.scheduledOn)"
        :footer="`Jornada ${restingRound.round}`"
        :detail="
          seasonStore.nextGame
            ? `Después: ${seasonStore.nextGame.homeTeamName} - ${seasonStore.nextGame.awayTeamName}`
            : ''
        "
      >
        <span class="text-base font-bold uppercase tracking-wide">
          Jornada {{ restingRound.round }}: descansas
        </span>
      </FixtureCard>

      <!-- Hay partido propio pendiente: lo normal durante toda la temporada. Abre la ficha del rival. -->
      <component
        :is="rivalWrapper(seasonStore.nextGame)"
        v-else-if="seasonStore.nextGame"
        v-bind="rivalLink(seasonStore.nextGame)"
      >
        <FixtureCard
          featured
          :home="homeOf(seasonStore.nextGame)"
          :away="awayOf(seasonStore.nextGame)"
          :date="formatShortDate(seasonStore.nextGame.scheduledOn)"
          :venue="venueOf(seasonStore.nextGame)"
          :footer="nextGameLabel"
          :detail="formatMatchDate(seasonStore.nextGame.scheduledOn)"
        />
      </component>

      <!-- Temporada cerrada: hay campeón; quizá otras ligas de las que se juegan todavía no. -->
      <FixtureCard
        v-else-if="stage === 'finished'"
        featured
        title="Temporada terminada"
        :date="seasonYears"
        :footer="seasonStore.season?.competitionName ?? ''"
        :detail="
          (seasonStore.season?.pendingLeagues.length ?? 0) > 0
            ? `Faltan por terminar: ${seasonStore.season?.pendingLeagues.join(', ')}`
            : `Temporada ${seasonStore.season?.seasonNumber} · ${seasonYears}`
        "
      >
        <span class="text-base uppercase tracking-wide">
          Campeón:
          <span class="font-bold">{{ seasonStore.season?.championTeamName ?? '—' }}</span>
        </span>
      </FixtureCard>

      <!-- Sin partido propio, pero la competición sigue: eliminado o sin playoffs. -->
      <FixtureCard
        v-else
        featured
        title="Sin partido"
        :date="seasonYears"
        :footer="seasonStore.season?.competitionName ?? ''"
      >
        <span class="text-sm">
          {{
            stage === 'playoffs'
              ? 'Tu equipo ya no está en el cuadro. Los playoffs siguen sin ti.'
              : 'No queda ningún partido tuyo por jugar.'
          }}
        </span>
      </FixtureCard>

      <!-- Los que vienen abren la ficha del rival: es lo que se quiere mirar antes de jugar. -->
      <template v-for="(fixture, index) in futureSlots" :key="fixture?.gameId ?? `futuro-${index}`">
        <component :is="rivalWrapper(fixture)" v-if="fixture" v-bind="rivalLink(fixture)">
          <FixtureCard
            :home="homeOf(fixture)"
            :away="awayOf(fixture)"
            :date="formatShortDate(fixture.scheduledOn)"
            :venue="venueOf(fixture)"
            :footer="fixtureFooter(fixture)"
          />
        </component>
        <div v-else></div>
      </template>
    </section>

    <!-- Federaciones que buscan seleccionador: se lleva a la vez que el club. -->
    <AppPanel v-if="career && career.nationalOffers.length > 0" title="Selecciones que te buscan">
      <p class="text-sm text-tv-muted">
        Tras el Mundial hay federaciones sin seleccionador. Una selección se dirige a la vez que el
        club{{ career.nationalTeamName ? `; aceptar es dejar ${career.nationalTeamName}` : '' }}.
      </p>
      <ul class="mt-3 flex flex-col gap-[3px]">
        <li
          v-for="offer in career.nationalOffers"
          :key="offer.teamId"
          class="flex flex-wrap items-center justify-between gap-4 bg-tv-cell px-3 py-2 text-sm"
        >
          <span class="flex min-w-0 items-center gap-3">
            <AppFlag :code="nationOf(offer.teamId)" size="md" />
            <span class="flex min-w-0 flex-col leading-tight">
              <span class="font-bold">{{ offer.teamName }} · {{ offer.rank }}ª del mundo</span>
              <span class="text-xs text-tv-muted">
                Te pedirán: {{ offer.objectiveLabel.toLowerCase() }}
              </span>
            </span>
          </span>
          <AppButton
            variant="primary"
            size="sm"
            :disabled="signing"
            @click="acceptNational(offer.teamId)"
          >
            Aceptar
          </AppButton>
        </li>
      </ul>
    </AppPanel>

    <div v-if="team && !unemployed" class="grid grid-cols-4 gap-4">
      <AppPanel title="Clasificación" :hint="standingsHint" flush class="row-span-2">
        <template #actions>
          <PanelMore :to="{ name: 'competition' }" label="Ver la clasificación completa" />
        </template>
        <p class="truncate px-3 pt-2 text-center text-xs font-bold uppercase tracking-wide">
          {{ team.competitionName }}
        </p>
        <AppEmpty v-if="standingsRows.length === 0">
          La clasificación sale con la primera jornada.
        </AppEmpty>
        <table v-else class="data-table">
          <thead>
            <tr>
              <th class="numeric">Pos</th>
              <th>Equipo</th>
              <th class="numeric">PG</th>
              <th class="numeric">PP</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="row in standingsRows"
              :key="row.teamId"
              :class="row.isManaged ? 'is-mine' : ''"
            >
              <td class="numeric" :class="zoneClass(row.zone)">{{ row.position }}</td>
              <td class="max-w-0 w-full">
                <RouterLink
                  :to="{ name: 'team-profile', params: { teamId: row.teamId } }"
                  class="flex min-w-0 items-center gap-2 hover:text-tv-blue-ink"
                >
                  <TeamBadge :name="row.teamName" :kit="kitOf(row.teamId)" :size="18" />
                  <span class="truncate" :title="row.teamName">{{ row.teamName }}</span>
                </RouterLink>
              </td>
              <td class="numeric">{{ row.won }}</td>
              <td class="numeric">{{ row.lost }}</td>
            </tr>
          </tbody>
        </table>
      </AppPanel>

      <AppPanel title="Líderes del equipo">
        <template #actions>
          <PanelMore :to="{ name: 'stats' }" label="Ver las estadísticas" />
        </template>
        <AppEmpty v-if="leaders.length === 0">
          Los líderes salen con el primer partido jugado.
        </AppEmpty>
        <div v-else class="flex flex-col gap-2">
          <LeaderCard
            v-for="leader in leaders"
            :key="leader.id"
            :label="leader.label"
            :name="leader.player.playerName"
            :seed="leader.player.playerId"
            :nationality="leader.player.nationality"
            :value="leader.value"
            name-mode="initial"
            :note="`Partidos jugados: ${leader.player.games}`"
          />
        </div>
      </AppPanel>

      <AppPanel title="Economía">
        <template #actions>
          <PanelMore :to="{ name: 'finances' }" label="Ver las finanzas" />
        </template>
        <div class="flex flex-col gap-3">
          <AppStat label="Caja" :tone="(team.budgetCents ?? 0) < 0 ? 'bad' : null">
            {{ formatMoney(team.budgetCents ?? 0) }}
          </AppStat>
          <KeyValueList v-if="finances" :items="economyItems" />
        </div>
      </AppPanel>

      <MailPanel
        title="Correo"
        :hint="inbox.unread === 0 ? '' : `${inbox.unread} sin leer`"
        envelope
      >
        <template #actions>
          <PanelMore :to="{ name: 'inbox' }" label="Abrir el correo" />
        </template>
        <AppEmpty v-if="mail.length === 0">Sin correos por ahora.</AppEmpty>
        <ul v-else class="flex flex-col gap-1">
          <li v-for="message in mail" :key="message.id">
            <RouterLink
              :to="{ name: 'inbox' }"
              class="block bg-tv-cell px-2 py-1.5 transition-colors hover:bg-tv-cell-strong"
            >
              <MailRow :message="message" />
            </RouterLink>
          </li>
        </ul>
      </MailPanel>

      <AppPanel title="Objetivo y confianza" class="col-span-2">
        <template #actions>
          <PanelMore :to="{ name: 'finances' }" label="Ver el consejo" />
        </template>
        <AppEmpty v-if="!board">El consejo todavía no ha dicho nada.</AppEmpty>
        <p v-else-if="board.dismissed" class="py-4 text-center text-lg" :class="TONE_TEXT.bad">
          Te han destituido. La partida se queda como está.
        </p>
        <div v-else class="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4">
          <KeyValueList :items="boardItems">
            <template #value="{ item }">
              <span
                v-if="item.id === 'verdict'"
                class="font-semibold"
                :class="TONE_TEXT[VERDICT_TONE[board.verdict]]"
              >
                {{ item.value }}
              </span>
              <template v-else>{{ item.value }}</template>
            </template>
          </KeyValueList>
          <ConfidenceRings
            class="bg-tv-cell px-4 py-3"
            :board="board.confidence"
            :board-note="board.confidenceLabel"
            :fans="finances?.fanSupport"
            :fans-note="finances?.fanSupportLabel"
            :players="playersConfidence"
          />
        </div>
      </AppPanel>

      <AppPanel title="Pabellón">
        <template #actions>
          <PanelMore :to="{ name: 'finances' }" label="Ver el pabellón y la taquilla" />
        </template>
        <div class="flex flex-col gap-3">
          <p class="flex items-center gap-3">
            <TeamBadge :name="team.name" :kit="kitOf(team.id)" :size="36" />
            <span class="min-w-0 leading-tight">
              <span class="block truncate font-bold">{{ team.pavilionName }}</span>
              <span class="block truncate text-xs text-tv-muted">{{ team.city }}</span>
            </span>
          </p>
          <template v-if="finances">
            <KeyValueList :items="arenaItems" />
            <div class="flex flex-col gap-0.5">
              <AppMeter :value="finances.fanSupport" label="Afición" />
              <span class="text-right text-xs text-tv-muted">{{ finances.fanSupportLabel }}</span>
            </div>
          </template>
        </div>
      </AppPanel>
    </div>
  </div>
</template>
