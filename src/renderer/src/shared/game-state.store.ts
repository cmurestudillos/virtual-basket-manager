import { defineStore } from 'pinia';
import { ref } from 'vue';
import type { ManagedTeamState } from '@shared/contracts/game-state.contract';

/**
 * Estado de la partida cargada, compartido por toda la interfaz.
 *
 * Se guarda en un store y no se pide en cada pantalla porque la cabecera lo
 * necesita siempre: sin esto, cada navegación dispararía una llamada IPC para
 * repintar exactamente los mismos tres datos.
 */
export const useGameStateStore = defineStore('gameState', () => {
  const state = ref<ManagedTeamState | null>(null);
  const loading = ref(false);

  async function refresh(): Promise<void> {
    loading.value = true;
    try {
      state.value = await window.api.gameState.get();
    } finally {
      loading.value = false;
    }
  }

  function clear(): void {
    state.value = null;
  }

  return { state, loading, refresh, clear };
});
