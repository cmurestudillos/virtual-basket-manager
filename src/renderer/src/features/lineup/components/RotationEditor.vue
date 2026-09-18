<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import type { RotationSlotView, TeamRotation } from '@shared/contracts/rotation.contract';
import { shirtNumbers } from '@shared/domain/court';
import { injuryLabel } from '@shared/domain/injuries';
import { splitPlayerName } from '@shared/domain/player-name';
import { outOfPositionPenalty, POSITION_ABBREVIATIONS, POSITIONS } from '@shared/domain/positions';
import { LINEUP_SIZE, MAX_TARGET_MINUTES } from '@shared/domain/rotation';
import PageActions from '@renderer/features/app-shell/components/PageActions.vue';
import MinutesBar from '@renderer/features/lineup/components/MinutesBar.vue';
import {
  AppButton,
  AppFlag,
  AppPanel,
  AppRing,
  AppSelect,
  AppStepper,
  MoodIcon,
  PlayerName,
  PositionChip,
  TONE_TEXT,
  bandForValue,
  toneForDelta
} from '@renderer/shared/ui';

const props = defineProps<{ teamId: string }>();

const rotation = ref<TeamRotation | null>(null);
/** Copia editable: hasta que no se guarda, lo de la base de datos no cambia. */
const slots = ref<RotationSlotView[]>([]);
const dirty = ref(false);
const busy = ref(false);
const error = ref<string | null>(null);
const saved = ref(false);
/** La moral no viaja con la rotación: se lee de la ficha de cada jugador. */
const morale = ref(new Map<string, number>());

const starters = computed(() => slots.value.slice(0, LINEUP_SIZE));
const bench = computed(() => slots.value.slice(LINEUP_SIZE));
const totalMinutes = computed(() =>
  slots.value.reduce((total, slot) => total + (slot.targetMinutes || 0), 0)
);
const regulation = computed(() => rotation.value?.regulationTeamMinutes ?? 200);
const balanced = computed(() => totalMinutes.value === regulation.value);

/** El dorsal sale del jugador, no del hueco: no cambia al moverlo. */
const numbers = computed(() => shirtNumbers(slots.value.map((slot) => slot.playerId)));

/**
 * Las medias de IBM: la del quinteto y la de quienes salen del banquillo. Del
 * banquillo cuentan los que tienen minutos; si nadie tiene, todos, para que el
 * anillo no se quede vacío con una rotación a medio hacer.
 */
const starterAverage = computed(() => average(starters.value));
const benchAverage = computed(() => {
  const playing = bench.value.filter((slot) => slot.targetMinutes > 0);
  return average(playing.length > 0 ? playing : bench.value);
});

/** Minutos repartidos por puesto: cada uno reparte una quinta parte del partido. */
const minutesByPosition = computed(() =>
  POSITIONS.map((position) => ({
    position,
    minutes: slots.value
      .filter((slot) => slot.slotPosition === position)
      .reduce((total, slot) => total + (slot.targetMinutes || 0), 0)
  }))
);

onMounted(load);

async function load(): Promise<void> {
  apply(await window.api.rotation.get(props.teamId));
  dirty.value = false;
  saved.value = false;
  void loadMorale();
}

/**
 * La plantilla del club trae la moral de todos de una vez. Una selección no
 * tiene plantilla propia —sus convocados son de sus clubes—, así que a quien
 * falte se le lee la ficha uno a uno.
 */
async function loadMorale(): Promise<void> {
  const roster = await window.api.players.listByTeam(props.teamId);
  // La moral de quien no es del usuario llega vacía: ese no lleva icono.
  const found = new Map<string, number>();
  for (const player of roster) {
    if (player.morale !== null) found.set(player.id, player.morale);
  }
  const missing = slots.value.filter((slot) => !found.has(slot.playerId));
  const extra = await Promise.all(missing.map((slot) => window.api.players.get(slot.playerId)));
  for (const player of extra) {
    if (player && player.morale !== null) found.set(player.id, player.morale);
  }
  morale.value = found;
}

function apply(next: TeamRotation): void {
  rotation.value = next;
  slots.value = next.slots.map((slot) => ({ ...slot }));
  error.value = null;
}

function average(list: readonly RotationSlotView[]): number | null {
  if (list.length === 0) return null;
  return list.reduce((total, slot) => total + slot.overall, 0) / list.length;
}

/**
 * Encaje en el hueco, recalculado en la pantalla y no leído del servidor: en
 * cuanto el usuario mueve a alguien, el dato que vino con la rotación ya no
 * describe lo que tiene delante. Se enseña como lo que se pierde: 0 en su
 * puesto, −12 de pívot un alero.
 */
function fitDelta(slot: RotationSlotView): number {
  return Math.round(outOfPositionPenalty(slot.position, slot.slotPosition) * 100) - 100;
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
    nationality: slot.nationality,
    position: slot.position,
    secondaryPosition: slot.secondaryPosition,
    overall: slot.overall,
    condition: slot.condition,
    injuryDaysLeft: slot.injuryDaysLeft
  };
}

/**
 * Las opciones del selector del quinteto. Un `<option>` sólo admite texto, así
 * que el «Nombre APELLIDO» se escribe aquí a mano. Un lesionado sigue en la
 * lista, pero el motor no lo viste.
 */
const starterOptions = computed(() =>
  slots.value.map((slot) => {
    const { first, last } = splitPlayerName(slot.playerName);
    const name = [first, last.toUpperCase()].filter(Boolean).join(' ');
    const injury =
      slot.injuryDaysLeft > 0 ? ` · lesionado ${injuryLabel(slot.injuryDaysLeft)}` : '';
    return {
      id: slot.playerId,
      label: `${name} (${POSITION_ABBREVIATIONS[slot.position]} · ${slot.overall})${injury}`,
      // Cerrado basta el nombre: el puesto y la media ya están en sus columnas.
      short: name
    };
  })
);

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

/** Deshace lo que no se ha guardado: vuelve a leer la rotación guardada. */
async function discard(): Promise<void> {
  busy.value = true;
  try {
    await load();
  } finally {
    busy.value = false;
  }
}

/** El error de IPC llega con el nombre del canal por delante; sobra en pantalla. */
function messageOf(cause: unknown): string {
  const raw = cause instanceof Error ? cause.message : String(cause);
  return raw.split(':').slice(-1)[0]?.trim() || 'No se pudo guardar la rotación';
}

function minutesLabel(slot: RotationSlotView): string {
  return `Minutos de ${slot.playerName}`;
}
</script>

<template>
  <div class="grid grid-cols-[minmax(0,1fr)_14rem] items-start gap-4">
    <AppPanel title="Quinteto y rotación" hint="Cambiar un nombre intercambia a los dos" flush>
      <table class="data-table">
        <thead>
          <tr>
            <th>Hueco</th>
            <th class="numeric">Nº</th>
            <th>Jugador</th>
            <th>Pos</th>
            <th>Mor</th>
            <th class="numeric">Forma</th>
            <th class="numeric">Med</th>
            <th>Minutos</th>
            <th class="numeric">Encaje</th>
            <th>Orden</th>
          </tr>
        </thead>

        <tbody>
          <tr v-for="slot in starters" :key="slot.slotPosition">
            <td><PositionChip :position="slot.slotPosition" /></td>
            <td class="numeric">{{ numbers.get(slot.playerId) }}</td>
            <td class="py-0.5">
              <AppSelect
                class="w-52"
                :model-value="slot.playerId"
                :options="starterOptions"
                :label="`Titular de ${POSITION_ABBREVIATIONS[slot.slotPosition]}`"
                @update:model-value="assignStarter(slot.depth, $event)"
              />
            </td>
            <td><PositionChip :position="slot.position" /></td>
            <td>
              <MoodIcon v-if="morale.has(slot.playerId)" :value="morale.get(slot.playerId)" />
            </td>
            <td
              class="numeric"
              :class="
                slot.injuryDaysLeft > 0 || bandForValue(slot.condition) === 'low'
                  ? TONE_TEXT.bad
                  : ''
              "
            >
              {{ slot.injuryDaysLeft > 0 ? injuryLabel(slot.injuryDaysLeft) : slot.condition }}
            </td>
            <td class="numeric is-key py-0.5"><AppRing :value="slot.overall" :size="28" /></td>
            <td class="py-0.5">
              <span class="flex items-center gap-2">
                <MinutesBar :minutes="slot.targetMinutes" :max="MAX_TARGET_MINUTES" />
                <AppStepper
                  :model-value="slot.targetMinutes"
                  :max="MAX_TARGET_MINUTES"
                  :label="minutesLabel(slot)"
                  @update:model-value="setMinutes(slot.depth, $event)"
                />
              </span>
            </td>
            <td class="numeric font-bold" :class="TONE_TEXT[toneForDelta(fitDelta(slot))]">
              <template v-if="fitDelta(slot) < 0">▼ {{ fitDelta(slot) }}</template>
              <template v-else>0</template>
            </td>
            <td></td>
          </tr>
        </tbody>

        <!-- El banquillo, en su propio cuerpo: el hueco de arriba lo separa del quinteto. -->
        <tbody class="rotation-bench">
          <tr v-for="slot in bench" :key="slot.playerId">
            <td>
              <span
                class="inline-flex h-5 min-w-6 items-center justify-center bg-tv-800 px-1 text-xs font-bold text-white"
              >
                {{ slot.depth + 1 }}
              </span>
            </td>
            <td class="numeric">{{ numbers.get(slot.playerId) }}</td>
            <td>
              <span class="flex items-center gap-2">
                <AppFlag :code="slot.nationality" />
                <PlayerName :name="slot.playerName" />
              </span>
            </td>
            <td><PositionChip :position="slot.position" /></td>
            <td>
              <MoodIcon v-if="morale.has(slot.playerId)" :value="morale.get(slot.playerId)" />
            </td>
            <td
              class="numeric"
              :class="
                slot.injuryDaysLeft > 0 || bandForValue(slot.condition) === 'low'
                  ? TONE_TEXT.bad
                  : ''
              "
            >
              {{ slot.injuryDaysLeft > 0 ? injuryLabel(slot.injuryDaysLeft) : slot.condition }}
            </td>
            <td class="numeric is-key py-0.5"><AppRing :value="slot.overall" :size="28" /></td>
            <td class="py-0.5">
              <span class="flex items-center gap-2">
                <MinutesBar :minutes="slot.targetMinutes" :max="MAX_TARGET_MINUTES" />
                <AppStepper
                  :model-value="slot.targetMinutes"
                  :max="MAX_TARGET_MINUTES"
                  :label="minutesLabel(slot)"
                  @update:model-value="setMinutes(slot.depth, $event)"
                />
              </span>
            </td>
            <td></td>
            <td class="py-0.5">
              <span class="flex gap-[3px]">
                <AppButton
                  size="sm"
                  :disabled="slot.depth <= LINEUP_SIZE"
                  :aria-label="`Subir a ${slot.playerName}`"
                  @click="move(slot.depth, -1)"
                >
                  ▲
                </AppButton>
                <AppButton
                  size="sm"
                  :disabled="slot.depth >= slots.length - 1"
                  :aria-label="`Bajar a ${slot.playerName}`"
                  @click="move(slot.depth, 1)"
                >
                  ▼
                </AppButton>
              </span>
            </td>
          </tr>
        </tbody>
      </table>
    </AppPanel>

    <div class="flex flex-col gap-4">
      <AppPanel title="Medias del equipo">
        <div class="flex justify-around">
          <AppRing
            :value="starterAverage"
            :unknown="starterAverage === null"
            label="Titulares"
            :size="56"
          />
          <AppRing
            :value="benchAverage"
            :unknown="benchAverage === null"
            label="Suplentes"
            :size="56"
          />
        </div>
      </AppPanel>

      <AppPanel title="Minutos por posición">
        <ul class="flex flex-col gap-[3px]">
          <li
            v-for="row in minutesByPosition"
            :key="row.position"
            class="flex items-center justify-between bg-tv-cell px-3 py-1"
          >
            <PositionChip :position="row.position" />
            <span class="figure text-sm font-bold">{{ row.minutes }}</span>
          </li>
        </ul>

        <!-- El arnés lee la primera línea de este pie: el reparto de minutos. -->
        <footer class="mt-3 flex flex-col gap-1 text-sm">
          <span class="font-bold" :class="balanced ? '' : TONE_TEXT.warn">
            Minutos repartidos: {{ totalMinutes }} de {{ regulation }}
          </span>
          <span v-if="!balanced" class="text-xs text-tv-muted">
            El motor reparte en proporción, pero cuadrarlo es lo que se juega
          </span>
          <p v-if="error" role="alert" :class="TONE_TEXT.bad">{{ error }}</p>
          <p v-else-if="saved" :class="TONE_TEXT.good">Alineación guardada.</p>
        </footer>
      </AppPanel>
    </div>

    <PageActions>
      <AppButton :disabled="busy || !dirty" @click="discard"> Descartar cambios </AppButton>
      <AppButton :disabled="busy" @click="auto">Rotación automática</AppButton>
      <AppButton variant="primary" :disabled="busy || !dirty" @click="save">Guardar</AppButton>
    </PageActions>
  </div>
</template>

<style scoped>
/* Entre el quinteto y el banquillo, un hueco de papel, como la raya de IBM. */
.rotation-bench tr:first-child td {
  border-top-width: 12px;
}
</style>
