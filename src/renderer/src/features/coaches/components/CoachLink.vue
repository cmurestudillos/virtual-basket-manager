<script setup lang="ts">
import { computed } from 'vue';
import type { RouteLocationRaw } from 'vue-router';
import { countryName } from '@shared/domain/simulation-scope';
import { AppFlag, PlayerName } from '@renderer/shared/ui';

/**
 * Un entrenador en una línea: bandera y «Nombre APELLIDO», con el nombre como
 * enlace a su ficha. Va en el ranking, en la ficha de un club y en la lista de
 * clubes, sobre papel.
 *
 * El del usuario lleva a su propia ficha (la pestaña Ficha de Mánager, con su
 * carrera); cualquier otro, a `coach-profile`. El clic no sube a la fila: en
 * una tabla cuya fila entera abre otra cosa (la lista de clubes abre el club),
 * pulsar el nombre abre al entrenador.
 */

const props = withDefaults(
  defineProps<{
    id: string;
    name: string;
    nationality: string | null;
    isManager?: boolean;
  }>(),
  { isManager: false }
);

const to = computed<RouteLocationRaw>(() =>
  props.isManager ? { name: 'manager' } : { name: 'coach-profile', params: { coachId: props.id } }
);
</script>

<template>
  <span class="flex min-w-0 items-center gap-2">
    <AppFlag :code="nationality" :label="nationality ? countryName(nationality) : undefined" />
    <RouterLink
      :to="to"
      class="min-w-0 truncate font-semibold hover:text-tv-blue-ink hover:underline"
      :title="name"
      @click.stop
    >
      <PlayerName :name="name" />
    </RouterLink>
  </span>
</template>
