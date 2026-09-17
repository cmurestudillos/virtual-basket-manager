<script setup lang="ts" generic="T">
import { AppPanel } from '@renderer/shared/ui';

/**
 * Un cuadro de eliminatorias en columnas: una ronda por columna, de izquierda a
 * derecha, y en cada una sus cruces repartidos a lo alto, que es como se lee un
 * cuadro. Cada columna es un panel con el nombre de la ronda en el rótulo y, si
 * hace falta, la nota de cómo se juega («al mejor de 5»).
 *
 * No sabe qué es un cruce: lo pinta quien lo usa con el hueco `item`
 * (`SeriesCard` en playoffs y Europa, `MatchupCard` en la Copa y el Mundial).
 * Si las columnas no caben, el cuadro se desplaza de lado.
 */

export interface BracketColumn<Item> {
  key: string | number;
  title: string;
  note?: string;
  items: readonly Item[];
}

defineProps<{ columns: readonly BracketColumn<T>[]; itemKey: (item: T) => string }>();
defineSlots<{ item: (props: { item: T }) => unknown }>();
</script>

<template>
  <div class="grid auto-cols-[minmax(13rem,1fr)] grid-flow-col gap-3 overflow-x-auto">
    <AppPanel v-for="column in columns" :key="column.key" :title="column.title" flush>
      <div class="flex h-full flex-col gap-2 p-2">
        <p v-if="column.note" class="text-center text-xs text-tv-muted">{{ column.note }}</p>
        <ul class="flex flex-1 flex-col justify-around gap-3">
          <template v-for="item in column.items" :key="itemKey(item)">
            <slot name="item" :item="item" />
          </template>
        </ul>
      </div>
    </AppPanel>
  </div>
</template>
