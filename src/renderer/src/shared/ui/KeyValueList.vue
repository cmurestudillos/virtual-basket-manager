<script setup lang="ts">
/**
 * La tabla clave-valor de una ficha: equipo, puesto, altura, contrato.
 *
 * Etiqueta a la izquierda y valor a la derecha, en filas alternas gris y papel,
 * como la ficha de IBM. Va sobre papel. El valor puede ser texto o lo que haga
 * falta —una bandera, un chip de puesto, estrellas— con el hueco `value`, que
 * recibe la fila.
 */

export interface KeyValueItem {
  id: string;
  label: string;
  value?: string | number | null;
}

defineProps<{ items: readonly KeyValueItem[] }>();
defineSlots<{ value?: (props: { item: KeyValueItem }) => unknown }>();
</script>

<template>
  <dl class="flex flex-col text-sm text-tv-ink">
    <div
      v-for="item in items"
      :key="item.id"
      class="flex min-h-9 items-center justify-between gap-4 px-3 py-1.5 odd:bg-tv-cell"
    >
      <dt class="font-semibold">{{ item.label }}</dt>
      <dd class="m-0 flex min-w-0 items-center justify-end gap-2 text-right text-tv-muted">
        <slot name="value" :item="item">{{ item.value ?? '-' }}</slot>
      </dd>
    </div>
  </dl>
</template>
