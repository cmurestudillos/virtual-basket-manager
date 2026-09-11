<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import type { SaveSummary } from '@shared/contracts/saves.contract';
import { useGameStateStore } from '@renderer/shared/game-state.store';
import { formatGameDate } from '@renderer/shared/format';
import { AppButton, AppPageHeader } from '@renderer/shared/ui';

const router = useRouter();
const store = useGameStateStore();
const saves = ref<SaveSummary[]>([]);
const busy = ref(false);

onMounted(refresh);

async function refresh(): Promise<void> {
  saves.value = await window.api.saves.list();
}

async function load(id: string): Promise<void> {
  busy.value = true;
  try {
    await window.api.saves.load(id);
    await store.refresh();
    await router.push({ name: 'dashboard' });
  } finally {
    busy.value = false;
  }
}

async function remove(id: string): Promise<void> {
  busy.value = true;
  try {
    await window.api.saves.delete(id);
    await refresh();
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <div class="mx-auto flex h-screen max-w-4xl flex-col gap-6 p-8">
    <header class="flex items-center justify-between">
      <AppPageHeader title="Cargar partida" />
      <RouterLink :to="{ name: 'main-menu' }" class="text-sm text-court-300 hover:text-court-100">
        Volver
      </RouterLink>
    </header>

    <p v-if="saves.length === 0" class="text-court-300">Todavía no hay ninguna partida guardada.</p>

    <ul v-else class="flex flex-col gap-2 overflow-auto">
      <li
        v-for="save in saves"
        :key="save.id"
        class="flex items-center justify-between rounded border border-court-700 px-4 py-3"
      >
        <div>
          <p class="font-semibold">{{ save.name }}</p>
          <p class="text-sm text-court-300">
            {{ save.teamName ?? 'Equipo desconocido' }} · {{ save.managerName ?? '—' }} · Temporada
            {{ save.seasonNumber ?? '—' }}
          </p>
          <p class="text-xs text-court-600">
            Última partida: {{ save.lastPlayedAt ? formatGameDate(save.lastPlayedAt) : 'nunca' }}
          </p>
        </div>
        <div class="flex gap-2">
          <AppButton variant="primary" :disabled="busy" @click="load(save.id)"> Cargar </AppButton>
          <AppButton :disabled="busy" @click="remove(save.id)"> Borrar </AppButton>
        </div>
      </li>
    </ul>
  </div>
</template>
