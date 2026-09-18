<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { TeamProfile, TeamProfileGame } from '@shared/contracts/teams.contract';
import { AppEmpty, AppPanel, AppTabs, type TabOption } from '@renderer/shared/ui';
import PageToolbar from '@renderer/features/app-shell/components/PageToolbar.vue';
import TeamProfileGames from './TeamProfileGames.vue';
import TeamProfileHeader from './TeamProfileHeader.vue';
import TeamProfileSquad from './TeamProfileSquad.vue';
import TeamProfileStats from './TeamProfileStats.vue';
import TeamProfileSummary from './TeamProfileSummary.vue';
import TeamProfileTactics from './TeamProfileTactics.vue';

/**
 * La ficha de un club, como la de IBM (125912 y 130241): el rótulo
 * «INFORMACIÓN DEL EQUIPO» a todo el ancho y, debajo, la pestaña elegida. Las
 * pestañas van en la barra de sección, detrás de las de la sección.
 *
 * Es la misma para cualquier club y para el propio (pestaña «Club» de Equipo):
 * lo que cambia es lo que manda el proceso principal, que ya decide qué se ve
 * —la niebla del ojeador, la moral, la pizarra—. La pantalla no esconde nada
 * por su cuenta: pinta lo que llega.
 */

const props = defineProps<{ teamId: string | null }>();

type Tab = 'summary' | 'squad' | 'stats' | 'games' | 'tactics';

const TABS: TabOption[] = [
  { id: 'summary', label: 'Resumen' },
  { id: 'squad', label: 'Plantilla' },
  { id: 'stats', label: 'Estadísticas' },
  { id: 'games', label: 'Partidos' },
  { id: 'tactics', label: 'Tácticas' }
];

const tab = ref<Tab>('summary');
const profile = ref<TeamProfile | null>(null);
const failure = ref<string | null>(null);
const loading = ref(false);

/** Cuenta las cargas: si se salta de ficha en ficha deprisa, sólo vale la última. */
let request = 0;

async function load(): Promise<void> {
  const current = ++request;
  failure.value = null;
  if (!props.teamId) {
    profile.value = null;
    return;
  }
  loading.value = true;
  try {
    const found = await window.api.teams.getProfile(props.teamId);
    if (current !== request) return;
    profile.value = found;
    if (!found) {
      failure.value = 'Este club no existe en la partida.';
    }
  } catch (cause) {
    if (current !== request) return;
    profile.value = null;
    // El proceso principal rechaza las selecciones: no son clubes.
    const message = cause instanceof Error ? cause.message : '';
    failure.value = message.includes('selección')
      ? 'Las selecciones no tienen ficha de club: se miran en Selecciones.'
      : 'No se ha podido abrir la ficha de este club.';
  } finally {
    if (current === request) loading.value = false;
  }
}

// La ficha se navega desde la propia ficha (el rival de un partido, el de la
// clasificación), así que el club cambia sin desmontar la pantalla.
watch(
  () => props.teamId,
  () => {
    tab.value = 'summary';
    void load();
  },
  { immediate: true }
);

/**
 * En la ficha del club propio todos los partidos son suyos: pintarlos todos en
 * azul pálido no diría nada. Ahí no se resalta ninguno.
 */
const games = computed<TeamProfileGame[]>(() => {
  const current = profile.value;
  if (!current) return [];
  return current.isManaged
    ? current.games.map((game) => ({ ...game, involvesManaged: false }))
    : current.games;
});
</script>

<template>
  <div class="flex h-full min-h-0 flex-col gap-4">
    <PageToolbar v-if="profile" place="tabs">
      <AppTabs :model-value="tab" :options="TABS" @update:model-value="tab = $event as Tab" />
    </PageToolbar>

    <AppPanel v-if="!profile" title="Ficha del club">
      <AppEmpty>
        {{
          failure ??
          (loading || teamId ? 'Abriendo la ficha del club…' : 'Sin club no hay ficha que enseñar.')
        }}
      </AppEmpty>
    </AppPanel>

    <template v-else>
      <TeamProfileHeader :profile="profile" />

      <TeamProfileSummary v-if="tab === 'summary'" :profile="profile" :games="games" />
      <TeamProfileSquad v-else-if="tab === 'squad'" :profile="profile" />
      <TeamProfileStats v-else-if="tab === 'stats'" :profile="profile" />
      <TeamProfileGames v-else-if="tab === 'games'" :profile="profile" :games="games" />
      <TeamProfileTactics v-else :profile="profile" />
    </template>
  </div>
</template>
