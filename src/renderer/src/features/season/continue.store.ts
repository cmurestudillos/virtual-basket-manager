import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import type { BoardView } from '@shared/contracts/club.contract';
import type { CareerStatus } from '@shared/contracts/career.contract';
import { useGameStateStore } from '@renderer/shared/game-state.store';
import { useSeasonStore } from './season.store';
import {
  canAdvanceDay,
  continueKey,
  decideContinue,
  isRepeating,
  rivalOf,
  roundBeforeNextGame,
  type ContinueAction,
  type ContinueKind
} from './continue-action';

/** Lo que está haciendo el juego mientras sale el aviso de avance de días. */
export interface AdvanceProgress {
  kind: ContinueKind | 'day' | 'waitMonth';
  /** Se puede parar entre una llamada y la siguiente. */
  stoppable: boolean;
}

/**
 * Tope de llamadas de un solo CONTINUAR. Cada una avanza al menos un día, y
 * una temporada entera, con verano, no llega a 400: si se alcanza es que algo
 * no se mueve, y mejor pararse que dejar la pantalla colgada.
 */
const MAX_STEPS = 1000;

/**
 * CONTINUAR: qué hace ahora y hacerlo.
 *
 * Guarda también la carrera y el consejo, que son los que deciden si hay
 * banquillo: el panel del club los lee de aquí en vez de pedirlos por su
 * cuenta, para que la barra de arriba y la pantalla no discrepen.
 *
 * Como `useSeasonStore`, no navega: `run` y compañía devuelven el id del
 * partido en el que hay que entrar, y `useContinue` es quien cambia de pantalla.
 */
export const useContinueStore = defineStore('continue', () => {
  const gameState = useGameStateStore();
  const seasonStore = useSeasonStore();

  const career = ref<CareerStatus | null>(null);
  const board = ref<BoardView | null>(null);
  const progress = ref<AdvanceProgress | null>(null);
  const stopRequested = ref(false);

  /** Sin equipo y con clubes preguntando: no hay nada más que hacer hasta firmar. */
  const unemployed = computed(() => career.value?.careerMode === true && career.value.unemployed);
  /** Sin club pero con selección: sus partidos se siguen dirigiendo. */
  const nationalOnly = computed(() => unemployed.value && Boolean(career.value?.nationalTeamName));

  const context = computed(() => ({
    hasGame: gameState.state !== null,
    season: seasonStore.season,
    nextGame: seasonStore.nextGame,
    dismissed: seasonStore.dismissed || board.value?.dismissed === true,
    unemployed: unemployed.value,
    nationalOnly: nationalOnly.value,
    canWait: career.value?.canWait === true
  }));

  const action = computed<ContinueAction>(() => decideContinue(context.value));
  /** Ver {@link roundBeforeNextGame}: el panel del club la enseña. */
  const roundBefore = computed(() => roundBeforeNextGame(context.value));

  const busy = computed(() => seasonStore.busy || progress.value !== null);
  const dayAvailable = computed(() => canAdvanceDay(action.value));
  /** Con selección y sin club, esperar un mes sigue siendo posible, pero no es lo principal. */
  const waitAvailable = computed(() => nationalOnly.value && career.value?.canWait === true);

  /** El rival del próximo partido propio, para el botón y el aviso. */
  const rival = computed(() => {
    const next = seasonStore.nextGame;
    return next
      ? rivalOf(next, gameState.state?.teamId ?? null, career.value?.nationalTeamName ?? null)
      : null;
  });

  async function refresh(): Promise<void> {
    if (!gameState.state) {
      career.value = null;
      board.value = null;
      return;
    }
    const [status, view] = await Promise.all([
      window.api.career.getStatus(),
      window.api.club.getBoard(),
      seasonStore.refresh()
    ]);
    career.value = status;
    board.value = view;
  }

  /** Pide parar un avance largo: se hace al acabar la llamada en curso. */
  function requestStop(): void {
    if (progress.value?.stoppable) {
      stopRequested.value = true;
    }
  }

  async function track<T>(next: AdvanceProgress, work: () => Promise<T>): Promise<T | null> {
    if (busy.value) {
      return null;
    }
    stopRequested.value = false;
    progress.value = next;
    try {
      return await work();
    } finally {
      progress.value = null;
      stopRequested.value = false;
      // El consejo y la carrera pueden haber cambiado por el camino (un
      // despido, ofertas de verano): la siguiente decisión tiene que verlos.
      await refresh();
    }
  }

  /**
   * Repite `advanceToNextGame` mientras CONTINUAR siga significando lo mismo.
   * Se para en el partido del usuario (y lo devuelve), con un despido, si el
   * reloj no se mueve, si cambia lo que toca hacer o si se pide parar.
   */
  async function advanceWhileSame(first: ContinueAction): Promise<string | null> {
    const key = continueKey(first);
    for (let step = 0; step < MAX_STEPS; step += 1) {
      const before = gameState.state?.currentDate;
      const gameId = await seasonStore.advance('nextGame');
      if (gameId) {
        return gameId;
      }
      if (
        seasonStore.dismissed ||
        stopRequested.value ||
        gameState.state?.currentDate === before ||
        continueKey(action.value) !== key
      ) {
        return null;
      }
    }
    return null;
  }

  /** CONTINUAR. Devuelve el partido en el que hay que entrar, si lo hay. */
  async function run(): Promise<string | null> {
    const current = action.value;
    switch (current.kind) {
      case 'none':
        return null;
      case 'wait':
        return track({ kind: 'wait', stoppable: false }, waitMonthNow);
      case 'startSeason':
        return track({ kind: 'startSeason', stoppable: false }, async () => {
          await seasonStore.startNextSeason();
          return null;
        });
      default:
        return track({ kind: current.kind, stoppable: isRepeating(current) }, () =>
          advanceWhileSame(current)
        );
    }
  }

  /** «Avanzar día», la acción pequeña de al lado. */
  async function advanceDay(): Promise<string | null> {
    if (!dayAvailable.value) {
      return null;
    }
    return track({ kind: 'day', stoppable: false }, () => seasonStore.advance('day'));
  }

  /** «Esperar un mes» cuando no es lo principal: sin club, pero con selección. */
  async function waitMonth(): Promise<string | null> {
    if (!waitAvailable.value) {
      return null;
    }
    return track({ kind: 'waitMonth', stoppable: false }, waitMonthNow);
  }

  /**
   * Un mes en el paro. El reloj corre sin banquillo —la IA juega todo— y a la
   * vuelta hay otros clubes con el suyo abierto.
   */
  async function waitMonthNow(): Promise<null> {
    career.value = await window.api.career.wait();
    await gameState.refresh();
    await seasonStore.refresh();
    return null;
  }

  return {
    career,
    board,
    progress,
    stopRequested,
    unemployed,
    nationalOnly,
    action,
    roundBefore,
    busy,
    dayAvailable,
    waitAvailable,
    rival,
    refresh,
    requestStop,
    run,
    advanceDay,
    waitMonth
  };
});
