<script setup lang="ts">
import { computed } from 'vue';
import { RATING_BAND_FLOOR } from './tones';

/**
 * Los atributos de un jugador como en la ficha de IBM: cada uno con su etiqueta
 * y su número grande, sin barra, en tres o cuatro columnas. Los fuertes llevan
 * la fila en verde claro (`tv-strong`). Va sobre papel.
 *
 * Números y no barras porque en una ficha se comparan atributos de cabeza —«77
 * de lucha, 60 de triple»— y una barra obliga a estimar lo que el número dice.
 *
 * **Qué es fuerte.** Por defecto, lo que está en el tramo alto de la escala (80
 * o más): es la misma frontera que pinta de verde el anillo de media, así que
 * «fuerte» se lee igual en toda la ficha. IBM no resalta por un número fijo
 * —en una misma ficha marca un 77 y deja sin marcar un 83—, sino por lo que
 * pesa en el puesto; el juego no tiene ese dato, y por eso cada atributo puede
 * decir `strong` a mano cuando quien lo pinta sí lo sabe.
 */

export interface AttributeItem {
  id: string;
  label: string;
  value: number;
  /** Fuerte o no, a mano. Si no se dice, lo decide `threshold`. */
  strong?: boolean;
}

const props = withDefaults(
  defineProps<{
    items: readonly AttributeItem[];
    columns?: 3 | 4;
    /** Desde qué valor es fuerte un atributo que no lo dice. */
    threshold?: number;
  }>(),
  { columns: 4, threshold: RATING_BAND_FLOOR.top }
);

const rows = computed(() =>
  props.items.map((item) => ({
    ...item,
    isStrong: item.strong ?? Math.round(item.value) >= props.threshold
  }))
);

const perColumn = computed(() => Math.max(1, Math.ceil(props.items.length / props.columns)));
</script>

<template>
  <!-- Se llena por columnas, como IBM: cada columna puede ser un grupo (mental,
       físico, defensa, ataque) si los atributos llegan en ese orden. -->
  <dl
    class="grid grid-flow-col gap-[3px] text-tv-ink"
    :class="columns === 3 ? 'grid-cols-3' : 'grid-cols-4'"
    :style="{ gridTemplateRows: `repeat(${perColumn}, auto)` }"
  >
    <div v-for="item in rows" :key="item.id" class="grid grid-cols-[1fr_auto] gap-[3px]">
      <dt
        class="flex items-center truncate px-3 py-2 text-sm"
        :class="item.isStrong ? 'bg-tv-strong' : 'bg-tv-cell'"
      >
        {{ item.label }}
      </dt>
      <dd
        class="figure m-0 flex w-14 items-center justify-center text-xl font-bold"
        :class="item.isStrong ? 'bg-tv-strong' : 'bg-tv-cell'"
      >
        {{ Math.round(item.value) }}
      </dd>
    </div>
  </dl>
</template>
