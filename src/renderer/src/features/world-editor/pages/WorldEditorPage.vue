<script setup lang="ts">
/**
 * El editor del mundo base.
 *
 * Edita los clubes y jugadores con los que nacen las **partidas nuevas**. Las
 * empezadas no cambian: se sembraron al crearse y ya son suyas. Por eso vive
 * fuera de la partida, en el menú principal, y por eso lo dice arriba — quien
 * cambia su club favorito a mitad de temporada tiene que saber que no lo verá
 * hasta la próxima partida.
 *
 * Todo se guarda como diferencia sobre el original, así que restaurar un club o
 * el mundo entero siempre es posible.
 */
import { computed, onMounted, ref, watch } from 'vue';
import type {
  EditorOverview,
  EditorPlayer,
  EditorResult,
  EditorTeam
} from '@shared/contracts/world-editor.contract';
import { ATTRIBUTE_GROUPS, ATTRIBUTE_LABELS, type AttributeKey } from '@shared/domain/attributes';
import { POSITIONS, POSITION_LABELS } from '@shared/domain/positions';
import { AppAvatar, AppButton, AppField, AppPageHeader, AppPanel } from '@renderer/shared/ui';

const overview = ref<EditorOverview | null>(null);
const league = ref<string>('liga-nacional');
const search = ref('');
const team = ref<EditorTeam | null>(null);
const playerId = ref<string | null>(null);
const message = ref<{ ok: boolean; text: string } | null>(null);
const busy = ref(false);
const confirmResetAll = ref(false);

/** Borrador del club: se guarda con un botón, no a cada tecla. */
const teamDraft = ref({
  name: '',
  shortName: '',
  city: '',
  pavilionName: '',
  pavilionCapacity: 0,
  reputation: 0,
  budgetEuros: 0
});

const playerDraft = ref({
  firstName: '',
  lastName: '',
  nationality: '',
  position: 'PG',
  heightCm: 0,
  potential: 0,
  attributes: {} as Record<string, number>
});
const moveTo = ref('');

const GROUP_LABELS: Record<keyof typeof ATTRIBUTE_GROUPS, string> = {
  tiro: 'Tiro',
  creacion: 'Creación',
  defensa: 'Defensa',
  rebote: 'Rebote',
  fisico: 'Físico',
  mental: 'Mental'
};

onMounted(async () => {
  overview.value = await window.api.editor.overview();
  const first = teamsInLeague.value[0];
  if (first) {
    await selectTeam(first.teamId);
  }
});

const leaguesByCountry = computed(() => {
  const groups = new Map<string, EditorOverview['leagues']>();
  for (const row of overview.value?.leagues ?? []) {
    const list = groups.get(row.country) ?? [];
    list.push(row);
    groups.set(row.country, list);
  }
  return [...groups.entries()];
});

const teamsInLeague = computed(() => {
  const term = search.value.trim().toLowerCase();
  return (overview.value?.teams ?? [])
    .filter((row) =>
      term
        ? row.name.toLowerCase().includes(term) || row.city.toLowerCase().includes(term)
        : row.competitionId === league.value
    )
    .sort((a, b) => b.reputation - a.reputation);
});

const player = computed<EditorPlayer | null>(
  () => team.value?.players.find((row) => row.playerId === playerId.value) ?? null
);

/** A dónde se puede mover: cualquier club del mundo, con los de su liga primero. */
const moveTargets = computed(() =>
  (overview.value?.teams ?? [])
    .filter((row) => row.teamId !== team.value?.teamId)
    .sort(
      (a, b) =>
        Number(b.competitionId === team.value?.competitionId) -
          Number(a.competitionId === team.value?.competitionId) || a.name.localeCompare(b.name)
    )
);

const editedLabel = computed(() => {
  const view = overview.value;
  if (!view || view.editedTeams + view.editedPlayers === 0) {
    return 'El mundo está como el original';
  }
  const clubs = view.editedTeams === 1 ? '1 club' : `${view.editedTeams} clubes`;
  const players = view.editedPlayers === 1 ? '1 jugador' : `${view.editedPlayers} jugadores`;
  return `Cambios en ${clubs} y ${players}`;
});

watch(team, (value) => {
  if (!value) return;
  teamDraft.value = {
    name: value.name,
    shortName: value.shortName,
    city: value.city,
    pavilionName: value.pavilionName,
    pavilionCapacity: value.pavilionCapacity,
    reputation: value.reputation,
    budgetEuros: Math.round(value.budgetCents / 100)
  };
});

watch(player, (value) => {
  if (!value) return;
  playerDraft.value = {
    firstName: value.firstName,
    lastName: value.lastName,
    nationality: value.nationality,
    position: value.position,
    heightCm: value.heightCm,
    potential: value.potential,
    attributes: { ...value.attributes }
  };
  moveTo.value = '';
});

async function selectTeam(teamId: string): Promise<void> {
  team.value = await window.api.editor.team(teamId);
  playerId.value = team.value?.players[0]?.playerId ?? null;
  message.value = null;
}

/** Aplica el resultado de una orden: el club que vuelve y el mensaje que toca. */
async function settle(result: EditorResult<EditorTeam>, okText: string): Promise<void> {
  message.value = { ok: result.ok, text: result.ok ? okText : (result.reason ?? 'No se pudo') };
  if (result.ok) {
    const keep = playerId.value;
    team.value = result.value;
    if (keep && team.value?.players.some((row) => row.playerId === keep)) {
      playerId.value = keep;
    } else {
      playerId.value = team.value?.players[0]?.playerId ?? null;
    }
    overview.value = await window.api.editor.overview();
  }
}

async function saveTeam(): Promise<void> {
  if (!team.value || busy.value) return;
  busy.value = true;
  try {
    const draft = teamDraft.value;
    await settle(
      await window.api.editor.updateTeam(team.value.teamId, {
        name: draft.name,
        shortName: draft.shortName,
        city: draft.city,
        pavilionName: draft.pavilionName,
        pavilionCapacity: Number(draft.pavilionCapacity),
        reputation: Number(draft.reputation),
        budgetCents: Math.round(Number(draft.budgetEuros) * 100)
      }),
      'Club guardado. Lo tendrán las partidas nuevas.'
    );
  } finally {
    busy.value = false;
  }
}

async function savePlayer(): Promise<void> {
  if (!player.value || busy.value) return;
  busy.value = true;
  try {
    const draft = playerDraft.value;
    const attributes = Object.fromEntries(
      Object.entries(draft.attributes).map(([key, value]) => [key, Number(value)])
    );
    await settle(
      await window.api.editor.updatePlayer(player.value.playerId, {
        firstName: draft.firstName,
        lastName: draft.lastName,
        nationality: draft.nationality,
        position: draft.position as (typeof POSITIONS)[number],
        heightCm: Number(draft.heightCm),
        potential: Number(draft.potential),
        attributes
      }),
      'Jugador guardado.'
    );
  } finally {
    busy.value = false;
  }
}

async function movePlayer(): Promise<void> {
  if (!player.value || !moveTo.value || busy.value) return;
  busy.value = true;
  const name = `${player.value.firstName} ${player.value.lastName}`;
  const target = moveTargets.value.find((row) => row.teamId === moveTo.value)?.name ?? '';
  try {
    await settle(
      await window.api.editor.movePlayer(player.value.playerId, moveTo.value),
      `${name} pasa a ${target}.`
    );
  } finally {
    busy.value = false;
  }
}

async function resetTeam(): Promise<void> {
  if (!team.value || busy.value) return;
  busy.value = true;
  try {
    await settle(
      await window.api.editor.resetTeam(team.value.teamId),
      'Club restaurado al original.'
    );
  } finally {
    busy.value = false;
  }
}

async function resetAll(): Promise<void> {
  if (!confirmResetAll.value) {
    confirmResetAll.value = true;
    return;
  }
  busy.value = true;
  try {
    overview.value = await window.api.editor.resetAll();
    if (team.value) {
      team.value = await window.api.editor.team(team.value.teamId);
    }
    message.value = { ok: true, text: 'Todo el mundo vuelve a estar como el original.' };
  } finally {
    busy.value = false;
    confirmResetAll.value = false;
  }
}

function attributeKeys(group: keyof typeof ATTRIBUTE_GROUPS): readonly AttributeKey[] {
  return ATTRIBUTE_GROUPS[group];
}
</script>

<template>
  <div class="mx-auto flex h-screen max-w-7xl flex-col gap-4 p-8">
    <header class="flex flex-wrap items-center justify-between gap-4">
      <AppPageHeader title="Editor del mundo">
        <span class="text-sm text-court-300">{{ editedLabel }}</span>
      </AppPageHeader>
      <div class="flex items-center gap-3">
        <AppButton
          size="sm"
          :variant="confirmResetAll ? 'primary' : 'ghost'"
          :disabled="busy"
          @click="resetAll"
        >
          {{ confirmResetAll ? 'Confirmar: restaurar todo' : 'Restaurar todo' }}
        </AppButton>
        <RouterLink :to="{ name: 'main-menu' }" class="text-sm text-court-300 hover:text-court-100">
          Volver
        </RouterLink>
      </div>
    </header>

    <p class="rounded border border-court-700 bg-court-900 px-4 py-2 text-sm text-court-300">
      Lo que cambies aquí lo recibirán las <span class="text-court-100">partidas nuevas</span>. Las
      que ya has empezado no cambian.
    </p>

    <div class="grid flex-1 grid-cols-[16rem_1fr] gap-4 overflow-hidden">
      <!-- Ligas y clubes -->
      <nav class="flex flex-col gap-2 overflow-hidden rounded border border-court-700 p-3">
        <input
          id="editor-search"
          v-model="search"
          type="search"
          placeholder="Buscar club o ciudad"
          class="rounded border border-court-600 bg-court-900 px-3 py-1.5 text-sm"
        />
        <select
          id="editor-league"
          v-model="league"
          class="rounded border border-court-600 bg-court-900 px-2 py-1.5 text-sm"
          :disabled="search.trim().length > 0"
        >
          <optgroup v-for="[country, rows] in leaguesByCountry" :key="country" :label="country">
            <option v-for="row in rows" :key="row.competitionId" :value="row.competitionId">
              {{ row.name }}
            </option>
          </optgroup>
        </select>
        <ul class="flex-1 overflow-auto text-sm">
          <li v-for="row in teamsInLeague" :key="row.teamId">
            <button
              type="button"
              class="flex w-full items-center justify-between gap-2 rounded px-2 py-1.5 text-left hover:bg-court-800"
              :class="row.teamId === team?.teamId ? 'bg-court-800 text-ball-400' : ''"
              @click="selectTeam(row.teamId)"
            >
              <span class="truncate">
                <span v-if="row.edited" class="mr-1 text-ball-500" title="Con cambios">●</span>
                {{ row.name }}
              </span>
              <span class="text-xs text-court-600">{{ row.reputation }}</span>
            </button>
          </li>
        </ul>
      </nav>

      <div v-if="team" class="flex flex-col gap-4 overflow-auto pr-1">
        <p
          v-if="message"
          class="rounded border px-3 py-2 text-sm"
          :class="message.ok ? 'border-good-500 text-good-400' : 'border-warn-500 text-warn-400'"
          role="status"
        >
          {{ message.text }}
        </p>

        <!-- El club -->
        <AppPanel :title="team.name" :hint="`${team.competitionName} · ${team.country}`">
          <template #actions>
            <AppButton
              v-if="team.edited"
              size="sm"
              variant="ghost"
              :disabled="busy"
              @click="resetTeam"
            >
              Restaurar club
            </AppButton>
          </template>
          <div class="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <AppField label="Nombre">
              <input id="team-name" v-model="teamDraft.name" class="editor-input" maxlength="60" />
            </AppField>
            <AppField label="Abreviatura" hint="2 a 4 letras">
              <input
                id="team-short"
                v-model="teamDraft.shortName"
                class="editor-input"
                maxlength="4"
              />
            </AppField>
            <AppField label="Ciudad">
              <input id="team-city" v-model="teamDraft.city" class="editor-input" maxlength="60" />
            </AppField>
            <AppField label="Pabellón">
              <input
                id="team-pavilion"
                v-model="teamDraft.pavilionName"
                class="editor-input"
                maxlength="60"
              />
            </AppField>
            <AppField label="Aforo" hint="1.000 a 30.000">
              <input
                id="team-capacity"
                v-model="teamDraft.pavilionCapacity"
                type="number"
                min="1000"
                max="30000"
                class="editor-input"
              />
            </AppField>
            <AppField label="Reputación" hint="1 a 100: fichajes, taquilla y exigencia">
              <input
                id="team-reputation"
                v-model="teamDraft.reputation"
                type="number"
                min="1"
                max="100"
                class="editor-input"
              />
            </AppField>
            <AppField label="Presupuesto (€)">
              <input
                id="team-budget"
                v-model="teamDraft.budgetEuros"
                type="number"
                min="0"
                class="editor-input"
              />
            </AppField>
          </div>
          <div class="mt-3 flex justify-end">
            <AppButton variant="primary" :disabled="busy" @click="saveTeam">Guardar club</AppButton>
          </div>
        </AppPanel>

        <div class="grid gap-4 xl:grid-cols-[1fr_1.2fr]">
          <!-- La plantilla -->
          <AppPanel title="Plantilla" :hint="`${team.players.length} jugadores`" flush>
            <table class="data-table">
              <thead>
                <tr>
                  <th>Jugador</th>
                  <th>Pos</th>
                  <th class="numeric">Edad</th>
                  <th class="numeric">Media</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="row in team.players"
                  :key="row.playerId"
                  class="cursor-pointer"
                  :class="row.playerId === playerId ? 'bg-court-800' : ''"
                  @click="playerId = row.playerId"
                >
                  <td>
                    <span class="inline-flex items-center gap-2">
                      <AppAvatar kind="player" :seed="row.playerId" />
                      <span v-if="row.edited" class="text-ball-500" title="Con cambios">●</span>
                      {{ row.firstName }} {{ row.lastName }}
                    </span>
                  </td>
                  <td class="text-ball-400">{{ row.position }}</td>
                  <td class="numeric">{{ row.age }}</td>
                  <td class="numeric font-semibold">{{ row.overall }}</td>
                </tr>
              </tbody>
            </table>
          </AppPanel>

          <!-- El jugador -->
          <AppPanel v-if="player" :title="`${player.firstName} ${player.lastName}`">
            <div class="grid grid-cols-2 gap-3 lg:grid-cols-3">
              <AppField label="Nombre">
                <input
                  id="player-first"
                  v-model="playerDraft.firstName"
                  class="editor-input"
                  maxlength="60"
                />
              </AppField>
              <AppField label="Apellido">
                <input
                  id="player-last"
                  v-model="playerDraft.lastName"
                  class="editor-input"
                  maxlength="60"
                />
              </AppField>
              <AppField label="Nacionalidad" hint="Código de tres letras">
                <input
                  id="player-nationality"
                  v-model="playerDraft.nationality"
                  class="editor-input uppercase"
                  maxlength="3"
                />
              </AppField>
              <AppField label="Posición">
                <select id="player-position" v-model="playerDraft.position" class="editor-input">
                  <option v-for="position in POSITIONS" :key="position" :value="position">
                    {{ POSITION_LABELS[position] }}
                  </option>
                </select>
              </AppField>
              <AppField label="Altura (cm)">
                <input
                  id="player-height"
                  v-model="playerDraft.heightCm"
                  type="number"
                  min="160"
                  max="240"
                  class="editor-input"
                />
              </AppField>
              <AppField label="Potencial" hint="1 a 99: su techo">
                <input
                  id="player-potential"
                  v-model="playerDraft.potential"
                  type="number"
                  min="1"
                  max="99"
                  class="editor-input"
                />
              </AppField>
            </div>

            <div class="mt-4 grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
              <fieldset
                v-for="(_, group) in ATTRIBUTE_GROUPS"
                :key="group"
                class="flex flex-col gap-1"
              >
                <legend class="mb-1 text-xs uppercase tracking-wide text-court-300">
                  {{ GROUP_LABELS[group] }}
                </legend>
                <label
                  v-for="key in attributeKeys(group)"
                  :key="key"
                  class="flex items-center justify-between gap-2 text-sm"
                >
                  <span class="text-court-300">{{ ATTRIBUTE_LABELS[key] }}</span>
                  <input
                    :id="`attr-${key}`"
                    v-model="playerDraft.attributes[key]"
                    type="number"
                    min="1"
                    max="99"
                    class="editor-input w-16 text-right"
                  />
                </label>
              </fieldset>
            </div>

            <div
              class="mt-4 flex flex-wrap items-end justify-between gap-3 border-t border-court-700 pt-3"
            >
              <div class="flex items-end gap-2">
                <AppField label="Pasar a otra plantilla">
                  <select id="player-move" v-model="moveTo" class="editor-input">
                    <option value="" disabled>Elegir club…</option>
                    <option v-for="row in moveTargets" :key="row.teamId" :value="row.teamId">
                      {{ row.name }} ({{ row.rosterSize }})
                    </option>
                  </select>
                </AppField>
                <AppButton variant="secondary" :disabled="busy || !moveTo" @click="movePlayer">
                  Mover
                </AppButton>
              </div>
              <AppButton variant="primary" :disabled="busy" @click="savePlayer">
                Guardar jugador
              </AppButton>
            </div>
          </AppPanel>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.editor-input {
  border-radius: 0.25rem;
  border: 1px solid var(--color-court-600);
  background-color: var(--color-court-900);
  padding: 0.35rem 0.6rem;
  font-size: 0.875rem;
  color: var(--color-court-100);
}
.editor-input:focus-visible {
  outline: 2px solid var(--color-ball-500);
  outline-offset: 1px;
}
</style>
