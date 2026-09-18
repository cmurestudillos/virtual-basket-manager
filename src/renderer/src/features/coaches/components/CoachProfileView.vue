<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import type { CoachProfile, CoachSeasonLine } from '@shared/contracts/coaches.contract';
import { matchKits } from '@shared/domain/court';
import { countryName } from '@shared/domain/simulation-scope';
import { toStars } from '@shared/domain/stars';
import { formatPoints, formatWhole } from '@renderer/shared/format';
import {
  AppAvatar,
  AppBadge,
  AppButton,
  AppEmpty,
  AppFlag,
  AppPanel,
  AppStars,
  AppStat,
  KeyValueList,
  PlayerName,
  TONE_TEXT,
  TeamBadge,
  type KeyValueItem
} from '@renderer/shared/ui';
import { coachAvatarSeed } from '../coach-avatar';
import CoachRankingTable from './CoachRankingTable.vue';

/**
 * La ficha de un entrenador, como la del mánager de IBM (130718): INFO con la
 * cara, la bandera, el nombre y la reputación en estrellas; al lado, el ranking
 * del mundo (el top 5 y la fila del usuario debajo); las cifras de su carrera y
 * de este curso en cajas, y el historial temporada a temporada.
 *
 * Es la misma para el usuario (pestaña Ficha de Mánager) y para cualquier otro
 * entrenador (`coach-profile`). Sin `coachId`, la del usuario. Lo que sólo tiene
 * el usuario —dimitir, dejar la selección, las etapas de su carrera— lo pone
 * quien la usa: `info` va al pie del panel INFO y el hueco por defecto, debajo
 * del historial.
 *
 * `reload()` la vuelve a pedir: tras dimitir, el club ya es otro.
 */

const props = defineProps<{ coachId: string | null }>();
defineSlots<{
  info?: (props: { profile: CoachProfile }) => unknown;
  default?: (props: { profile: CoachProfile }) => unknown;
}>();

const router = useRouter();
const profile = ref<CoachProfile | null>(null);
const failure = ref<string | null>(null);
const loading = ref(false);

/** Cuenta las cargas: si se salta de ficha en ficha deprisa, sólo vale la última. */
let request = 0;

async function load(): Promise<void> {
  const current = ++request;
  failure.value = null;
  loading.value = true;
  try {
    const found = await window.api.coaches.getProfile(props.coachId);
    if (current !== request) return;
    profile.value = found;
  } catch {
    if (current !== request) return;
    profile.value = null;
    failure.value = props.coachId
      ? 'No se ha podido abrir la ficha de este entrenador.'
      : 'No se ha podido abrir tu ficha.';
  } finally {
    if (current === request) loading.value = false;
  }
}

// Desde el top 5 de una ficha se abre la de otro entrenador sin desmontar la pantalla.
watch(() => props.coachId, load, { immediate: true });

defineExpose({ reload: load });

const kitOf = (teamId: string) => matchKits(teamId, '').home;

/** «61 %»; sin partidos, un guion. */
function winRate(games: number, wins: number): string {
  return games > 0 ? `${Math.round((wins / games) * 100)} %` : '-';
}

/** «Nº 12 del mundo · 1.336 puntos», o por qué no tiene puesto. */
const standing = computed(() => {
  const current = profile.value;
  if (!current) return '';
  const points = `${formatPoints(current.points)} puntos`;
  if (current.retired) return 'Retirado';
  if (current.worldRank === null) return `Sin puesto en el ranking · ${points}`;
  return `Nº ${formatWhole(current.worldRank)} del mundo · ${points}`;
});

/** Las filas de INFO: la selección sólo en el usuario; la edad, si se sabe. */
const facts = computed<KeyValueItem[]>(() => {
  const current = profile.value;
  if (!current) return [];
  return [
    { id: 'club', label: 'Club' },
    ...(current.team ? [{ id: 'competition', label: 'Competición' }] : []),
    ...(current.isManager ? [{ id: 'national', label: 'Selección' }] : []),
    { id: 'nationality', label: 'Nacionalidad' },
    ...(current.age !== null ? [{ id: 'age', label: 'Edad', value: `${current.age} años` }] : [])
  ];
});

/** Sin club: libre, retirado o, el usuario, sin equipo. */
const noClub = computed(() => {
  const current = profile.value;
  if (!current) return '';
  if (current.retired) return 'Retirado';
  return current.isManager ? 'Sin equipo' : 'Libre';
});

/** «3º de 18», o un guion si el curso sigue o no acabó allí. */
function positionLabel(line: CoachSeasonLine): string {
  return line.position === null ? '-' : `${line.position}º de ${line.teams}`;
}

const END_LABEL: Record<string, string> = {
  dismissed: 'Destituido',
  left: 'Se marchó',
  retired: 'Se retiró'
};
</script>

<template>
  <AppPanel v-if="!profile" title="Ficha del entrenador">
    <AppEmpty>{{
      failure ?? (loading ? 'Abriendo la ficha…' : 'Sin ficha que enseñar.')
    }}</AppEmpty>
  </AppPanel>

  <div v-else class="flex flex-col gap-4">
    <div class="grid grid-cols-[minmax(0,1fr)_minmax(0,1.45fr)] items-start gap-4">
      <!-- INFO: quién es y dónde está. -->
      <AppPanel title="Info">
        <div class="flex flex-col gap-3">
          <div class="flex items-center gap-4">
            <AppAvatar
              kind="coach"
              :seed="
                coachAvatarSeed({
                  id: profile.coachId,
                  name: profile.name,
                  isManager: profile.isManager
                })
              "
              :name="profile.name"
              :size="72"
            />
            <div class="flex min-w-0 flex-1 flex-col gap-1">
              <h1 class="flex min-w-0 items-center gap-2 text-xl font-bold">
                <AppFlag
                  :code="profile.nationality"
                  :label="countryName(profile.nationality)"
                  size="md"
                />
                <PlayerName :name="profile.name" />
              </h1>
              <span class="flex items-center gap-2 text-sm">
                {{ profile.reputationLabel }}
                <AppStars
                  :value="toStars(profile.reputation)"
                  :label="`Reputación: ${profile.reputationLabel}`"
                  :size="13"
                />
              </span>
              <span class="figure text-sm" :class="TONE_TEXT.neutral">{{ standing }}</span>
            </div>
          </div>

          <KeyValueList :items="facts">
            <template #value="{ item }">
              <template v-if="item.id === 'club'">
                <span v-if="profile.team" class="flex min-w-0 items-center gap-2">
                  <TeamBadge
                    :name="profile.team.name"
                    :kit="kitOf(profile.team.teamId)"
                    :size="20"
                  />
                  <RouterLink
                    :to="{ name: 'team-profile', params: { teamId: profile.team.teamId } }"
                    class="truncate font-semibold text-tv-ink hover:text-tv-blue-ink hover:underline"
                  >
                    {{ profile.team.name }}
                  </RouterLink>
                </span>
                <template v-else>{{ noClub }}</template>
              </template>
              <span
                v-else-if="item.id === 'competition' && profile.team"
                class="flex min-w-0 items-center gap-2"
              >
                <AppFlag :code="profile.team.country" :label="countryName(profile.team.country)" />
                <span class="truncate">{{ profile.team.competitionName }}</span>
              </span>
              <template v-else-if="item.id === 'national'">
                {{ profile.nationalTeamName ?? '-' }}
              </template>
              <template v-else-if="item.id === 'nationality'">
                {{ countryName(profile.nationality) }}
                <AppFlag :code="profile.nationality" />
              </template>
              <template v-else>{{ item.value ?? '-' }}</template>
            </template>
          </KeyValueList>

          <slot name="info" :profile="profile" />
        </div>
      </AppPanel>

      <!-- El ranking del mundo, para situarse. -->
      <AppPanel title="Ranking del mundo" flush>
        <template #actions>
          <AppButton size="sm" @click="router.push({ name: 'coach-ranking' })">
            Ver ranking
          </AppButton>
        </template>
        <AppEmpty v-if="profile.topFive.length === 0 && !profile.managerRow">
          El ranking se cuenta con los partidos de la temporada: todavía no hay nadie en él.
        </AppEmpty>
        <CoachRankingTable
          v-else
          :rows="profile.topFive"
          :pinned="profile.managerRow"
          :highlight="profile.isManager ? null : profile.coachId"
          compact
        />
      </AppPanel>
    </div>

    <!-- Las cifras: la carrera entera y este curso. -->
    <div class="grid grid-cols-[minmax(0,5fr)_minmax(0,4fr)] gap-4">
      <AppPanel title="En su carrera">
        <div class="grid grid-cols-5 gap-3">
          <AppStat label="Temporadas" size="md">{{ profile.totals.seasons }}</AppStat>
          <AppStat label="Partidos" size="md">{{ profile.totals.games }}</AppStat>
          <AppStat label="Victorias" size="md">{{ profile.totals.wins }}</AppStat>
          <AppStat label="% victorias" size="md">
            {{ winRate(profile.totals.games, profile.totals.wins) }}
          </AppStat>
          <AppStat label="Títulos" size="md">{{ profile.totals.titles }}</AppStat>
        </div>
      </AppPanel>
      <AppPanel title="Este curso">
        <div class="grid grid-cols-4 gap-3">
          <AppStat label="Partidos" size="md">{{ profile.current.games }}</AppStat>
          <AppStat label="Victorias" size="md">{{ profile.current.wins }}</AppStat>
          <AppStat label="Derrotas" size="md">
            {{ profile.current.games - profile.current.wins }}
          </AppStat>
          <AppStat label="% victorias" size="md">
            {{ winRate(profile.current.games, profile.current.wins) }}
          </AppStat>
        </div>
      </AppPanel>
    </div>

    <!-- Temporada a temporada, del curso en juego hacia atrás. -->
    <AppPanel title="Historial" hint="en banquillos de club" flush>
      <AppEmpty v-if="profile.history.length === 0">
        Todavía no ha dirigido ningún partido en la partida: su historial empieza aquí.
      </AppEmpty>
      <table v-else class="data-table">
        <thead>
          <tr>
            <th>Temporada</th>
            <th>Club</th>
            <th>Competición</th>
            <th class="numeric">Posición final</th>
            <th class="numeric">PJ</th>
            <th class="numeric">V</th>
            <th class="numeric">D</th>
            <th>Títulos</th>
            <th class="numeric">Puntos</th>
            <th>Salida</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="line in profile.history"
            :key="`${line.seasonNumber}-${line.teamId}`"
            :class="line.current && !line.endReason ? 'is-selected' : ''"
          >
            <td class="figure">
              {{ line.seasonLabel }}
              <AppBadge v-if="line.current && !line.endReason" tone="accent" class="ml-1">
                en juego
              </AppBadge>
            </td>
            <td class="max-w-52">
              <span class="flex min-w-0 items-center gap-2">
                <TeamBadge :name="line.teamName" :kit="kitOf(line.teamId)" :size="20" />
                <RouterLink
                  :to="{ name: 'team-profile', params: { teamId: line.teamId } }"
                  class="min-w-0 truncate font-semibold hover:text-tv-blue-ink hover:underline"
                >
                  {{ line.teamName }}
                </RouterLink>
              </span>
            </td>
            <td class="max-w-48 truncate" :title="line.competitionName">
              {{ line.competitionName }}
              <AppBadge v-if="line.tier > 1" class="ml-1">{{ line.tier }}ª división</AppBadge>
            </td>
            <td class="numeric">{{ positionLabel(line) }}</td>
            <td class="numeric">{{ line.games }}</td>
            <td class="numeric">{{ line.wins }}</td>
            <td class="numeric">{{ line.games - line.wins }}</td>
            <td class="max-w-56 truncate" :title="line.titles.join(', ')">
              <span v-if="line.titles.length > 0" class="font-bold">
                {{ line.titles.join(', ') }}
              </span>
              <span v-else :class="TONE_TEXT.neutral">-</span>
            </td>
            <td class="numeric is-key font-bold">{{ formatPoints(line.points) }}</td>
            <td>
              <AppBadge v-if="line.endReason === 'dismissed'" tone="bad">
                {{ END_LABEL.dismissed }}
              </AppBadge>
              <AppBadge v-else-if="line.endReason">{{ END_LABEL[line.endReason] }}</AppBadge>
              <span v-else :class="TONE_TEXT.neutral">-</span>
            </td>
          </tr>
        </tbody>
      </table>
    </AppPanel>

    <slot :profile="profile" />
  </div>
</template>
