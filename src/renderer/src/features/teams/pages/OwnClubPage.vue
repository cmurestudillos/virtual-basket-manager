<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { useGameStateStore } from '@renderer/shared/game-state.store';
import TeamProfileView from '../components/TeamProfileView.vue';

/**
 * La ficha de tu propio club, pestaña «Club» de Equipo: la misma que la de
 * cualquier club, vista desde dentro. Sin niebla y con la moral, porque es tuyo;
 * la caja no sale aquí, que ya está en la cabecera y en Finanzas.
 */

const store = useGameStateStore();
const teamId = computed(() => store.state?.teamId ?? null);

onMounted(async () => {
  if (!store.state) {
    await store.refresh();
  }
});
</script>

<template>
  <TeamProfileView :team-id="teamId" />
</template>
