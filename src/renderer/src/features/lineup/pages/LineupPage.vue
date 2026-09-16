<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import type { MyNationalTeam } from '@shared/contracts/national.contract';
import { useGameStateStore } from '@renderer/shared/game-state.store';
import RotationEditor from '@renderer/features/lineup/components/RotationEditor.vue';
import TacticsBoard from '@renderer/features/lineup/components/TacticsBoard.vue';
import { AppEmpty, AppFlag, AppTabs, AppPageHeader } from '@renderer/shared/ui';

const store = useGameStateStore();
const route = useRoute();

type Tab = 'rotation' | 'tactics';
const tab = ref<Tab>('rotation');

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
  <div class="flex flex-col gap-4">
    <AppPageHeader title="Alineación">
      <span class="text-sm text-court-300">
        Lo que se decide aquí es lo que sale a la pista en el próximo partido
      </span>
    </AppPageHeader>

    <div v-if="teamOptions.length > 1" class="flex items-center gap-3">
      <AppTabs
        :model-value="team"
        :options="teamOptions"
        variant="pills"
        @update:model-value="team = $event as Team"
      />
      <AppFlag v-if="team === 'seleccion' && national" :code="national.code" size="md" />
    </div>

    <AppTabs
      :model-value="tab"
      :options="[
        { id: 'rotation' as Tab, label: 'Rotación' },
        { id: 'tactics' as Tab, label: 'Pizarra' }
      ]"
      @update:model-value="tab = $event as Tab"
    />

    <p v-if="loaded && team === 'seleccion'" class="text-sm text-court-300">
      Juegan los convocados de la ventana que toca; la lista se cambia en Selecciones.
    </p>

    <AppEmpty v-if="loaded && team === 'seleccion' && squadSize < 5">
      Tu selección todavía no tiene convocados para esta ventana.
      {{ squadReason ?? '' }}
    </AppEmpty>

    <template v-else-if="loaded && teamId">
      <RotationEditor v-if="tab === 'rotation'" :key="`rot-${teamId}`" :team-id="teamId" />
      <TacticsBoard v-else :key="`tac-${teamId}`" :team-id="teamId" />
    </template>
  </div>
</template>
