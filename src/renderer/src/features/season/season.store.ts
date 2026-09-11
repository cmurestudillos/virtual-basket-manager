import { defineStore } from 'pinia';
import { ref } from 'vue';
import type { FixtureEntry, SeasonSummary } from '@shared/contracts/season.contract';
import { useGameStateStore } from '@renderer/shared/game-state.store';

/**
 * Avance del calendario, compartido por el panel del club y por la pantalla de
 * competición: desde las dos se puede empujar el tiempo hacia delante.
 *
 * Cuando el juego se para porque le toca jugar al equipo del usuario, el store
 * no navega por su cuenta — devuelve el id del partido y decide la pantalla.
 * Un store que navegue es un store que no se puede reutilizar.
 */
export const useSeasonStore = defineStore('season', () => {
  const season = ref<SeasonSummary | null>(null);
  const nextGame = ref<FixtureEntry | null>(null);
  const busy = ref(false);
  /** Si el consejo te ha destituido, el calendario ya no se mueve. */
  const dismissed = ref(false);

  async function refresh(): Promise<void> {
    season.value = await window.api.season.getCurrent();
    nextGame.value = await window.api.season.getNextGame();
  }

  /** Devuelve el id del partido que hay que jugar, o `null` si sólo pasó el tiempo. */
  async function advance(mode: 'day' | 'nextGame'): Promise<string | null> {
    busy.value = true;
    try {
      const result =
        mode === 'day'
          ? await window.api.season.advanceDay()
          : await window.api.season.advanceToNextGame();

      // La fecha de la cabecera la lleva el estado de partida, así que hay que
      // releerlo: si no, el reloj de arriba se queda parado en el día anterior.
      await useGameStateStore().refresh();
      await refresh();

      dismissed.value = result.status === 'dismissed';

      return result.status === 'userGame' ? result.gameId : null;
    } finally {
      busy.value = false;
    }
  }

  /**
   * Cierra la temporada terminada y arranca la siguiente, y deja el store al
   * día: temporada, fecha de la cabecera y próximo partido del calendario nuevo.
   */
  async function startNextSeason(): Promise<void> {
    busy.value = true;
    try {
      season.value = await window.api.season.startNextSeason();
      await useGameStateStore().refresh();
      nextGame.value = await window.api.season.getNextGame();
    } finally {
      busy.value = false;
    }
  }

  return { season, nextGame, busy, dismissed, refresh, advance, startNextSeason };
});
