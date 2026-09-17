<script setup lang="ts" generic="T extends string | number | null | undefined">
/**
 * La caja de texto negra de IBM: la de los filtros, el nombre de la partida,
 * la cifra de una oferta.
 *
 * Una losa `tv-slab` con el valor en blanco y negrita, y el texto de ayuda en
 * cursiva; al pasar por encima o con el foco se vuelve azul, igual que
 * `AppSelect`, para que un filtro de texto y uno de lista se lean como la misma
 * cosa. Se lee sobre papel y sobre el marco.
 *
 * Es un `<input>` de verdad y es la raíz del componente: `min`, `max`,
 * `placeholder`, `disabled` o un `@change` se le ponen como a cualquier input.
 * Con `type="number"` avisa con un número, o con `null` si se deja vacía; el
 * ancho lo decide quien lo usa (`class="w-24"`). `dense` la deja más baja, para
 * la cabecera de un panel o una fila de tabla.
 */

const props = withDefaults(
  defineProps<{
    modelValue: T;
    type?: 'text' | 'number' | 'search';
    /** Nombre para el lector de pantalla, si no hay una etiqueta que lo diga. */
    label?: string;
    /** Más baja: para la cabecera de un panel o una fila de cifras. */
    dense?: boolean;
  }>(),
  { type: 'text', label: undefined, dense: false }
);

const emit = defineEmits<{ 'update:modelValue': [value: T] }>();

function typed(event: Event): void {
  const raw = (event.target as HTMLInputElement).value;
  if (props.type === 'number') {
    emit('update:modelValue', (raw === '' ? null : Number(raw)) as T);
    return;
  }
  emit('update:modelValue', raw as T);
}
</script>

<template>
  <input
    :type="type"
    :value="modelValue ?? ''"
    :aria-label="label"
    class="figure min-w-0 bg-tv-slab px-3 text-sm font-bold text-white outline-none transition-colors [color-scheme:dark] placeholder:font-normal placeholder:italic placeholder:text-white/50 hover:bg-tv-blue focus:bg-tv-blue disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-tv-slab"
    :class="dense ? 'py-1' : 'py-2'"
    @input="typed"
  />
</template>
