<script setup lang="ts">
import { useUpdates } from '@renderer/features/updates/useUpdates';

const version = __APP_VERSION__;
/** Una versión descargada se anuncia en el menú: es donde se reinicia sin perder nada. */
const updates = useUpdates();
</script>

<template>
  <div class="flex h-screen flex-col items-center justify-center gap-10">
    <div class="text-center">
      <h1 class="text-5xl font-bold tracking-tight text-ball-500">Triple Manager</h1>
      <p class="mt-2 text-court-300">Manager de baloncesto</p>
    </div>

    <nav class="flex w-64 flex-col gap-3">
      <RouterLink
        :to="{ name: 'new-game' }"
        class="rounded bg-ball-600 px-4 py-3 text-center font-semibold hover:bg-ball-500"
      >
        Nueva partida
      </RouterLink>
      <RouterLink
        :to="{ name: 'saves' }"
        class="rounded border border-court-600 px-4 py-3 text-center hover:bg-court-800"
      >
        Cargar partida
      </RouterLink>
      <RouterLink
        :to="{ name: 'world-editor' }"
        class="rounded border border-court-700 px-4 py-3 text-center text-court-300 hover:bg-court-800"
      >
        Editor del mundo
      </RouterLink>
      <RouterLink
        :to="{ name: 'settings' }"
        class="rounded border border-court-700 px-4 py-3 text-center text-court-300 hover:bg-court-800"
      >
        Ajustes
      </RouterLink>
    </nav>

    <div
      v-if="updates.view.value?.state.status === 'downloaded'"
      class="flex items-center gap-4 rounded border border-ball-500 px-4 py-3 text-sm"
      role="status"
    >
      <span> La versión {{ updates.view.value.state.version }} está lista para instalarse. </span>
      <button
        type="button"
        class="rounded bg-ball-600 px-3 py-1.5 font-semibold hover:bg-ball-500"
        @click="updates.install"
      >
        Reiniciar e instalar
      </button>
    </div>

    <p class="absolute bottom-4 text-xs text-court-600">v{{ version }}</p>
  </div>
</template>
