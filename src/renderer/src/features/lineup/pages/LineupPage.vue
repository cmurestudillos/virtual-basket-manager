<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import type { MyNationalTeam } from '@shared/contracts/national.contract';
import { useGameStateStore } from '@renderer/shared/game-state.store';
import PageToolbar from '@renderer/features/app-shell/components/PageToolbar.vue';
import RotationEditor from '@renderer/features/lineup/components/RotationEditor.vue';
import TacticsBoard from '@renderer/features/lineup/components/TacticsBoard.vue';
import { AppEmpty, AppFlag, AppPanel, AppSegmented, AppTabs } from '@renderer/shared/ui';

/**
 * La alineación: el quinteto con la rotación y la pizarra. Lo que se decide
 * aquí es lo que sale a la pista en el próximo partido.
 *
 * Las dos vistas son pestañas propias detrás de las de la sección y, si hay
 * selección, el equipo que se alinea se elige a la derecha de la barra.
 */

const store = useGameStateStore();
const route = useRoute();

type Tab = 'rotation' | 'tactics';
const tab = ref<Tab>('rotation');
const TABS = [
  { id: 'rotation', label: 'Quinteto' },
  { id: 'tactics', label: 'Pizarra' }
];

/**
 * Con selección hay dos equipos que alinear. Se cambia de uno a otro arriba, y
 * sin club —en el paro con selección— sólo queda la selección.
 */
type Team = 'club' | 'seleccion';
const team = ref<Team>('club');
const national = ref<MyNationalTeam | null>(null);
const unemployed = ref(false);
const loaded = ref(false);
/** Convocados de la ventana: sin cinco no hay alineación que hacer. */
const squadSize = ref(0);
const squadReason = ref<string | null>(null);

onMounted(async () => {
  if (!store.state) {
    await store.refresh();
  }
  const [overview, career, callup] = await Promise.all([
    window.api.national.getOverview(),
    window.api.career.getStatus(),
    window.api.national.getCallup()
  ]);
  national.value = overview.myTeam;
  squadSize.value = callup?.candidates.filter((row) => row.selected).length ?? 0;
  squadReason.value = callup?.reason ?? null;
  unemployed.value = career.unemployed;
  if (national.value && (route.query.equipo === 'seleccion' || unemployed.value)) {
    team.value = 'seleccion';
  }
  loaded.value = true;
});

const teamOptions = computed(() => [
  ...(unemployed.value ? [] : [{ id: 'club', label: store.state?.teamName ?? 'Club' }]),
  ...(national.value ? [{ id: 'seleccion', label: national.value.name }] : [])
]);

const teamId = computed(() =>
  team.value === 'seleccion' && national.value
    ? national.value.teamId
    : (store.state?.teamId ?? null)
);
</script>

<template>
  <div class="flex flex-col gap-3">
    <PageToolbar place="tabs">
      <span aria-hidden="true" class="my-3 w-px shrink-0 bg-white/30"></span>
      <AppTabs :model-value="tab" :options="TABS" @update:model-value="tab = $event as Tab" />
    </PageToolbar>

    <PageToolbar v-if="teamOptions.length > 1">
      <AppFlag v-if="team === 'seleccion' && national" :code="national.code" size="md" />
      <AppSegmented
        :model-value="team"
        :options="teamOptions"
        @update:model-value="team = $event as Team"
      />
    </PageToolbar>

    <p v-if="loaded && team === 'seleccion'" class="text-sm text-white/70">
      Juegan los convocados de la ventana que toca; la lista se cambia en Selecciones.
    </p>

    <AppPanel v-if="loaded && team === 'seleccion' && squadSize < 5" title="Convocatoria">
      <AppEmpty>
        Tu selección todavía no tiene convocados para esta ventana.
        {{ squadReason ?? '' }}
      </AppEmpty>
    </AppPanel>

    <template v-else-if="loaded && teamId">
      <RotationEditor v-if="tab === 'rotation'" :key="`rot-${teamId}`" :team-id="teamId" />
      <TacticsBoard v-else :key="`tac-${teamId}`" :team-id="teamId" />
    </template>
  </div>
</template>
