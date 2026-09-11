<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useGameStateStore } from '@renderer/shared/game-state.store';
import RotationEditor from '@renderer/features/lineup/components/RotationEditor.vue';
import TacticsBoard from '@renderer/features/lineup/components/TacticsBoard.vue';
import { AppTabs, AppPageHeader } from '@renderer/shared/ui';

const store = useGameStateStore();

type Tab = 'rotation' | 'tactics';
const tab = ref<Tab>('rotation');

onMounted(async () => {
  if (!store.state) {
    await store.refresh();
  }
});
</script>

<template>
  <div class="flex flex-col gap-4">
    <AppPageHeader title="Alineación">
      <span class="text-sm text-court-300">
        Lo que se decide aquí es lo que sale a la pista en el próximo partido
      </span>
    </AppPageHeader>

    <AppTabs
      :model-value="tab"
      :options="[
        { id: 'rotation' as Tab, label: 'Rotación' },
        { id: 'tactics' as Tab, label: 'Pizarra' }
      ]"
      @update:model-value="tab = $event as Tab"
    />

    <template v-if="store.state">
      <RotationEditor v-if="tab === 'rotation'" :team-id="store.state.teamId" />
      <TacticsBoard v-else :team-id="store.state.teamId" />
    </template>
  </div>
</template>
