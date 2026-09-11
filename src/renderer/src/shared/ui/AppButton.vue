<script setup lang="ts">
import { computed } from 'vue';

/**
 * El botón del juego.
 *
 * Antes de existir había diez maneras distintas de escribir «botón principal»,
 * con tres tratamientos distintos de deshabilitado. Aquí hay dos decisiones
 * —qué pinta tiene y cuánto ocupa— y ninguna más.
 */

const props = withDefaults(
  defineProps<{
    variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
    size?: 'sm' | 'md' | 'lg';
    disabled?: boolean;
    /** Ocupa todo el ancho disponible. */
    block?: boolean;
    type?: 'button' | 'submit';
  }>(),
  { variant: 'secondary', size: 'md', disabled: false, block: false, type: 'button' }
);

const VARIANTS = {
  primary: 'border-transparent bg-ball-600 font-semibold text-court-100 hover:bg-ball-500',
  secondary: 'border-court-600 hover:bg-court-800',
  ghost: 'border-transparent text-court-300 hover:bg-court-800 hover:text-court-100',
  danger: 'border-bad-500 text-bad-400 hover:bg-bad-500 hover:text-court-100'
} as const;

const SIZES = {
  sm: 'px-3 py-1 text-xs',
  md: 'px-4 py-2 text-sm',
  lg: 'px-8 py-3 text-lg'
} as const;

const classes = computed(() => [
  'rounded border transition-colors',
  VARIANTS[props.variant],
  SIZES[props.size],
  props.block ? 'w-full' : '',
  // Un único tratamiento de deshabilitado en todo el juego.
  'disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent'
]);
</script>

<template>
  <button :type="type" :disabled="disabled" :class="classes">
    <slot />
  </button>
</template>
