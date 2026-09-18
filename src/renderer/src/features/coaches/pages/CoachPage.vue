<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import CoachProfileView from '../components/CoachProfileView.vue';

/**
 * La ficha de cualquier entrenador (`/game/manager/coach/:coachId`), que cuenta
 * como sección Mánager sin pestaña propia. Se abre desde el ranking, el top 5
 * de una ficha, la ficha de un club y la lista de clubes.
 *
 * Es la misma vista que la del usuario, sin las acciones de carrera: esas sólo
 * están en la pestaña Ficha.
 */

const route = useRoute();
const coachId = computed(() => (route.params.coachId ? String(route.params.coachId) : null));
</script>

<template>
  <CoachProfileView v-if="coachId" :coach-id="coachId" />
</template>
