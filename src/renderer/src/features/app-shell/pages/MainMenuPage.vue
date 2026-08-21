<script setup lang="ts">
const version = __APP_VERSION__;
</script>

<template>
  <div class="flex h-screen flex-col items-center justify-center gap-10">
    <div class="text-center">
      <h1 class="text-5xl font-bold tracking-tight text-ball-500">Virtual Basket Manager</h1>
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
    </nav>

    <p class="absolute bottom-4 text-xs text-court-600">v{{ version }}</p>
  </div>
</template>
