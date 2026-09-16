import { onMounted, onUnmounted, ref } from 'vue';
import type { UpdatesView } from '@shared/contracts/updates.contract';

/**
 * El estado de las actualizaciones, al día.
 *
 * Se lee una vez al montar y a partir de ahí escucha: la descarga la lleva el
 * proceso principal y avisa de cada paso, así que no hace falta preguntar.
 */
export function useUpdates() {
  const view = ref<UpdatesView | null>(null);
  const busy = ref(false);
  let stop: (() => void) | null = null;

  onMounted(async () => {
    stop = window.api.updates.onChange((next) => {
      view.value = next;
    });
    view.value = await window.api.updates.get();
  });

  onUnmounted(() => stop?.());

  async function check(): Promise<void> {
    busy.value = true;
    try {
      view.value = await window.api.updates.check();
    } finally {
      busy.value = false;
    }
  }

  async function install(): Promise<void> {
    await window.api.updates.install();
  }

  return { view, busy, check, install };
}
