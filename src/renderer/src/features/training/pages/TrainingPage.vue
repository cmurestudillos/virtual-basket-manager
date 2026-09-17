<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import type { TeamTrainingPlan, TrainingPlayer } from '@shared/contracts/training.contract';
import { toStars } from '@shared/domain/stars';
import {
  TRAINING_FOCUSES,
  TRAINING_FOCUS_HINTS,
  TRAINING_FOCUS_LABELS,
  type TrainingFocus
} from '@shared/domain/training';
import { useGameStateStore } from '@renderer/shared/game-state.store';
import PageActions from '@renderer/features/app-shell/components/PageActions.vue';
import PageToolbar from '@renderer/features/app-shell/components/PageToolbar.vue';
import StaffPanel from '@renderer/features/staff/components/StaffPanel.vue';
import {
  AppButton,
  AppEmpty,
  AppField,
  AppFlag,
  AppMeter,
  AppPanel,
  AppRing,
  AppScale,
  AppSegmented,
  AppSelect,
  AppStars,
  AppTabs,
  PlayerName,
  PositionChip,
  TONE_CHIP,
  TONE_TEXT
} from '@renderer/shared/ui';

/**
 * El entrenamiento de la semana y, en su pestaña, el cuerpo técnico. Se entrena
 * cada lunes del calendario del juego.
 */

const store = useGameStateStore();

type Tab = 'plan' | 'staff';
const tab = ref<Tab>('plan');
const TABS = [
  { id: 'plan', label: 'Plan' },
  { id: 'staff', label: 'Cuerpo técnico' }
];

const plan = ref<TeamTrainingPlan | null>(null);
const dirty = ref(false);
const busy = ref(false);
const saved = ref(false);
const error = ref<string | null>(null);

const injured = computed(() => plan.value?.players.filter((player) => !player.available) ?? []);
const focusHint = computed(() => (plan.value ? TRAINING_FOCUS_HINTS[plan.value.focus] : ''));
const focusOptions = TRAINING_FOCUSES.map((id) => ({ id, label: TRAINING_FOCUS_LABELS[id] }));

/** El tipo de IBM: o sigue el foco del bloque, o lleva uno propio. */
type Kind = 'team' | 'individual';
const KINDS = [
  { id: 'team', label: 'Bloque' },
  { id: 'individual', label: 'Individual' }
];

onMounted(async () => {
  if (!store.state) {
    await store.refresh();
  }
  await load();
});

async function load(): Promise<void> {
  if (store.state) {
    plan.value = await window.api.training.getPlan(store.state.teamId);
  }
}

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

/** Pasar a individual arranca con el foco que ya llevaba: nada cambia hasta elegir otro. */
function setPlayerKind(player: TrainingPlayer, kind: string): void {
  if ((kind as Kind) === 'individual') {
    setPlayerFocus(player, player.effectiveFocus);
  } else {
    setPlayerFocus(player, '');
  }
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

/** Deshace lo que no se ha guardado: vuelve a leer el plan guardado. */
async function discard(): Promise<void> {
  busy.value = true;
  try {
    await load();
    dirty.value = false;
    saved.value = false;
    error.value = null;
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <div v-if="plan" class="flex flex-col gap-4">
    <PageToolbar place="tabs">
      <span aria-hidden="true" class="my-3 w-px shrink-0 bg-white/30"></span>
      <AppTabs :model-value="tab" :options="TABS" @update:model-value="tab = $event as Tab" />
    </PageToolbar>

    <StaffPanel v-if="tab === 'staff'" :team-id="plan.teamId" />

    <template v-else>
      <div
        class="grid items-start gap-4"
        :class="injured.length > 0 ? 'grid-cols-[minmax(0,3fr)_minmax(0,2fr)]' : ''"
      >
        <!-- El arnés mueve el primer selector (el foco) y el primer deslizador (la intensidad). -->
        <AppPanel title="Entrenamiento del equipo">
          <div class="grid grid-cols-2 gap-6">
            <AppScale
              :model-value="plan.intensity"
              :min="1"
              :max="10"
              label="Intensidad"
              :stops="['Suave', 'Normal', 'Dura']"
              hint="Más intensidad mejora antes, cansa más y manda a más gente a la enfermería"
              @update:model-value="setIntensity"
            />
            <AppField label="Foco del bloque" :hint="focusHint">
              <AppSelect
                :model-value="plan.focus"
                :options="focusOptions"
                @update:model-value="setTeamFocus"
              />
            </AppField>
          </div>
        </AppPanel>

        <AppPanel
          v-if="injured.length > 0"
          title="Parte médico"
          :hint="`${injured.length} de baja`"
        >
          <ul class="flex flex-col gap-[3px] text-sm">
            <li
              v-for="player in injured"
              :key="player.playerId"
              class="flex items-center gap-2 bg-tv-cell px-3 py-1.5"
            >
              <AppFlag :code="player.nationality" />
              <PlayerName :name="player.playerName" />
              <span class="ml-auto font-semibold" :class="TONE_TEXT.bad">
                {{ player.injuryName }}
              </span>
              <span class="figure text-tv-muted">{{ player.injuryLabel }}</span>
            </li>
          </ul>
        </AppPanel>
      </div>

      <AppPanel title="Plantilla" :hint="`${plan.players.length} jugadores`" flush>
        <table class="data-table">
          <thead>
            <tr>
              <th>Jugador</th>
              <th class="numeric">Edad</th>
              <th>Pos</th>
              <th>Potencial</th>
              <th class="numeric">Med</th>
              <th>Forma</th>
              <th>Estado</th>
              <th>Tipo</th>
              <th>Foco</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="player in plan.players" :key="player.playerId">
              <td>
                <RouterLink
                  :to="{ name: 'player', params: { playerId: player.playerId } }"
                  class="flex items-center gap-2 hover:text-tv-blue-ink"
                >
                  <AppFlag :code="player.nationality" />
                  <PlayerName :name="player.playerName" />
                </RouterLink>
              </td>
              <td class="numeric">{{ player.age }}</td>
              <td><PositionChip :position="player.position" /></td>
              <td>
                <AppStars :value="toStars(player.potential)" label="Potencial" />
              </td>
              <td class="numeric is-key py-0.5"><AppRing :value="player.overall" :size="28" /></td>
              <td :title="player.conditionLabel">
                <AppMeter :value="player.condition" class="w-24" />
              </td>
              <td>
                <span v-if="player.available" class="text-tv-muted">Disponible</span>
                <span v-else :class="TONE_TEXT.bad" :title="player.injuryName ?? undefined">
                  Baja · {{ player.injuryLabel }}
                </span>
              </td>
              <td class="py-0.5">
                <AppSegmented
                  :model-value="player.focus ? 'individual' : 'team'"
                  :options="KINDS"
                  @update:model-value="setPlayerKind(player, $event)"
                />
              </td>
              <td class="py-0.5">
                <AppSelect
                  v-if="player.focus"
                  class="w-44"
                  :model-value="player.focus"
                  :options="focusOptions"
                  :label="`Foco de ${player.playerName}`"
                  @update:model-value="setPlayerFocus(player, $event)"
                />
                <span v-else class="text-tv-muted">{{ TRAINING_FOCUS_LABELS[plan.focus] }}</span>
              </td>
            </tr>
          </tbody>
        </table>
        <AppEmpty v-if="plan.players.length === 0">
          No hay nadie en la primera plantilla a quien entrenar.
        </AppEmpty>

        <!-- El pie añil de IBM. El arnés lee su primera línea: los disponibles. -->
        <footer
          class="flex items-center gap-4 bg-linear-to-r from-tv-head-from to-tv-head-to px-4 py-2 text-sm font-bold text-white"
        >
          <span class="figure">
            {{ plan.players.length - injured.length }} disponibles de {{ plan.players.length }}
          </span>
          <p v-if="error" role="alert" class="ml-auto px-2" :class="TONE_CHIP.bad">{{ error }}</p>
          <p v-else-if="saved" class="ml-auto px-2" :class="TONE_CHIP.good">Plan guardado.</p>
        </footer>
      </AppPanel>

      <PageActions>
        <AppButton :disabled="busy || !dirty" @click="discard">Descartar cambios</AppButton>
        <AppButton variant="primary" :disabled="busy || !dirty" @click="save">Guardar</AppButton>
      </PageActions>
    </template>
  </div>
</template>
