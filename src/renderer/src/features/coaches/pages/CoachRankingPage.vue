<script setup lang="ts">
/**
 * El ranking de entrenadores, segunda pestaña de la sección Mánager: todos los
 * banquillos del mundo, el del usuario incluido, por puntos (los de este curso
 * enteros y la mitad de los del anterior).
 *
 * Como la tabla RANKING ENTRENADORES de IBM (130718), pero entera y paginada de
 * 25 en 25. El alcance —el mundo, un continente, un país o una competición— se
 * elige en el selector negro de la barra de sección; el paginador va en el
 * rótulo, y «Mi puesto», en la barra de acciones, salta a la página del
 * usuario. Su fila va en azul pálido y, si no está en la página, fija debajo.
 */
import { computed, onMounted, ref } from 'vue';
import type {
  CoachRankingPage,
  CoachRankingRequest,
  CoachRankingScope
} from '@shared/contracts/coaches.contract';
import { formatWhole } from '@renderer/shared/format';
import {
  AppButton,
  AppEmpty,
  AppPager,
  AppPanel,
  AppSelect,
  type SelectOption
} from '@renderer/shared/ui';
import PageActions from '@renderer/features/app-shell/components/PageActions.vue';
import PageToolbar from '@renderer/features/app-shell/components/PageToolbar.vue';
import CoachRankingTable from '../components/CoachRankingTable.vue';

/** El alcance elegido en el selector: `world`, o `continent:EUR`, `country:ESP`… */
const scopeKey = ref('world');
const ranking = ref<CoachRankingPage | null>(null);
const failure = ref<string | null>(null);

/** Cuenta las cargas: si se pasa de página deprisa, sólo vale la última. */
let request = 0;

function parseScope(key: string): { scope: CoachRankingScope; id: string | null } {
  const [scope, ...rest] = key.split(':');
  if (scope === 'continent' || scope === 'country' || scope === 'competition') {
    return { scope, id: rest.join(':') || null };
  }
  return { scope: 'world', id: null };
}

async function load(page: number, aroundManager = false): Promise<void> {
  const current = ++request;
  const payload: CoachRankingRequest = { ...parseScope(scopeKey.value), page, aroundManager };
  try {
    const found = await window.api.coaches.ranking(payload);
    if (current !== request) return;
    ranking.value = found;
    failure.value = null;
  } catch {
    if (current !== request) return;
    failure.value = 'No se ha podido cargar el ranking.';
  }
}

onMounted(() => load(1));

function changeScope(key: string): void {
  scopeKey.value = key;
  void load(1);
}

/**
 * Las opciones del alcance, en ese orden: el mundo, los continentes, los países y
 * las competiciones. En la lista llevan detrás qué son («España · país»); cerrado,
 * el selector enseña sólo el nombre.
 */
const scopeOptions = computed<SelectOption[]>(() => {
  const filters = ranking.value?.filters;
  const options: SelectOption[] = [{ id: 'world', label: 'Mundo' }];
  if (!filters) return options;
  for (const option of filters.continents) {
    options.push({
      id: `continent:${option.id}`,
      label: `${option.label} · continente`,
      short: option.label
    });
  }
  for (const option of filters.countries) {
    options.push({
      id: `country:${option.id}`,
      label: `${option.label} · país`,
      short: option.label
    });
  }
  for (const option of filters.competitions) {
    options.push({
      id: `competition:${option.id}`,
      label: `${option.label} · competición`,
      short: option.label
    });
  }
  return options;
});

const pageCount = computed(() => Math.max(1, ranking.value?.pageCount ?? 1));
const hint = computed(() => {
  const total = ranking.value?.total ?? 0;
  return `${formatWhole(total)} ${total === 1 ? 'entrenador' : 'entrenadores'}`;
});
</script>

<template>
  <div class="flex h-full min-h-0 flex-col gap-4">
    <PageToolbar>
      <AppSelect
        :model-value="scopeKey"
        :options="scopeOptions"
        label="Alcance del ranking"
        @update:model-value="changeScope"
      />
    </PageToolbar>
    <PageActions>
      <AppButton
        variant="primary"
        :disabled="!ranking?.managerRow"
        title="Salta a la página en la que estás"
        @click="load(1, true)"
      >
        Mi puesto
      </AppButton>
    </PageActions>

    <!-- Con desplazamiento propio: el paginador y la fila del usuario, siempre a la vista. -->
    <AppPanel title="Ranking de entrenadores" :hint="hint" flush scroll class="min-h-0 flex-1">
      <template #actions>
        <AppPager
          v-if="ranking"
          :model-value="ranking.page"
          :max="pageCount"
          label="Página"
          @update:model-value="load($event)"
        >
          <template #default="{ value }">Página {{ value }} / {{ pageCount }}</template>
        </AppPager>
      </template>
      <AppEmpty v-if="!ranking">{{ failure ?? 'Cargando el ranking…' }}</AppEmpty>
      <AppEmpty v-else-if="ranking.rows.length === 0">
        Nadie entrena en este alcance todavía.
      </AppEmpty>
      <CoachRankingTable v-else :rows="ranking.rows" :pinned="ranking.managerRow" />
    </AppPanel>
  </div>
</template>
