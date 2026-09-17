<script setup lang="ts">
/**
 * El selector negro de los filtros de IBM: competición, fase, puesto.
 *
 * Una losa `tv-slab` con el valor en blanco y negrita y un «+» a la derecha; al
 * pasar por encima o con el foco se vuelve azul. Por dentro es un `<select>` de
 * verdad: el teclado, el lector de pantalla y la lista desplegable son los del
 * sistema. Se lee sobre papel y sobre el marco.
 *
 * El hueco `leading` es para lo que va delante del valor: una bandera, un icono.
 *
 * Un `<select>` cerrado enseña el mismo texto que la opción en la lista, y en lo
 * estrecho eso corta lo importante: «Kendrick MITCHELL (E · 7…». Una opción con
 * `short` enseña ese texto corto con el selector cerrado —el nombre, sin lo que
 * ya dicen las columnas de al lado— y deja el largo para la lista y para el
 * aviso al pasar el ratón.
 */
import { computed } from 'vue';

export interface SelectOption {
  id: string;
  label: string;
  /** Lo que se ve con el selector cerrado, si el `label` entero no cabe. */
  short?: string;
}

const props = withDefaults(
  defineProps<{
    options: readonly SelectOption[];
    modelValue: string;
    /** Nombre para el lector de pantalla, si no hay una etiqueta que lo diga. */
    label?: string;
    /** Para enlazarlo con un `<label for>`. */
    id?: string;
    disabled?: boolean;
  }>(),
  { label: undefined, id: undefined, disabled: false }
);

defineEmits<{ 'update:modelValue': [value: string] }>();

const selected = computed(() => props.options.find((option) => option.id === props.modelValue));
</script>

<template>
  <div
    class="relative flex min-w-40 items-center bg-tv-slab text-white transition-colors focus-within:bg-tv-blue"
    :class="disabled ? 'opacity-50' : 'hover:bg-tv-blue'"
    :title="selected?.label"
  >
    <span v-if="$slots.leading" class="flex shrink-0 items-center pl-3">
      <slot name="leading" />
    </span>
    <!-- Con texto corto, el `<select>` sigue ahí para el ratón, el teclado y el
         lector de pantalla, pero invisible y encima de todo el recuadro. -->
    <span
      v-if="selected?.short"
      class="min-w-0 flex-1 truncate py-2 pl-3 pr-9 text-sm font-bold"
      aria-hidden="true"
    >
      {{ selected.short }}
    </span>
    <select
      :id="id"
      class="cursor-pointer appearance-none bg-transparent py-2 pl-3 pr-9 text-sm font-bold outline-none disabled:cursor-not-allowed"
      :class="selected?.short ? 'absolute inset-0 w-full opacity-0' : 'w-full'"
      :value="modelValue"
      :aria-label="label"
      :disabled="disabled"
      @change="$emit('update:modelValue', ($event.target as HTMLSelectElement).value)"
    >
      <option
        v-for="option in options"
        :key="option.id"
        :value="option.id"
        class="bg-tv-slab text-white"
      >
        {{ option.label }}
      </option>
    </select>
    <svg
      viewBox="0 0 16 16"
      class="pointer-events-none absolute right-3 h-3.5 w-3.5"
      aria-hidden="true"
    >
      <path d="M8 2 V14 M2 8 H14" stroke="currentColor" stroke-width="2.5" />
    </svg>
  </div>
</template>
