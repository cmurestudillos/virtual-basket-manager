<script setup lang="ts">
/**
 * El menú de inicio, sobre el fondo morado con franjas: es de las pocas
 * pantallas que lo llevan (menú, asistente y vacíos). IBM no tiene captura de
 * su menú; se sigue el asistente de nueva partida: título blanco y botones
 * grandes azules en mayúsculas.
 *
 * Son enlaces y no botones: cada uno abre una ruta, y el arnés los busca así.
 */
import { AppBackdrop, AppButton, AppPanel } from '@renderer/shared/ui';
import { useUpdates } from '@renderer/features/updates/useUpdates';

const version = __APP_VERSION__;
/** Una versión descargada se anuncia en el menú: es donde se reinicia sin perder nada. */
const updates = useUpdates();

const ITEMS = [
  { route: 'new-game', label: 'Nueva partida' },
  { route: 'saves', label: 'Cargar partida' },
  { route: 'world-editor', label: 'Editor del mundo' },
  { route: 'settings', label: 'Ajustes' }
] as const;
</script>

<template>
  <AppBackdrop class="h-screen">
    <div class="relative flex h-screen flex-col items-center justify-center gap-10 px-4">
      <div class="text-center">
        <h1 class="text-6xl font-bold uppercase tracking-wide text-white">Triple Manager</h1>
        <p class="mt-2 text-lg text-white/80">Manager de baloncesto</p>
      </div>

      <nav aria-label="Menú principal" class="flex w-80 flex-col gap-3">
        <RouterLink
          v-for="item in ITEMS"
          :key="item.route"
          :to="{ name: item.route }"
          class="bg-tv-blue px-8 py-3 text-center text-base font-bold uppercase tracking-wide text-white transition hover:brightness-110"
        >
          {{ item.label }}
        </RouterLink>
      </nav>

      <div
        v-if="updates.view.value?.state.status === 'downloaded'"
        class="w-full max-w-md"
        role="status"
      >
        <AppPanel title="Actualización">
          <div class="flex items-center justify-between gap-4 text-sm">
            <span
              >La versión {{ updates.view.value.state.version }} está lista para instalarse.</span
            >
            <AppButton variant="primary" size="sm" @click="updates.install">
              Reiniciar e instalar
            </AppButton>
          </div>
        </AppPanel>
      </div>

      <p class="figure absolute bottom-4 text-xs text-white/50">v{{ version }}</p>
    </div>
  </AppBackdrop>
</template>
