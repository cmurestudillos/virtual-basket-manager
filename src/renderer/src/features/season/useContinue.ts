import { useRouter } from 'vue-router';
import { useContinueStore } from './continue.store';

/**
 * CONTINUAR con navegación: lo que hace el store y, si el calendario se ha
 * parado en un partido del usuario, la entrada en él.
 *
 * Es aparte del store para que el store no navegue (ver `useSeasonStore`).
 */
export function useContinue() {
  const store = useContinueStore();
  const router = useRouter();

  async function enter(gameId: string | null): Promise<void> {
    if (gameId) {
      await router.push({ name: 'match', params: { gameId } });
    }
  }

  return {
    store,
    continueGame: async () => enter(await store.run()),
    advanceDay: async () => enter(await store.advanceDay()),
    waitMonth: async () => enter(await store.waitMonth())
  };
}
