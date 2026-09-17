<script setup lang="ts">
/**
 * Los puntos de progreso del asistente de nueva partida, como IBM (130904): uno
 * por paso, el actual en azul con halo y el resto en gris.
 *
 * Son botones: se vuelve a un paso ya hecho de una pulsada. Los que todavía no
 * se pueden abrir —falta elegir club o escribir el nombre— están
 * deshabilitados, así que no se llega al final saltándose lo que hace falta.
 * El nombre del paso va en la etiqueta, para el lector de pantalla y al pasar
 * por encima.
 */

export interface WizardStep {
  id: string;
  label: string;
}

defineProps<{
  steps: readonly WizardStep[];
  current: number;
  /** El último paso al que se puede saltar. */
  reachable: number;
}>();

defineEmits<{ go: [index: number] }>();
</script>

<template>
  <ol class="flex items-center gap-1" aria-label="Pasos de la nueva partida">
    <li v-for="(step, index) in steps" :key="step.id">
      <button
        type="button"
        class="group flex h-8 w-8 items-center justify-center disabled:cursor-default"
        :disabled="index > reachable"
        :title="step.label"
        :aria-label="`Paso ${index + 1} de ${steps.length}: ${step.label}`"
        :aria-current="index === current ? 'step' : undefined"
        @click="$emit('go', index)"
      >
        <span
          aria-hidden="true"
          class="block rounded-full transition-colors"
          :class="
            index === current
              ? 'h-3.5 w-3.5 bg-tv-blue ring-4 ring-tv-blue/30'
              : 'h-2 w-2 bg-tv-step group-enabled:group-hover:bg-white'
          "
        ></span>
      </button>
    </li>
  </ol>
</template>
