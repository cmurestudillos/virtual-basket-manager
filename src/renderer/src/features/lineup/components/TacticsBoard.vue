<script setup lang="ts">
import { onMounted, ref } from 'vue';
import type { PlayerSummary } from '@shared/contracts/players.contract';
import type { TeamTacticsView } from '@shared/contracts/tactics.contract';
import {
  DEFENSIVE_SYSTEMS,
  DEFENSIVE_SYSTEM_LABELS,
  OFFENSIVE_SYSTEMS,
  OFFENSIVE_SYSTEM_LABELS,
  SLIDER_MAX,
  SLIDER_MIN,
  type DefensiveSystem,
  type OffensiveSystem
} from '@shared/domain/tactics';
import { AppButton, AppScale } from '@renderer/shared/ui';

const props = defineProps<{ teamId: string }>();

const board = ref<TeamTacticsView | null>(null);
const roster = ref<PlayerSummary[]>([]);
const dirty = ref(false);
const busy = ref(false);
const error = ref<string | null>(null);
const saved = ref(false);

/** Qué hace cada deslizador, para que no sea un número sin consecuencia. */
const sliders = [
  {
    key: 'pace' as const,
    label: 'Ritmo',
    // Los extremos con nombre: lo que se decide no es «siete», es «más rápido
    // de lo normal». El número solo no dice nada.
    stops: ['Pausado', 'Normal', 'Corriendo'],
    hint: 'Más posesiones por partido y más desgaste'
  },
  {
    key: 'defensiveIntensity' as const,
    label: 'Intensidad defensiva',
    stops: ['Blanda', 'Normal', 'Agresiva'],
    hint: 'Más robos, también más faltas'
  },
  {
    key: 'offensiveReboundEffort' as const,
    label: 'Rebote ofensivo',
    stops: ['Replegando', 'Normal', 'Al ataque'],
    hint: 'Segundas opciones a cambio de encajar contraataques'
  }
];

onMounted(async () => {
  board.value = await window.api.tactics.get(props.teamId);
  roster.value = await window.api.players.listByTeam(props.teamId);
});

function touch(): void {
  dirty.value = true;
  saved.value = false;
}

function setOffense(value: string): void {
  if (board.value) {
    board.value.offensiveSystem = value as OffensiveSystem;
    touch();
  }
}

function setDefense(value: string): void {
  if (board.value) {
    board.value.defensiveSystem = value as DefensiveSystem;
    touch();
  }
}

function setSlider(key: (typeof sliders)[number]['key'], value: number): void {
  if (board.value) {
    board.value[key] = value;
    touch();
  }
}

function setFocus(value: string): void {
  if (board.value) {
    board.value.focusPlayerId = value === '' ? null : value;
    touch();
  }
}

async function save(): Promise<void> {
  if (!board.value) {
    return;
  }

  busy.value = true;
  error.value = null;
  try {
    board.value = await window.api.tactics.save({
      teamId: props.teamId,
      offensiveSystem: board.value.offensiveSystem,
      defensiveSystem: board.value.defensiveSystem,
      pace: board.value.pace,
      defensiveIntensity: board.value.defensiveIntensity,
      offensiveReboundEffort: board.value.offensiveReboundEffort,
      focusPlayerId: board.value.focusPlayerId
    });
    dirty.value = false;
    saved.value = true;
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'No se pudo guardar la pizarra';
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <div v-if="board" class="flex max-w-3xl flex-col gap-6">
    <section class="grid gap-4 sm:grid-cols-2">
      <label class="flex flex-col gap-1">
        <span class="text-sm text-court-300">Sistema ofensivo</span>
        <select
          class="rounded border border-court-600 bg-court-900 px-3 py-2"
          :value="board.offensiveSystem"
          @change="setOffense(($event.target as HTMLSelectElement).value)"
        >
          <option v-for="system in OFFENSIVE_SYSTEMS" :key="system" :value="system">
            {{ OFFENSIVE_SYSTEM_LABELS[system] }}
          </option>
        </select>
      </label>

      <label class="flex flex-col gap-1">
        <span class="text-sm text-court-300">Sistema defensivo</span>
        <select
          class="rounded border border-court-600 bg-court-900 px-3 py-2"
          :value="board.defensiveSystem"
          @change="setDefense(($event.target as HTMLSelectElement).value)"
        >
          <option v-for="system in DEFENSIVE_SYSTEMS" :key="system" :value="system">
            {{ DEFENSIVE_SYSTEM_LABELS[system] }}
          </option>
        </select>
      </label>
    </section>

    <section class="flex flex-col gap-4">
      <AppScale
        v-for="slider in sliders"
        :key="slider.key"
        :model-value="board[slider.key]"
        :min="SLIDER_MIN"
        :max="SLIDER_MAX"
        :label="slider.label"
        :stops="slider.stops"
        :hint="slider.hint"
        @update:model-value="setSlider(slider.key, $event)"
      />
    </section>

    <label class="flex max-w-sm flex-col gap-1">
      <span class="text-sm text-court-300">Referencia ofensiva</span>
      <select
        class="rounded border border-court-600 bg-court-900 px-3 py-2"
        :value="board.focusPlayerId ?? ''"
        @change="setFocus(($event.target as HTMLSelectElement).value)"
      >
        <option value="">Sin referencia — reparto entre todos</option>
        <option v-for="player in roster" :key="player.id" :value="player.id">
          {{ player.firstName }} {{ player.lastName }} ({{ player.position }} ·
          {{ player.overall }})
        </option>
      </select>
      <span class="text-xs text-court-600">
        El designado asume más posesiones; con el aclarado, casi todas
      </span>
    </label>

    <footer class="flex items-center gap-4">
      <AppButton variant="primary" :disabled="busy || !dirty" @click="save"> Guardar </AppButton>
      <p v-if="error" class="text-sm text-bad-400">{{ error }}</p>
      <p v-else-if="saved" class="text-sm text-good-400">Pizarra guardada.</p>
    </footer>
  </div>
</template>
