<script setup lang="ts">
/**
 * El paso a paso de IBM: «−», la cifra en su caja negra y «+», con los botones
 * cuadrados en azul. Para un número que se retoca de uno en uno —los minutos de
 * un jugador en la rotación— sin arrastrar un deslizador en una fila de tabla.
 *
 * La caja del medio es un `<input type="number">` de verdad: se puede escribir
 * la cifra entera, y el teclado y el lector de pantalla la tratan como tal. Lo
 * que se sale de `min` y `max` se recorta antes de avisar. En el borde, el botón
 * que no lleva a ningún sitio se apaga (azul apagado), igual que en `AppPager`.
 *
 * Se lee sobre papel y sobre el marco: los botones y la caja ya traen su color.
 */

const props = withDefaults(
  defineProps<{
    modelValue: number;
    min?: number;
    max?: number;
    step?: number;
    /** Qué número es, para el lector de pantalla: «Minutos de Teo ARRAIZ». */
    label: string;
    disabled?: boolean;
  }>(),
  { min: 0, max: 100, step: 1, disabled: false }
);

const emit = defineEmits<{ 'update:modelValue': [value: number] }>();

function clamp(value: number): number {
  return Math.max(props.min, Math.min(props.max, Math.round(value)));
}

function move(delta: number): void {
  const next = clamp(props.modelValue + delta);
  if (next !== props.modelValue) emit('update:modelValue', next);
}

function typed(event: Event): void {
  const raw = (event.target as HTMLInputElement).value;
  // A medio escribir (la caja vacía) no se avisa: se espera a que haya número.
  if (raw !== '') emit('update:modelValue', clamp(Number(raw)));
}

/** Al salir de la caja se enseña lo que quedó de verdad, ya recortado. */
function settle(event: Event): void {
  (event.target as HTMLInputElement).value = String(props.modelValue);
}

const BUTTON =
  'flex h-7 w-7 shrink-0 items-center justify-center transition disabled:cursor-not-allowed';
const LIVE = 'bg-tv-blue text-white hover:brightness-110';
const DEAD = 'bg-tv-blue-dim text-tv-blue-dim-ink';
</script>

<template>
  <div class="inline-flex items-stretch gap-[3px]" role="group" :aria-label="label">
    <button
      type="button"
      :class="[BUTTON, disabled || modelValue <= min ? DEAD : LIVE]"
      :disabled="disabled || modelValue <= min"
      :aria-label="`${label}: menos`"
      @click="move(-step)"
    >
      <svg viewBox="0 0 16 16" class="h-3.5 w-3.5" aria-hidden="true">
        <path d="M2 8 H14" stroke="currentColor" stroke-width="2.5" />
      </svg>
    </button>
    <input
      type="number"
      class="stepper-input figure w-11 bg-tv-slab text-center text-sm font-bold text-white outline-none focus-visible:bg-tv-blue disabled:opacity-60"
      :min="min"
      :max="max"
      :step="step"
      :value="modelValue"
      :disabled="disabled"
      :aria-label="label"
      @input="typed"
      @change="settle"
    />
    <button
      type="button"
      :class="[BUTTON, disabled || modelValue >= max ? DEAD : LIVE]"
      :disabled="disabled || modelValue >= max"
      :aria-label="`${label}: más`"
      @click="move(step)"
    >
      <svg viewBox="0 0 16 16" class="h-3.5 w-3.5" aria-hidden="true">
        <path d="M8 2 V14 M2 8 H14" stroke="currentColor" stroke-width="2.5" />
      </svg>
    </button>
  </div>
</template>

<style scoped>
/* Sin las flechitas del sistema: para eso están los botones de los lados. */
.stepper-input {
  appearance: textfield;
}

.stepper-input::-webkit-inner-spin-button,
.stepper-input::-webkit-outer-spin-button {
  appearance: none;
  margin: 0;
}
</style>
