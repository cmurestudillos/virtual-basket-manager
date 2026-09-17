<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import type { PlayerSummary } from '@shared/contracts/players.contract';
import type { TeamTacticsView } from '@shared/contracts/tactics.contract';
import { conditionLabel } from '@shared/domain/conditioning';
import { POSITION_ABBREVIATIONS } from '@shared/domain/positions';
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
import PageActions from '@renderer/features/app-shell/components/PageActions.vue';
import {
  AppAvatar,
  AppButton,
  AppEmpty,
  AppPanel,
  AppRing,
  AppScale,
  AppSectionTitle,
  AppSegmented,
  AppSelect,
  KeyValueList,
  MoodIcon,
  PlayerName,
  PositionChip,
  TONE_TEXT
} from '@renderer/shared/ui';

const props = defineProps<{ teamId: string }>();

const board = ref<TeamTacticsView | null>(null);
const roster = ref<PlayerSummary[]>([]);
const dirty = ref(false);
const busy = ref(false);
const error = ref<string | null>(null);
const saved = ref(false);

type SliderKey = 'pace' | 'defensiveIntensity' | 'offensiveReboundEffort';

/** Qué hace cada deslizador, para que no sea un número sin consecuencia. */
interface Slider {
  key: SliderKey;
  label: string;
  stops: string[];
  hint: string;
}

const OFFENSE_SLIDERS: Slider[] = [
  {
    key: 'pace',
    label: 'Ritmo',
    // Los extremos con nombre: lo que se decide no es «siete», es «más rápido
    // de lo normal». El número solo no dice nada.
    stops: ['Pausado', 'Normal', 'Corriendo'],
    hint: 'Más posesiones por partido y más desgaste'
  },
  {
    key: 'offensiveReboundEffort',
    label: 'Rebote ofensivo',
    stops: ['Replegando', 'Normal', 'Al ataque'],
    hint: 'Segundas opciones a cambio de encajar contraataques'
  }
];

const DEFENSE_SLIDERS: Slider[] = [
  {
    key: 'defensiveIntensity',
    label: 'Intensidad defensiva',
    stops: ['Blanda', 'Normal', 'Agresiva'],
    hint: 'Más robos, también más faltas'
  }
];

const offenseOptions = OFFENSIVE_SYSTEMS.map((id) => ({ id, label: OFFENSIVE_SYSTEM_LABELS[id] }));
const defenseOptions = DEFENSIVE_SYSTEMS.map((id) => ({ id, label: DEFENSIVE_SYSTEM_LABELS[id] }));

/**
 * La referencia ofensiva, como la «defensa especial» de IBM: primero se decide
 * si hay referencia y, sólo entonces, quién. Sin referencia, el panel del
 * jugador queda debajo de un velo y su selector, apagado.
 */
type FocusMode = 'shared' | 'focus';
const FOCUS_MODES = [
  { id: 'shared', label: 'Reparto' },
  { id: 'focus', label: 'Con referencia' }
];
const focusMode = computed<FocusMode>(() => (board.value?.focusPlayerId ? 'focus' : 'shared'));
const focusPlayer = computed(
  () => roster.value.find((player) => player.id === board.value?.focusPlayerId) ?? null
);

/** Un `<option>` sólo admite texto: el «Nombre APELLIDO» se escribe aquí. */
const focusOptions = computed(() => [
  { id: '', label: 'Sin referencia' },
  ...roster.value.map((player) => ({
    id: player.id,
    label: `${player.firstName} ${player.lastName.toUpperCase()} (${
      POSITION_ABBREVIATIONS[player.position]
    } · ${player.overall})`
  }))
]);

const focusFacts = computed(() =>
  focusPlayer.value
    ? [
        { id: 'position', label: 'Puesto' },
        { id: 'morale', label: 'Moral' },
        {
          id: 'condition',
          label: 'Forma',
          value: `${focusPlayer.value.condition} · ${conditionLabel(focusPlayer.value.condition)}`
        }
      ]
    : []
);

onMounted(async () => {
  board.value = await window.api.tactics.get(props.teamId);
  roster.value = await loadRoster();
});

/**
 * La plantilla entre la que se elige la referencia. Una selección no tiene
 * plantilla propia —sus convocados son de sus clubes—: se sacan de su rotación
 * y se lee la ficha de cada uno.
 */
async function loadRoster(): Promise<PlayerSummary[]> {
  const own = await window.api.players.listByTeam(props.teamId);
  if (own.length > 0) {
    return own;
  }
  const rotation = await window.api.rotation.get(props.teamId);
  const players = await Promise.all(
    rotation.slots.map((slot) => window.api.players.get(slot.playerId))
  );
  return players.filter((player): player is PlayerSummary => player !== null);
}

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

function setSlider(key: SliderKey, value: number): void {
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

/** Con referencia, de entrada la mejor media: es a quien se la daría cualquiera. */
function setFocusMode(mode: string): void {
  if (mode === focusMode.value) {
    return;
  }
  const best = [...roster.value].sort((a, b) => b.overall - a.overall)[0];
  setFocus(mode === 'focus' && best ? best.id : '');
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

/** Deshace lo que no se ha guardado: vuelve a leer la pizarra guardada. */
async function discard(): Promise<void> {
  busy.value = true;
  try {
    board.value = await window.api.tactics.get(props.teamId);
    dirty.value = false;
    saved.value = false;
    error.value = null;
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <div v-if="board" class="flex flex-col gap-3">
    <!--
      El orden de los selectores importa: el arnés elige el sistema ofensivo en
      el primero y el defensivo en el segundo.
    -->
    <div class="relative grid grid-cols-3 items-start gap-4">
      <AppPanel title="Tácticas ofensivas">
        <div class="flex flex-col gap-3">
          <AppSectionTitle size="xs">Sistema ofensivo</AppSectionTitle>
          <AppSelect
            :model-value="board.offensiveSystem"
            :options="offenseOptions"
            label="Sistema ofensivo"
            @update:model-value="setOffense"
          />
          <AppSectionTitle size="xs">Ritmo y rebote</AppSectionTitle>
          <AppScale
            v-for="slider in OFFENSE_SLIDERS"
            :key="slider.key"
            :model-value="board[slider.key]"
            :min="SLIDER_MIN"
            :max="SLIDER_MAX"
            :label="slider.label"
            :stops="slider.stops"
            :hint="slider.hint"
            @update:model-value="setSlider(slider.key, $event)"
          />
        </div>
      </AppPanel>

      <AppPanel title="Tácticas defensivas">
        <div class="flex flex-col gap-3">
          <AppSectionTitle size="xs">Sistema defensivo</AppSectionTitle>
          <AppSelect
            :model-value="board.defensiveSystem"
            :options="defenseOptions"
            label="Sistema defensivo"
            @update:model-value="setDefense"
          />
          <AppSectionTitle size="xs">Nivel de agresividad</AppSectionTitle>
          <AppScale
            v-for="slider in DEFENSE_SLIDERS"
            :key="slider.key"
            :model-value="board[slider.key]"
            :min="SLIDER_MIN"
            :max="SLIDER_MAX"
            :label="slider.label"
            :stops="slider.stops"
            :hint="slider.hint"
            @update:model-value="setSlider(slider.key, $event)"
          />
        </div>
      </AppPanel>

      <AppPanel title="Referencia ofensiva">
        <div class="flex flex-col gap-3">
          <AppSegmented
            class="self-center"
            :model-value="focusMode"
            :options="FOCUS_MODES"
            @update:model-value="setFocusMode"
          />
          <p class="text-center text-xs text-tv-muted">
            El designado asume más posesiones; con el aclarado, casi todas
          </p>

          <div class="relative flex flex-col gap-3">
            <AppSelect
              :model-value="board.focusPlayerId ?? ''"
              :options="focusOptions"
              label="Referencia ofensiva"
              :disabled="focusMode === 'shared'"
              @update:model-value="setFocus"
            />

            <template v-if="focusPlayer">
              <div class="flex items-center gap-3">
                <AppAvatar
                  kind="player"
                  :seed="focusPlayer.id"
                  :name="`${focusPlayer.firstName} ${focusPlayer.lastName}`"
                  :size="56"
                />
                <PlayerName
                  :first="focusPlayer.firstName"
                  :last="focusPlayer.lastName"
                  mode="stacked"
                />
                <AppRing :value="focusPlayer.overall" label="Media" :size="48" class="ml-auto" />
              </div>
              <KeyValueList :items="focusFacts">
                <template #value="{ item }">
                  <PositionChip v-if="item.id === 'position'" :position="focusPlayer.position" />
                  <MoodIcon v-else-if="item.id === 'morale'" :value="focusPlayer.morale" labelled />
                  <template v-else>{{ item.value }}</template>
                </template>
              </KeyValueList>
            </template>
            <AppEmpty v-else>Sin referencia, el tiro se reparte entre los cinco de pista.</AppEmpty>

            <!-- El velo de IBM: el panel sigue a la vista, pero no se toca. -->
            <div
              v-if="focusMode === 'shared'"
              class="absolute inset-0 bg-tv-paper/40"
              aria-hidden="true"
            ></div>
          </div>
        </div>
      </AppPanel>

      <!-- Una pizarra ajena se enseña, pero no se cambia. -->
      <div
        v-if="!board.isManaged"
        class="absolute inset-0 flex items-center justify-center bg-tv-paper/70"
      >
        <p class="bg-tv-slab px-4 py-2 text-sm font-bold text-white">
          Sólo se cambia la pizarra de tu equipo
        </p>
      </div>
    </div>

    <!-- El arnés lee el primer párrafo de este pie: el aviso de guardado. -->
    <footer class="text-sm">
      <p v-if="error" role="alert" class="bg-tv-paper px-3 py-2" :class="TONE_TEXT.bad">
        {{ error }}
      </p>
      <p v-else-if="saved" class="bg-tv-paper px-3 py-2" :class="TONE_TEXT.good">
        Pizarra guardada.
      </p>
    </footer>

    <PageActions>
      <AppButton :disabled="busy || !dirty" @click="discard">Descartar cambios</AppButton>
      <AppButton variant="primary" :disabled="busy || !dirty || !board.isManaged" @click="save">
        Guardar
      </AppButton>
    </PageActions>
  </div>
</template>
