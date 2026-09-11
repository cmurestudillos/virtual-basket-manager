<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import type { TeamTrainingPlan, TrainingPlayer } from '@shared/contracts/training.contract';
import { TIRED_CONDITION } from '@shared/domain/conditioning';
import {
  TRAINING_FOCUSES,
  TRAINING_FOCUS_HINTS,
  TRAINING_FOCUS_LABELS,
  type TrainingFocus
} from '@shared/domain/training';
import { useGameStateStore } from '@renderer/shared/game-state.store';
import StaffPanel from '@renderer/features/staff/components/StaffPanel.vue';

const store = useGameStateStore();

type Tab = 'plan' | 'staff';
const tab = ref<Tab>('plan');
const plan = ref<TeamTrainingPlan | null>(null);
const dirty = ref(false);
const busy = ref(false);
const saved = ref(false);
const error = ref<string | null>(null);

const injured = computed(() => plan.value?.players.filter((player) => !player.available) ?? []);
const focusHint = computed(() => (plan.value ? TRAINING_FOCUS_HINTS[plan.value.focus] : ''));

onMounted(async () => {
  if (!store.state) {
    await store.refresh();
  }
  if (store.state) {
    plan.value = await window.api.training.getPlan(store.state.teamId);
  }
});

function touch(): void {
  dirty.value = true;
  saved.value = false;
}

function setIntensity(value: number): void {
  if (plan.value) {
    plan.value.intensity = value;
    touch();
  }
}

function setTeamFocus(value: string): void {
  if (plan.value) {
    plan.value.focus = value as TrainingFocus;
    // El foco del bloque manda sobre quien no tenga el suyo: se refleja al
    // momento para que la tabla no mienta hasta que se guarde.
    for (const player of plan.value.players) {
      if (!player.focus) {
        player.effectiveFocus = plan.value.focus;
      }
    }
    touch();
  }
}

function setPlayerFocus(player: TrainingPlayer, value: string): void {
  player.focus = value === '' ? null : (value as TrainingFocus);
  player.effectiveFocus = player.focus ?? plan.value?.focus ?? 'balanced';
  touch();
}

async function save(): Promise<void> {
  if (!plan.value) {
    return;
  }

  busy.value = true;
  error.value = null;
  try {
    plan.value = await window.api.training.savePlan({
      teamId: plan.value.teamId,
      intensity: plan.value.intensity,
      focus: plan.value.focus,
      players: plan.value.players.map((player) => ({
        playerId: player.playerId,
        focus: player.focus
      }))
    });
    dirty.value = false;
    saved.value = true;
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'No se pudo guardar el plan';
  } finally {
    busy.value = false;
  }
}

function conditionColor(condition: number): string {
  if (condition >= 90) return 'bg-emerald-500';
  if (condition >= TIRED_CONDITION) return 'bg-ball-500';
  if (condition >= 50) return 'bg-line-500';
  return 'bg-red-500';
}
</script>

<template>
  <div v-if="plan" class="flex flex-col gap-5">
    <div class="flex items-baseline gap-4">
      <h1 class="text-2xl font-semibold">Entrenamiento</h1>
      <span class="text-sm text-court-300"> Se entrena cada lunes del calendario del juego </span>
    </div>

    <nav class="flex gap-1 border-b border-court-700">
      <button
        v-for="option in [
          { id: 'plan' as Tab, label: 'Plan' },
          { id: 'staff' as Tab, label: 'Cuerpo técnico' }
        ]"
        :key="option.id"
        type="button"
        class="border-b-2 px-4 py-2 text-sm"
        :class="
          tab === option.id
            ? 'border-ball-500 text-ball-400'
            : 'border-transparent text-court-300 hover:text-court-100'
        "
        @click="tab = option.id"
      >
        {{ option.label }}
      </button>
    </nav>

    <StaffPanel v-if="tab === 'staff'" :team-id="plan.teamId" />

    <template v-else>
      <!-- Parte médico -->
      <section
        v-if="injured.length > 0"
        class="rounded border border-red-900 bg-court-900 px-4 py-3 text-sm"
      >
        <h2 class="text-xs uppercase tracking-wide text-court-300">Parte médico</h2>
        <ul class="mt-2 flex flex-wrap gap-x-6 gap-y-1">
          <li v-for="player in injured" :key="player.playerId">
            <span class="text-court-100">{{ player.playerName }}</span>
            <span class="ml-2 text-red-400">{{ player.injuryName }}</span>
            <span class="ml-2 text-court-300">· {{ player.injuryLabel }}</span>
          </li>
        </ul>
      </section>

      <!-- Plan del bloque -->
      <section class="grid gap-5 rounded border border-court-700 p-5 sm:grid-cols-2">
        <div class="flex flex-col gap-1">
          <div class="flex items-baseline justify-between">
            <span class="text-sm">Intensidad</span>
            <span class="text-sm font-semibold text-ball-400">{{ plan.intensity }}</span>
          </div>
          <input
            type="range"
            min="1"
            max="10"
            step="1"
            class="accent-ball-500"
            :value="plan.intensity"
            @input="setIntensity(Number(($event.target as HTMLInputElement).value))"
          />
          <span class="text-xs text-court-600">
            Más intensidad mejora antes, cansa más y manda a más gente a la enfermería
          </span>
        </div>

        <label class="flex flex-col gap-1">
          <span class="text-sm">Foco del bloque</span>
          <select
            class="rounded border border-court-600 bg-court-900 px-3 py-2"
            :value="plan.focus"
            @change="setTeamFocus(($event.target as HTMLSelectElement).value)"
          >
            <option v-for="focus in TRAINING_FOCUSES" :key="focus" :value="focus">
              {{ TRAINING_FOCUS_LABELS[focus] }}
            </option>
          </select>
          <span class="text-xs text-court-600">{{ focusHint }}</span>
        </label>
      </section>

      <!-- Plantilla -->
      <div class="overflow-auto rounded border border-court-700">
        <table class="data-table">
          <thead>
            <tr>
              <th>Jugador</th>
              <th>Pos</th>
              <th class="numeric">Edad</th>
              <th class="numeric">Media</th>
              <th class="numeric">Pot.</th>
              <th>Forma</th>
              <th>Estado</th>
              <th>Foco</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="player in plan.players" :key="player.playerId">
              <td>
                <RouterLink
                  :to="{ name: 'player', params: { playerId: player.playerId } }"
                  class="hover:text-ball-400"
                >
                  {{ player.playerName }}
                </RouterLink>
              </td>
              <td class="text-court-300">{{ player.position }}</td>
              <td class="numeric">{{ player.age }}</td>
              <td class="numeric font-semibold">{{ player.overall }}</td>
              <td class="numeric text-court-300">{{ player.potential }}</td>
              <td>
                <span class="flex items-center gap-2">
                  <span class="h-2 w-20 overflow-hidden rounded bg-court-800">
                    <span
                      class="block h-full"
                      :class="conditionColor(player.condition)"
                      :style="{ width: `${player.condition}%` }"
                    />
                  </span>
                  <span class="w-16 text-xs text-court-300">{{ player.conditionLabel }}</span>
                </span>
              </td>
              <td :class="player.available ? 'text-court-600' : 'text-red-400'">
                {{
                  player.available ? 'Disponible' : `${player.injuryName} · ${player.injuryLabel}`
                }}
              </td>
              <td>
                <select
                  class="w-44 rounded border border-court-600 bg-court-900 px-2 py-1"
                  :value="player.focus ?? ''"
                  @change="setPlayerFocus(player, ($event.target as HTMLSelectElement).value)"
                >
                  <option value="">Del bloque ({{ TRAINING_FOCUS_LABELS[plan.focus] }})</option>
                  <option v-for="focus in TRAINING_FOCUSES" :key="focus" :value="focus">
                    {{ TRAINING_FOCUS_LABELS[focus] }}
                  </option>
                </select>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <footer class="flex items-center gap-4">
        <span class="text-sm text-court-300">
          {{ plan.players.length - injured.length }} disponibles de {{ plan.players.length }}
        </span>
        <button
          type="button"
          class="ml-auto rounded bg-ball-600 px-4 py-1 text-sm font-semibold disabled:opacity-40"
          :disabled="busy || !dirty"
          @click="save"
        >
          Guardar
        </button>
        <p v-if="error" class="text-sm text-red-400">{{ error }}</p>
        <p v-else-if="saved" class="text-sm text-emerald-400">Plan guardado.</p>
      </footer>
    </template>
  </div>
</template>
