<script setup lang="ts">
/**
 * El marco del juego, a imagen de IBM 23: barra de arriba con CONTINUAR
 * (`GameTopBar`), barra lateral de iconos (`GameRail`), barra de sección con
 * pestañas (`SectionBar`), la pantalla y, si la pantalla trae botones, la barra
 * de acciones de abajo (`ActionBar`).
 *
 *   ┌──────────────────────────────────────────────┐  72 px
 *   │ escudo · equipo y caja · entrenador · fecha · CONTINUAR
 *   ├────┬─────────────────────────────────────────┤  50 px
 *   │    │ SECCIÓN | pestañas            controles │
 *   │ ic ├─────────────────────────────────────────┤
 *   │ on │ la pantalla (con su propio scroll)      │
 *   │ os ├─────────────────────────────────────────┤  55 px, si hay acciones
 *   │    │                               acciones  │
 *   └────┴─────────────────────────────────────────┘
 *
 * El marco no se desplaza: sólo la zona de la pantalla, sobre el fondo liso
 * `tv-canvas` (el morado con franjas es para el menú, el asistente y los vacíos).
 *
 * Las pantallas meten cosas en las barras con `PageToolbar` (pestañas propias o
 * controles en la barra de sección) y `PageActions` (botones abajo): un
 * `Teleport` a los huecos con id que pintan `SectionBar` y `ActionBar`. Ver
 * `features/app-shell/page-chrome.ts`. Las secciones y sus pestañas están en
 * `features/app-shell/sections.ts`.
 */
import { onMounted, provide, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useGameStateStore } from '@renderer/shared/game-state.store';
import { useInboxStore } from '@renderer/features/inbox/inbox.store';
import { useContinueStore } from '@renderer/features/season/continue.store';
import { PAGE_CHROME } from '@renderer/features/app-shell/page-chrome';
import GameTopBar from '@renderer/features/app-shell/components/GameTopBar.vue';
import GameRail from '@renderer/features/app-shell/components/GameRail.vue';
import SectionBar from '@renderer/features/app-shell/components/SectionBar.vue';
import ActionBar from '@renderer/features/app-shell/components/ActionBar.vue';
import AdvanceDaysModal from '@renderer/features/app-shell/components/AdvanceDaysModal.vue';

const store = useGameStateStore();
const inbox = useInboxStore();
const continuing = useContinueStore();
const router = useRouter();
const route = useRoute();

/** Cuántas `PageActions` hay montadas: con ninguna, la barra de abajo no se ve. */
const actions = ref(0);
provide(PAGE_CHROME, { actions });

onMounted(async () => {
  await store.refresh();
  // Entrar a una pantalla de juego sin partida cargada (recarga en caliente,
  // enlace directo) devuelve al menú en vez de pintar una cabecera vacía.
  if (!store.state) {
    await router.replace({ name: 'main-menu' });
    return;
  }
  await Promise.all([inbox.refresh(), continuing.refresh()]);
});

// El contador se pone al día cuando puede haber pasado algo: al moverse el reloj
// —una lesión, un fichaje— o al cambiar de pantalla, que es cuando se vuelve de
// jugar un partido y puede haber rueda de prensa esperando.
watch(
  () => store.state?.currentDate,
  () => void inbox.refresh()
);
// Y CONTINUAR, que depende de la carrera y del consejo: una pantalla puede
// cambiarlos (dimitir desde el historial, firmar desde el club). A mitad de un
// avance no hace falta: el propio avance relee todo al acabar.
watch(
  () => route.fullPath,
  () => {
    void inbox.refresh();
    if (store.state && !continuing.busy) {
      void continuing.refresh();
    }
  }
);
</script>

<template>
  <div
    class="grid h-screen grid-cols-[48px_minmax(0,1fr)] grid-rows-[72px_50px_minmax(0,1fr)_auto] bg-tv-canvas text-white"
  >
    <GameTopBar class="col-span-2" />
    <GameRail class="row-span-3" />
    <SectionBar />

    <!-- La barra de desplazamiento, oscura: la clara de serie sobre `tv-canvas` es un borrón blanco. -->
    <main class="overflow-auto p-4 [scrollbar-color:var(--color-tv-muted)_transparent]">
      <RouterView />
    </main>

    <!-- `v-show` y no `v-if`: el hueco tiene que existir para que llegue el Teleport. -->
    <ActionBar v-show="actions > 0" />

    <AdvanceDaysModal />
  </div>
</template>
