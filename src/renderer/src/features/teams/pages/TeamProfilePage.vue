<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import TeamProfileView from '../components/TeamProfileView.vue';

/**
 * La ficha de cualquier club (`/game/club/:teamId`), que cuenta como sección
 * Competición. Se abre desde la clasificación, los resultados, la lista de
 * clubes, el mercado, la ficha del jugador y el inicio.
 *
 * Lo que se ve de un club ajeno lo decide el proceso principal (ver
 * `team-profile.service.ts`); la pantalla es la misma que la del club propio.
 */

const route = useRoute();
const teamId = computed(() => (route.params.teamId ? String(route.params.teamId) : null));
</script>

<template>
  <TeamProfileView :team-id="teamId" />
</template>
