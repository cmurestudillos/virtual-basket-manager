<script setup lang="ts">
/**
 * La casilla de IBM: un cuadrado con borde azul que se rellena de azul, con su
 * marca blanca, al marcarla. El texto va en el hueco por defecto y toda la
 * etiqueta se puede pulsar.
 *
 * Por dentro es un `<input type="checkbox">` de verdad, sólo que sin el dibujo
 * del sistema: el teclado, el lector de pantalla y quien la busque por su papel
 * de casilla la encuentran como tal. No trae color de letra: hereda el del sitio
 * donde va, así que se lee sobre papel y sobre el marco.
 *
 * Sin texto va **suelta**, sin etiqueta propia: es la que va dentro de una fila
 * que ya es su etiqueta (la lista de países) o en una celda de tabla, donde
 * una etiqueta dentro de otra no vale. Entonces el nombre lo pone `label`.
 */
import { useSlots } from 'vue';

withDefaults(defineProps<{ modelValue: boolean; disabled?: boolean; label?: string }>(), {
  disabled: false,
  label: undefined
});

defineEmits<{ 'update:modelValue': [value: boolean] }>();

const bare = !useSlots().default;
</script>

<template>
  <component
    :is="bare ? 'span' : 'label'"
    class="inline-flex items-center gap-2 text-sm font-semibold"
    :class="disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'"
  >
    <span class="relative inline-flex h-4 w-4 shrink-0">
      <input
        type="checkbox"
        class="peer h-4 w-4 cursor-[inherit] appearance-none border-2 border-tv-blue bg-transparent transition-colors checked:bg-tv-blue focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tv-blue"
        :checked="modelValue"
        :disabled="disabled"
        :aria-label="label"
        @change="$emit('update:modelValue', ($event.target as HTMLInputElement).checked)"
      />
      <svg
        viewBox="0 0 16 16"
        class="pointer-events-none absolute inset-0 hidden h-4 w-4 text-white peer-checked:block"
        aria-hidden="true"
      >
        <path
          d="M3.5 8.5 L6.5 11.5 L12.5 4.5"
          fill="none"
          stroke="currentColor"
          stroke-width="2.5"
        />
      </svg>
    </span>
    <slot />
  </component>
</template>
