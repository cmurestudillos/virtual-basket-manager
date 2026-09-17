<script setup lang="ts">
/**
 * La pizarra en mitad del partido.
 *
 * Aquí sólo está lo que un entrenador cambia sobre la marcha: la defensa, el
 * ataque y los dos deslizadores que se tocan desde el banquillo. La referencia
 * ofensiva y el reparto de minutos no están a propósito — eso se decide antes
 * del partido, en la pizarra de verdad, y meterlo aquí convertiría el directo
 * en un formulario.
 */
import type { LiveTacticsPatch } from '@shared/contracts/match.contract';
import {
  DEFENSIVE_SYSTEM_LABELS,
  OFFENSIVE_SYSTEM_LABELS,
  type DefensiveSystem,
  type OffensiveSystem
} from '@shared/domain/tactics';
import { AppSelect } from '@renderer/shared/ui';

const props = defineProps<{
  offensiveSystem: OffensiveSystem;
  defensiveSystem: DefensiveSystem;
  pace: number;
  defensiveIntensity: number;
  disabled: boolean;
}>();

const emit = defineEmits<{ change: [patch: LiveTacticsPatch] }>();

/** Las opciones del selector negro, el mismo de la pizarra de antes del partido. */
const OFFENSES = Object.entries(OFFENSIVE_SYSTEM_LABELS).map(([id, label]) => ({ id, label }));
const DEFENSES = Object.entries(DEFENSIVE_SYSTEM_LABELS).map(([id, label]) => ({ id, label }));

function slide(key: 'pace' | 'defensiveIntensity', event: Event): void {
  const value = Number((event.target as HTMLInputElement).value);
  emit('change', { [key]: value });
}
</script>

<template>
  <div class="flex flex-col gap-4 text-sm text-tv-ink">
    <p class="text-tv-muted">Los cambios se aplican en la siguiente posesión.</p>
    <label class="flex flex-col gap-1">
      <span class="text-xs font-semibold uppercase tracking-wide">Defensa</span>
      <AppSelect
        :model-value="props.defensiveSystem"
        :options="DEFENSES"
        :disabled="disabled"
        @update:model-value="emit('change', { defensiveSystem: $event as DefensiveSystem })"
      />
    </label>

    <label class="flex flex-col gap-1">
      <span class="text-xs font-semibold uppercase tracking-wide">Ataque</span>
      <AppSelect
        :model-value="props.offensiveSystem"
        :options="OFFENSES"
        :disabled="disabled"
        @update:model-value="emit('change', { offensiveSystem: $event as OffensiveSystem })"
      />
    </label>

    <label class="flex flex-col gap-1">
      <span class="flex justify-between text-xs font-semibold uppercase tracking-wide">
        <span>Ritmo</span>
        <span class="figure">{{ props.pace }}</span>
      </span>
      <input
        type="range"
        min="1"
        max="10"
        class="accent-tv-blue"
        :value="props.pace"
        :disabled="disabled"
        @change="slide('pace', $event)"
      />
    </label>

    <label class="flex flex-col gap-1">
      <span class="flex justify-between text-xs font-semibold uppercase tracking-wide">
        <span>Intensidad defensiva</span>
        <span class="figure">{{ props.defensiveIntensity }}</span>
      </span>
      <input
        type="range"
        min="1"
        max="10"
        class="accent-tv-blue"
        :value="props.defensiveIntensity"
        :disabled="disabled"
        @change="slide('defensiveIntensity', $event)"
      />
    </label>
  </div>
</template>
