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
import { AppScale, AppSelect } from '@renderer/shared/ui';

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

    <!-- Los mismos deslizadores que la pizarra de antes del partido; el cambio
         sale al soltar, no con cada paso del arrastre. -->
    <AppScale
      :model-value="props.pace"
      label="Ritmo"
      :stops="['Pausado', 'Normal', 'Corriendo']"
      :disabled="disabled"
      @change="emit('change', { pace: $event })"
    />
    <AppScale
      :model-value="props.defensiveIntensity"
      label="Intensidad defensiva"
      :stops="['Blanda', 'Normal', 'Agresiva']"
      :disabled="disabled"
      @change="emit('change', { defensiveIntensity: $event })"
    />
  </div>
</template>
