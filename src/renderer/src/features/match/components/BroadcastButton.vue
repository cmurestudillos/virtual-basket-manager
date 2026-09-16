<script setup lang="ts">
/**
 * El botón de la retransmisión: azul intenso el que toca pulsar, azul apagado
 * el que está ahí pero no es lo siguiente. Con `arrow` lleva el galón de
 * «seguir», como el «Jugar» y el «Continuar» de IBM.
 */
withDefaults(
  defineProps<{
    variant?: 'primary' | 'muted';
    arrow?: 'single' | 'double' | null;
    disabled?: boolean;
  }>(),
  { variant: 'primary', arrow: null, disabled: false }
);

const emit = defineEmits<{ click: [event: MouseEvent] }>();
</script>

<template>
  <button
    type="button"
    class="flex items-center justify-between gap-3 px-4 py-2 text-sm font-bold uppercase tracking-wide text-white transition disabled:cursor-not-allowed disabled:opacity-45"
    :class="
      variant === 'primary'
        ? 'bg-tv-blue hover:brightness-110'
        : 'bg-tv-blue-dim text-white/85 hover:bg-tv-600'
    "
    :disabled="disabled"
    @click="emit('click', $event)"
  >
    <span><slot /></span>
    <svg v-if="arrow" viewBox="0 0 24 24" class="h-5 w-5" aria-hidden="true">
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
