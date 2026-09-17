<script setup lang="ts">
/**
 * Cargar partida, como el diálogo «Cargar mánager» de IBM (130932): un panel
 * claro centrado sobre el fondo con franjas, la lista de partidas con la
 * elegida en azul pálido y, bajo una raya negra, CARGAR y BORRAR.
 *
 * Se elige primero y se actúa después: con los botones en cada fila, «Borrar»
 * quedaba a un dedo de «Cargar» en todas las partidas a la vez. Una doble
 * pulsada en la fila la carga directamente.
 */
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import type { SaveSummary } from '@shared/contracts/saves.contract';
import { useGameStateStore } from '@renderer/shared/game-state.store';
import { formatGameDate } from '@renderer/shared/format';
import { AppBackdrop, AppButton, AppEmpty, AppPanel } from '@renderer/shared/ui';

const router = useRouter();
const store = useGameStateStore();
const saves = ref<SaveSummary[]>([]);
const selectedId = ref<string | null>(null);
const busy = ref(false);

onMounted(refresh);

async function refresh(): Promise<void> {
  saves.value = await window.api.saves.list();
  // La elegida sigue siéndolo si todavía existe; si no, la primera, para que
  // CARGAR funcione nada más abrir.
  if (!saves.value.some((save) => save.id === selectedId.value)) {
    selectedId.value = saves.value[0]?.id ?? null;
  }
}

async function load(id: string | null): Promise<void> {
  if (!id || busy.value) return;
  busy.value = true;
  try {
    await window.api.saves.load(id);
    await store.refresh();
    await router.push({ name: 'dashboard' });
  } finally {
    busy.value = false;
  }
}

async function remove(id: string | null): Promise<void> {
  if (!id || busy.value) return;
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
  <AppBackdrop class="h-screen">
    <div class="flex h-screen items-center justify-center p-6">
      <section class="flex max-h-full w-full max-w-3xl flex-col">
        <AppPanel
          title="Cargar partida"
          :hint="saves.length === 1 ? '1 partida' : `${saves.length} partidas`"
          scroll
          class="min-h-0"
        >
          <AppEmpty v-if="saves.length === 0"> Todavía no hay ninguna partida guardada. </AppEmpty>

          <ul v-else class="flex flex-col gap-[3px]">
            <li v-for="save in saves" :key="save.id">
              <button
                type="button"
                class="grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-4 px-3 py-2 text-left text-sm text-tv-ink transition-colors"
                :class="
                  save.id === selectedId ? 'bg-tv-select' : 'bg-tv-cell hover:bg-tv-cell-strong'
                "
                :aria-pressed="save.id === selectedId"
                @click="selectedId = save.id"
                @dblclick="load(save.id)"
              >
                <span class="flex min-w-0 flex-col">
                  <span class="truncate font-bold">{{ save.name }}</span>
                  <span class="truncate">
                    {{ save.teamName ?? 'Equipo desconocido' }} · {{ save.managerName ?? '—' }}
                  </span>
                </span>
                <span class="flex flex-col items-end">
                  <span class="figure">Temporada {{ save.seasonNumber ?? '—' }}</span>
                  <span class="text-xs text-tv-muted">
                    Última partida:
                    {{ save.lastPlayedAt ? formatGameDate(save.lastPlayedAt) : 'nunca' }}
                  </span>
                </span>
              </button>
            </li>
          </ul>
        </AppPanel>

        <div class="bg-tv-paper px-4">
          <div class="flex justify-center gap-6 border-t border-black py-4">
            <AppButton
              variant="primary"
              class="min-w-40"
              :disabled="busy || !selectedId"
              @click="load(selectedId)"
            >
              Cargar
            </AppButton>
            <AppButton
              variant="danger"
              class="min-w-40"
              :disabled="busy || !selectedId"
              @click="remove(selectedId)"
            >
              Borrar
            </AppButton>
            <AppButton class="min-w-40" @click="router.push({ name: 'main-menu' })">
              Volver
            </AppButton>
          </div>
        </div>
      </section>
    </div>
  </AppBackdrop>
</template>
