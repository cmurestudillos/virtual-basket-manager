<script setup lang="ts">
import { computed } from 'vue';

/**
 * El botón del juego.
 *
 * Antes de existir había diez maneras distintas de escribir «botón principal»,
 * con tres tratamientos distintos de deshabilitado. Aquí hay tres decisiones
 * —qué pinta tiene, cuánto ocupa y si lleva el galón de «seguir»— y ninguna más.
 *
 * Con la piel de IBM: recto, sin sombra, en MAYÚSCULAS. `primary` es el azul de
 * lo que toca pulsar; `secondary`, el azul apagado de lo que está ahí pero no
 * es lo siguiente. Los dos se leen igual sobre el marco oscuro y sobre papel.
 * `ghost` es sólo letra y va sobre papel. `arrow` pone el galón «>» del
 * «Continuar» y el «Jugar» (`double`, «»», para saltar hacia delante).
 */

const props = withDefaults(
  defineProps<{
    variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
    size?: 'sm' | 'md' | 'lg';
    disabled?: boolean;
    /** Ocupa todo el ancho disponible. */
    block?: boolean;
    type?: 'button' | 'submit';
    arrow?: 'single' | 'double' | null;
  }>(),
  {
    variant: 'secondary',
    size: 'md',
    disabled: false,
    block: false,
    type: 'button',
    arrow: null
  }
);

const VARIANTS = {
  primary: 'bg-tv-blue text-white hover:brightness-110',
  secondary: 'bg-tv-blue-dim text-white hover:bg-tv-700',
  ghost: 'text-tv-blue-ink hover:bg-tv-cell',
  danger: 'bg-tv-red text-white hover:brightness-110'
} as const;

/**
 * Un único tratamiento de deshabilitado, el de IBM: el azul apagado con la
 * letra gris azulada. El discreto no tiene fondo que apagar y sólo se atenúa.
 */
const DISABLED = {
  primary: 'bg-tv-blue-dim text-tv-blue-dim-ink',
  secondary: 'bg-tv-blue-dim text-tv-blue-dim-ink',
  ghost: 'text-tv-muted opacity-60',
  danger: 'bg-tv-blue-dim text-tv-blue-dim-ink'
} as const;

const SIZES = {
  sm: 'gap-2 px-3 py-1 text-xs',
  md: 'gap-3 px-4 py-2 text-sm',
  lg: 'gap-4 px-8 py-3 text-base'
} as const;

const classes = computed(() => [
  'inline-flex items-center font-bold uppercase tracking-wide transition',
  props.arrow ? 'justify-between' : 'justify-center',
  props.disabled ? `cursor-not-allowed ${DISABLED[props.variant]}` : VARIANTS[props.variant],
  SIZES[props.size],
  props.block ? 'w-full' : ''
]);
</script>

<template>
  <button :type="type" :disabled="disabled" :class="classes">
    <span><slot /></span>
    <svg
      v-if="arrow"
      viewBox="0 0 24 24"
      class="shrink-0"
      :class="size === 'sm' ? 'h-4 w-4' : 'h-5 w-5'"
      aria-hidden="true"
    >
      <path
        v-if="arrow === 'single'"
        d="M8 3 L17 12 L8 21"
        fill="none"
        stroke="currentColor"
        stroke-width="3"
      />
      <template v-else>
        <path d="M4 4 L12 12 L4 20" fill="none" stroke="currentColor" stroke-width="3" />
        <path d="M12 4 L20 12 L12 20" fill="none" stroke="currentColor" stroke-width="3" />
      </template>
    </svg>
  </button>
</template>
