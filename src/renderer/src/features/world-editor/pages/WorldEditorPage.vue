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
 *
 * Con la piel de IBM, aunque IBM no tiene nada parecido: barra morada arriba,
 * paneles claros sobre el fondo liso, campos negros como los de su asistente y
 * la barra negra de abajo con lo que acaba de pasar y las acciones generales.
 */
import { computed, onMounted, ref, watch } from 'vue';
import type {
  EditorOverview,
  EditorPlayer,
  EditorResult,
  EditorTeam
} from '@shared/contracts/world-editor.contract';
import { ATTRIBUTE_GROUPS, ATTRIBUTE_LABELS, type AttributeKey } from '@shared/domain/attributes';
import { POSITION_LABELS, POSITIONS, type Position } from '@shared/domain/positions';
import { countryName } from '@shared/domain/simulation-scope';
import { toStars } from '@shared/domain/stars';
import {
  AppAvatar,
  AppButton,
  AppField,
  AppFlag,
  AppInput,
  AppPanel,
  AppRing,
  AppSectionTitle,
  AppSelect,
  AppStars,
  PlayerName,
  PositionChip
} from '@renderer/shared/ui';

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

/** El selector negro no tiene grupos: el país va detrás del nombre de la liga. */
const leagueOptions = computed(() =>
  leaguesByCountry.value.flatMap(([country, rows]) =>
    rows.map((row) => ({ id: row.competitionId, label: `${row.name} · ${countryName(country)}` }))
  )
);

const positionOptions = POSITIONS.map((position) => ({
  id: position,
  label: POSITION_LABELS[position]
}));

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

/** «Elegir club…» es la opción vacía: sin club elegido, «Mover» no hace nada. */
const moveOptions = computed(() => [
  { id: '', label: 'Elegir club…' },
  ...moveTargets.value.map((row) => ({ id: row.teamId, label: `${row.name} (${row.rosterSize})` }))
]);

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
  <div class="flex h-screen flex-col bg-tv-canvas">
    <header
      class="flex h-16 shrink-0 items-center justify-between gap-6 bg-linear-to-r from-tv-chrome to-tv-chrome-2 px-6"
    >
      <div class="min-w-0">
        <h1 class="text-lg font-bold uppercase tracking-wide">Editor del mundo</h1>
        <p class="truncate text-sm text-white/80">
          Lo que cambies aquí lo recibirán las <strong>partidas nuevas</strong>. Las que ya has
          empezado no cambian.
        </p>
      </div>
      <p class="shrink-0 text-sm font-bold">{{ editedLabel }}</p>
    </header>

    <main class="grid min-h-0 flex-1 grid-cols-[15rem_minmax(0,1fr)] gap-3 p-4">
      <!-- Ligas y clubes -->
      <nav aria-label="Clubes" class="flex min-h-0 flex-col">
        <AppPanel
          title="Clubes"
          :hint="String(teamsInLeague.length)"
          scroll
          flush
          class="min-h-0 flex-1"
        >
          <div class="sticky top-0 z-10 flex flex-col gap-2 bg-tv-paper p-2">
            <AppInput
              id="editor-search"
              v-model="search"
              type="search"
              placeholder="Buscar club o ciudad"
              aria-label="Buscar club o ciudad"
            />
            <AppSelect
              id="editor-league"
              v-model="league"
              :options="leagueOptions"
              label="Liga"
              :disabled="search.trim().length > 0"
            />
          </div>
          <ul class="flex flex-col gap-[3px] px-2 pb-2 text-sm">
            <li v-for="row in teamsInLeague" :key="row.teamId">
              <button
                type="button"
                class="flex w-full items-center justify-between gap-2 px-2 py-1.5 text-left text-tv-ink transition-colors"
                :class="
                  row.teamId === team?.teamId
                    ? 'bg-tv-select font-bold'
                    : 'bg-tv-cell hover:bg-tv-cell-strong'
                "
                @click="selectTeam(row.teamId)"
              >
                <span class="truncate">
                  <span v-if="row.edited" class="mr-1 text-tv-blue-ink" title="Con cambios">●</span>
                  {{ row.name }}
                </span>
                <span class="figure text-xs font-normal text-tv-muted">{{ row.reputation }}</span>
              </button>
            </li>
          </ul>
        </AppPanel>
      </nav>

      <div v-if="team" class="flex min-h-0 flex-col gap-3 overflow-auto">
        <!-- El club -->
        <AppPanel
          :title="team.name"
          :hint="`${team.competitionName} · ${countryName(team.country)}`"
        >
          <template #actions>
            <AppButton v-if="team.edited" size="sm" :disabled="busy" @click="resetTeam">
              Restaurar club
            </AppButton>
          </template>
          <div class="grid grid-cols-4 gap-3">
            <AppField label="Nombre">
              <AppInput id="team-name" v-model="teamDraft.name" maxlength="60" />
            </AppField>
            <AppField label="Abreviatura" hint="2 a 4 letras">
              <AppInput id="team-short" v-model="teamDraft.shortName" maxlength="4" />
            </AppField>
            <AppField label="Ciudad">
              <AppInput id="team-city" v-model="teamDraft.city" maxlength="60" />
            </AppField>
            <AppField label="Pabellón">
              <AppInput id="team-pavilion" v-model="teamDraft.pavilionName" maxlength="60" />
            </AppField>
            <AppField label="Aforo" hint="1.000 a 30.000">
              <AppInput
                id="team-capacity"
                v-model="teamDraft.pavilionCapacity"
                type="number"
                min="1000"
                max="30000"
              />
            </AppField>
            <AppField label="Reputación" hint="1 a 100: fichajes, taquilla y exigencia">
              <AppInput
                id="team-reputation"
                v-model="teamDraft.reputation"
                type="number"
                min="1"
                max="100"
              />
            </AppField>
            <AppField label="Presupuesto (€)">
              <AppInput id="team-budget" v-model="teamDraft.budgetEuros" type="number" min="0" />
            </AppField>
            <div class="flex items-end justify-end">
              <AppButton variant="primary" :disabled="busy" @click="saveTeam"
                >Guardar club</AppButton
              >
            </div>
          </div>
        </AppPanel>

        <div class="grid grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] items-start gap-3">
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
                  :class="row.playerId === playerId ? 'is-selected' : ''"
                  @click="playerId = row.playerId"
                >
                  <td class="max-w-0">
                    <span class="flex min-w-0 items-center gap-2">
                      <AppAvatar kind="player" :seed="row.playerId" :size="24" />
                      <span v-if="row.edited" class="text-tv-blue-ink" title="Con cambios">●</span>
                      <AppFlag :code="row.nationality" />
                      <PlayerName :first="row.firstName" :last="row.lastName" />
                    </span>
                  </td>
                  <td><PositionChip :position="row.position as Position" /></td>
                  <td class="numeric">{{ row.age }}</td>
                  <td class="numeric is-key py-0.5">
                    <AppRing :value="row.overall" :size="28" />
                  </td>
                </tr>
              </tbody>
            </table>
          </AppPanel>

          <!-- El jugador -->
          <AppPanel v-if="player" :title="`${player.firstName} ${player.lastName}`">
            <div class="grid grid-cols-3 gap-3">
              <AppField label="Nombre">
                <AppInput id="player-first" v-model="playerDraft.firstName" maxlength="60" />
              </AppField>
              <AppField label="Apellido">
                <AppInput id="player-last" v-model="playerDraft.lastName" maxlength="60" />
              </AppField>
              <AppField label="Nacionalidad" hint="Código de tres letras">
                <span class="flex items-center gap-2">
                  <AppInput
                    id="player-nationality"
                    v-model="playerDraft.nationality"
                    class="w-full uppercase"
                    maxlength="3"
                  />
                  <AppFlag :code="playerDraft.nationality.toUpperCase()" size="md" />
                </span>
              </AppField>
              <AppField label="Posición">
                <AppSelect
                  id="player-position"
                  v-model="playerDraft.position"
                  :options="positionOptions"
                  class="min-w-0"
                >
                  <template #leading>
                    <PositionChip :position="playerDraft.position as Position" />
                  </template>
                </AppSelect>
              </AppField>
              <AppField label="Altura (cm)">
                <AppInput
                  id="player-height"
                  v-model="playerDraft.heightCm"
                  type="number"
                  min="160"
                  max="240"
                />
              </AppField>
              <AppField label="Potencial" hint="1 a 99: su techo">
                <span class="flex items-center gap-2">
                  <AppInput
                    id="player-potential"
                    v-model="playerDraft.potential"
                    type="number"
                    min="1"
                    max="99"
                    class="w-16"
                  />
                  <AppStars :value="toStars(Number(playerDraft.potential))" label="Potencial" />
                </span>
              </AppField>
            </div>

            <div class="mt-3 grid grid-cols-2 gap-x-3 gap-y-3">
              <div
                v-for="(_, group) in ATTRIBUTE_GROUPS"
                :key="group"
                role="group"
                :aria-labelledby="`attr-group-${group}`"
                class="flex flex-col gap-[3px]"
              >
                <AppSectionTitle :id="`attr-group-${group}`" size="xs">
                  {{ GROUP_LABELS[group] }}
                </AppSectionTitle>
                <label
                  v-for="key in attributeKeys(group)"
                  :key="key"
                  class="flex items-center justify-between gap-2 bg-tv-cell py-0.5 pl-2 pr-0.5 text-sm"
                >
                  <span>{{ ATTRIBUTE_LABELS[key] }}</span>
                  <AppInput
                    :id="`attr-${key}`"
                    v-model="playerDraft.attributes[key]"
                    type="number"
                    min="1"
                    max="99"
                    dense
                    class="figure w-16 text-right"
                  />
                </label>
              </div>
            </div>

            <div
              class="mt-3 flex flex-wrap items-end justify-between gap-3 border-t border-tv-box pt-3"
            >
              <div class="flex items-end gap-2">
                <AppField label="Pasar a otra plantilla">
                  <AppSelect id="player-move" v-model="moveTo" :options="moveOptions" />
                </AppField>
                <AppButton :disabled="busy || !moveTo" @click="movePlayer">Mover</AppButton>
              </div>
              <AppButton variant="primary" :disabled="busy" @click="savePlayer">
                Guardar jugador
              </AppButton>
            </div>
          </AppPanel>
        </div>
      </div>
    </main>

    <footer
      class="flex h-[55px] shrink-0 items-center justify-between gap-4 border-t border-white/10 bg-tv-footer px-4"
    >
      <p v-if="message" class="flex min-w-0 items-center gap-2 text-sm text-white" role="status">
        <span
          aria-hidden="true"
          class="h-2.5 w-2.5 shrink-0"
          :class="message.ok ? 'bg-tv-green' : 'bg-tv-amber'"
        ></span>
        <span class="truncate">{{ message.text }}</span>
      </p>
      <span v-else></span>
      <div class="flex shrink-0 items-center gap-3">
        <AppButton
          :variant="confirmResetAll ? 'danger' : 'secondary'"
          :disabled="busy"
          @click="resetAll"
        >
          {{ confirmResetAll ? 'Confirmar: restaurar todo' : 'Restaurar todo' }}
        </AppButton>
        <RouterLink
          :to="{ name: 'main-menu' }"
          class="inline-flex min-w-32 items-center justify-center bg-tv-blue-dim px-4 py-2 text-sm font-bold uppercase tracking-wide text-white transition hover:bg-tv-700"
        >
          Volver
        </RouterLink>
      </div>
    </footer>
  </div>
</template>
