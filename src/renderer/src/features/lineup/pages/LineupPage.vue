<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useGameStateStore } from '@renderer/shared/game-state.store';
import RotationEditor from '@renderer/features/lineup/components/RotationEditor.vue';
import TacticsBoard from '@renderer/features/lineup/components/TacticsBoard.vue';

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
    <div class="flex items-baseline gap-4">
      <h1 class="text-2xl font-semibold">Alineación</h1>
      <span class="text-sm text-court-300">
        Lo que se decide aquí es lo que sale a la pista en el próximo partido
      </span>
    </div>

    <nav class="flex gap-1 border-b border-court-700">
      <button
        v-for="option in [
          { id: 'rotation' as Tab, label: 'Rotación' },
          { id: 'tactics' as Tab, label: 'Pizarra' }
        ]"
        :key="option.id"
        type="button"
        class="border-b-2 px-4 py-2 text-sm"
        :class="
          tab === option.id
            ? 'border-ball-500 text-ball-400'
            : 'border-transparent text-court-300 hover:text-court-100'
        "
        @click="tab = option.id"
      >
        {{ option.label }}
      </button>
    </nav>

    <template v-if="store.state">
      <RotationEditor v-if="tab === 'rotation'" :team-id="store.state.teamId" />
      <TacticsBoard v-else :team-id="store.state.teamId" />
    </template>
  </div>
</template>
