<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import type { RotationSlotView, TeamRotation } from '@shared/contracts/rotation.contract';
import { POSITION_LABELS, outOfPositionPenalty } from '@shared/domain/positions';
import { LINEUP_SIZE, MAX_TARGET_MINUTES } from '@shared/domain/rotation';
import { injuryLabel } from '@shared/domain/injuries';
import { AppButton } from '@renderer/shared/ui';

const props = defineProps<{ teamId: string }>();

const rotation = ref<TeamRotation | null>(null);
/** Copia editable: hasta que no se guarda, lo de la base de datos no cambia. */
const slots = ref<RotationSlotView[]>([]);
const dirty = ref(false);
const busy = ref(false);
const error = ref<string | null>(null);
const saved = ref(false);

const starters = computed(() => slots.value.slice(0, LINEUP_SIZE));
const bench = computed(() => slots.value.slice(LINEUP_SIZE));
const totalMinutes = computed(() =>
  slots.value.reduce((total, slot) => total + (slot.targetMinutes || 0), 0)
);
const regulation = computed(() => rotation.value?.regulationTeamMinutes ?? 200);
const balanced = computed(() => totalMinutes.value === regulation.value);

onMounted(load);

async function load(): Promise<void> {
  apply(await window.api.rotation.get(props.teamId));
  dirty.value = false;
}

function apply(next: TeamRotation): void {
  rotation.value = next;
  slots.value = next.slots.map((slot) => ({ ...slot }));
  error.value = null;
}

/**
 * Encaje en el hueco, recalculado en la pantalla y no leído del servidor: en
 * cuanto el usuario mueve a alguien, el dato que vino con la rotación ya no
 * describe lo que tiene delante.
 */
function fitOf(slot: RotationSlotView): number {
  return Math.round(outOfPositionPenalty(slot.position, slot.slotPosition) * 100);
}

/**
 * Pone a un jugador en un hueco del quinteto. Si ya estaba en otro sitio de la
 * rotación, los dos se intercambian: es lo que espera cualquiera que arrastre
 * un nombre sobre otro, y evita que un jugador quede duplicado.
 *
 * Los minutos se quedan con el hueco y no con el jugador, porque lo que el
 * entrenador reparte es el papel: quien sale de titular juega los minutos de
 * titular.
 */
function assignStarter(depth: number, playerId: string): void {
  const from = slots.value.findIndex((slot) => slot.playerId === playerId);
  const target = slots.value[depth];
  const source = slots.value[from];
  if (!target || !source || from === depth) {
    return;
  }

  slots.value[depth] = { ...target, ...playerOf(source), isStarter: true };
  slots.value[from] = {
    ...source,
    ...playerOf(target),
    // Un hueco del banquillo figura en la posición natural de quien lo ocupa;
    // los del quinteto conservan el suyo, que es del puesto y no del jugador.
    slotPosition: from < LINEUP_SIZE ? source.slotPosition : target.position,
    isStarter: from < LINEUP_SIZE
  };
  touch();
}

/** Los datos que viajan con el jugador al cambiarlo de hueco. */
function playerOf(slot: RotationSlotView): Partial<RotationSlotView> {
  return {
    playerId: slot.playerId,
    playerName: slot.playerName,
    position: slot.position,
    secondaryPosition: slot.secondaryPosition,
    overall: slot.overall,
    condition: slot.condition,
    injuryDaysLeft: slot.injuryDaysLeft
  };
}

/** Un lesionado sigue en la lista, pero el motor no lo viste. */
function optionLabel(slot: RotationSlotView): string {
  const injury = slot.injuryDaysLeft > 0 ? ` · lesionado ${injuryLabel(slot.injuryDaysLeft)}` : '';
  return `${slot.playerName} (${slot.position} · ${slot.overall})${injury}`;
}

/** Mueve a un suplente arriba o abajo en el orden del banquillo. */
function move(depth: number, delta: number): void {
  const target = depth + delta;
  if (target < LINEUP_SIZE || target >= slots.value.length) {
    return;
  }

  const a = slots.value[depth] as RotationSlotView;
  const b = slots.value[target] as RotationSlotView;
  slots.value[depth] = { ...b, depth, slotPosition: b.position };
  slots.value[target] = { ...a, depth: target, slotPosition: a.position };
  touch();
}

function setMinutes(depth: number, value: number): void {
  const slot = slots.value[depth];
  if (!slot) {
    return;
  }
  const minutes = Math.max(0, Math.min(MAX_TARGET_MINUTES, Math.round(value || 0)));
  slots.value[depth] = { ...slot, targetMinutes: minutes };
  touch();
}

function touch(): void {
  dirty.value = true;
  saved.value = false;
}

async function save(): Promise<void> {
  busy.value = true;
  error.value = null;
  try {
    apply(
      await window.api.rotation.save({
        teamId: props.teamId,
        slots: slots.value.map((slot) => ({
          playerId: slot.playerId,
          depth: slot.depth,
          slotPosition: slot.slotPosition,
          targetMinutes: slot.targetMinutes
        }))
      })
    );
    dirty.value = false;
    saved.value = true;
  } catch (cause) {
    error.value = messageOf(cause);
  } finally {
    busy.value = false;
  }
}

async function auto(): Promise<void> {
  busy.value = true;
  error.value = null;
  try {
    apply(await window.api.rotation.auto(props.teamId));
    dirty.value = false;
    saved.value = true;
  } catch (cause) {
    error.value = messageOf(cause);
  } finally {
    busy.value = false;
  }
}

/** El error de IPC llega con el nombre del canal por delante; sobra en pantalla. */
function messageOf(cause: unknown): string {
  const raw = cause instanceof Error ? cause.message : String(cause);
  return raw.split(':').slice(-1)[0]?.trim() || 'No se pudo guardar la rotación';
}
</script>

<template>
  <div class="flex flex-col gap-5">
    <section class="flex flex-col gap-2">
      <div class="flex items-baseline justify-between">
        <h2 class="text-lg font-semibold">Cinco inicial</h2>
        <span class="text-xs text-court-300">
          Cambiar un nombre intercambia a los dos jugadores
        </span>
      </div>

      <div class="overflow-auto rounded border border-court-700">
        <table class="data-table">
          <thead>
            <tr>
              <th>Puesto</th>
              <th>Jugador</th>
              <th class="numeric">Media</th>
              <th class="numeric">Forma</th>
              <th class="numeric">Encaje</th>
              <th class="numeric">Minutos</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="slot in starters" :key="slot.slotPosition">
              <td>
                <span class="text-ball-400">{{ slot.slotPosition }}</span>
                <span class="ml-1 text-xs text-court-600">
                  {{ POSITION_LABELS[slot.slotPosition] }}
                </span>
              </td>
              <td>
                <select
                  class="w-64 rounded border border-court-600 bg-court-900 px-2 py-1"
                  :value="slot.playerId"
                  @change="assignStarter(slot.depth, ($event.target as HTMLSelectElement).value)"
                >
                  <option v-for="option in slots" :key="option.playerId" :value="option.playerId">
                    {{ optionLabel(option) }}
                  </option>
                </select>
              </td>
              <td class="numeric font-semibold">{{ slot.overall }}</td>
              <td
                class="numeric"
                :class="slot.injuryDaysLeft > 0 ? 'text-bad-400' : 'text-court-300'"
              >
                {{ slot.injuryDaysLeft > 0 ? injuryLabel(slot.injuryDaysLeft) : slot.condition }}
              </td>
              <td class="numeric" :class="fitOf(slot) < 100 ? 'text-line-500' : 'text-court-600'">
                {{ fitOf(slot) }}%
              </td>
              <td class="numeric">
                <input
                  type="number"
                  min="0"
                  :max="MAX_TARGET_MINUTES"
                  class="w-16 rounded border border-court-600 bg-court-900 px-2 py-1 text-right"
                  :value="slot.targetMinutes"
                  @input="setMinutes(slot.depth, Number(($event.target as HTMLInputElement).value))"
                />
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <section class="flex flex-col gap-2">
      <h2 class="text-lg font-semibold">Banquillo</h2>

      <div class="overflow-auto rounded border border-court-700">
        <table class="data-table">
          <thead>
            <tr>
              <th class="numeric">#</th>
              <th>Jugador</th>
              <th>Pos</th>
              <th class="numeric">Media</th>
              <th class="numeric">Forma</th>
              <th class="numeric">Minutos</th>
              <th>Orden</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="slot in bench" :key="slot.playerId">
              <td class="numeric text-court-300">{{ slot.depth + 1 }}</td>
              <td>{{ slot.playerName }}</td>
              <td class="text-court-300">{{ slot.position }}</td>
              <td class="numeric font-semibold">{{ slot.overall }}</td>
              <td
                class="numeric"
                :class="slot.injuryDaysLeft > 0 ? 'text-bad-400' : 'text-court-300'"
              >
                {{ slot.injuryDaysLeft > 0 ? injuryLabel(slot.injuryDaysLeft) : slot.condition }}
              </td>
              <td class="numeric">
                <input
                  type="number"
                  min="0"
                  :max="MAX_TARGET_MINUTES"
                  class="w-16 rounded border border-court-600 bg-court-900 px-2 py-1 text-right"
                  :value="slot.targetMinutes"
                  @input="setMinutes(slot.depth, Number(($event.target as HTMLInputElement).value))"
                />
              </td>
              <td>
                <AppButton size="sm" @click="move(slot.depth, -1)"> ↑ </AppButton>
                <AppButton size="sm" class="ml-1" @click="move(slot.depth, 1)"> ↓ </AppButton>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <footer class="flex items-center gap-4">
      <span class="text-sm" :class="balanced ? 'text-court-300' : 'text-line-500'">
        Minutos repartidos: {{ totalMinutes }} de {{ regulation }}
        <span v-if="!balanced" class="text-xs">
          — el motor reparte en proporción, pero cuadrarlo es lo que se juega
        </span>
      </span>

      <AppButton size="sm" class="ml-auto" :disabled="busy" @click="auto">
        Rotación automática
      </AppButton>
      <AppButton variant="primary" :disabled="busy || !dirty" @click="save"> Guardar </AppButton>
    </footer>

    <p v-if="error" class="text-sm text-bad-400">{{ error }}</p>
    <p v-else-if="saved" class="text-sm text-good-400">Alineación guardada.</p>
  </div>
</template>
