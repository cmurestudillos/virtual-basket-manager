<script setup lang="ts">
import { computed } from 'vue';

/**
 * Las flechas cuadradas azules de IBM, con el texto entre medias: «JORNADA 11»,
 * «SEMANA 24», «1 / 241».
 *
 * Mueve un número entre `min` y `max`, de uno en uno. En el borde, la flecha
 * que no lleva a ningún sitio se apaga (azul apagado) en vez de desaparecer: si
 * desapareciera, el texto de en medio daría un salto.
 *
 * Va en un rótulo añil o sobre el marco: el texto es blanco. El texto sale del
 * hueco por defecto, que recibe el valor; sin hueco, «valor / máximo».
 */

const props = withDefaults(
  defineProps<{
    modelValue: number;
    min?: number;
    max: number;
    /** Nombre del conjunto para el lector de pantalla: «Jornada». */
    label?: string;
  }>(),
  { min: 1, label: 'Página' }
);

const emit = defineEmits<{ 'update:modelValue': [value: number] }>();
defineSlots<{ default?: (props: { value: number }) => unknown }>();

const atStart = computed(() => props.modelValue <= props.min);
const atEnd = computed(() => props.modelValue >= props.max);

function move(step: number): void {
  const next = Math.max(props.min, Math.min(props.max, props.modelValue + step));
  if (next !== props.modelValue) emit('update:modelValue', next);
}

const ARROW =
  'flex h-7 w-7 shrink-0 items-center justify-center transition disabled:cursor-not-allowed';
</script>

<template>
  <div class="inline-flex items-center gap-4 text-white" role="group" :aria-label="label">
    <button
      type="button"
      :class="[
        ARROW,
        atStart ? 'bg-tv-blue-dim text-tv-blue-dim-ink' : 'bg-tv-blue hover:brightness-110'
      ]"
      :disabled="atStart"
      :aria-label="`${label} anterior`"
      @click="move(-1)"
    >
      <svg viewBox="0 0 16 16" class="h-4 w-4" aria-hidden="true">
        <path d="M10.5 2.5 L5 8 L10.5 13.5" fill="none" stroke="currentColor" stroke-width="2.5" />
      </svg>
    </button>
    <span
      class="figure min-w-28 text-center text-sm font-bold uppercase tracking-wide"
      aria-live="polite"
    >
      <slot :value="modelValue">{{ modelValue }} / {{ max }}</slot>
    </span>
    <button
      type="button"
      :class="[
        ARROW,
        atEnd ? 'bg-tv-blue-dim text-tv-blue-dim-ink' : 'bg-tv-blue hover:brightness-110'
      ]"
      :disabled="atEnd"
      :aria-label="`${label} siguiente`"
      @click="move(1)"
    >
      <svg viewBox="0 0 16 16" class="h-4 w-4" aria-hidden="true">
        <path d="M5.5 2.5 L11 8 L5.5 13.5" fill="none" stroke="currentColor" stroke-width="2.5" />
      </svg>
    </button>
  </div>
</template>
