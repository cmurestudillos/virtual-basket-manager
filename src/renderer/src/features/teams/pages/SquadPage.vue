<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import type { PlayerSummary } from '@shared/contracts/players.contract';
import type { ContractEntry } from '@shared/contracts/market.contract';
import { conditionLabel } from '@shared/domain/conditioning';
import { shirtNumbers } from '@shared/domain/court';
import { injuryLabel } from '@shared/domain/injuries';
import { nationName } from '@shared/domain/national-teams';
import { POSITIONS } from '@shared/domain/positions';
import { toStars } from '@shared/domain/stars';
import { MAX_ROSTER } from '@shared/domain/youth';
import { useGameStateStore } from '@renderer/shared/game-state.store';
import { formatMoney } from '@renderer/shared/format';
import {
  AppAvatar,
  AppEmpty,
  AppFlag,
  AppPanel,
  AppRing,
  AppStars,
  MoodIcon,
  PlayerName,
  PositionChip,
  TONE_TEXT,
  bandForValue
} from '@renderer/shared/ui';

/**
 * La plantilla, como la de IBM: una fila por jugador con lo que se mira cada
 * semana —puesto, ánimo, forma, media, potencial, sueldo y lesiones— y **sin
 * atributos**, que están en la ficha. La fila lleva a la ficha.
 */

const store = useGameStateStore();
const router = useRouter();
const players = ref<PlayerSummary[]>([]);
/** Los contratos, para los años que le quedan a cada uno. */
const contracts = ref<Map<string, ContractEntry>>(new Map());

onMounted(async () => {
  if (!store.state) {
    await store.refresh();
  }
  if (!store.state) {
    return;
  }
  players.value = await window.api.players.listByTeam(store.state.teamId);
  // Los años de contrato son un extra: si el mercado no responde, la plantilla
  // se enseña igual, sin esa columna rellena.
  try {
    const entries = await window.api.market.listContracts();
    contracts.value = new Map(entries.map((entry) => [entry.playerId, entry]));
  } catch {
    contracts.value = new Map();
  }
});

/** Por puesto, de base a pívot, y dentro del puesto de mejor a peor. */
const rows = computed(() =>
  [...players.value].sort(
    (a, b) => POSITIONS.indexOf(a.position) - POSITIONS.indexOf(b.position) || b.overall - a.overall
  )
);

const numbers = computed(() => shirtNumbers(players.value.map((player) => player.id)));

/** El contrato que acaba este año va en rojo: o se renueva o se va. */
function expiring(player: PlayerSummary): boolean {
  const entry = contracts.value.get(player.id);
  return entry !== undefined && entry.contractYearsLeft <= 1;
}

function contractTitle(player: PlayerSummary): string {
  const until = contracts.value.get(player.id)?.contractUntil;
  return until ? `Contrato hasta ${new Date(until).getUTCFullYear()}` : '';
}

function openPlayer(player: PlayerSummary): void {
  void router.push({ name: 'player', params: { playerId: player.id } });
}
</script>

<template>
  <AppPanel :hint="`Jugadores en plantilla: ${players.length} / ${MAX_ROSTER}`" flush>
    <AppEmpty v-if="players.length === 0">
      No hay nadie en plantilla: los jugadores se fichan en el mercado y suben de la cantera.
    </AppEmpty>
    <table v-else class="data-table">
      <thead>
        <tr>
          <th class="numeric">Nº</th>
          <th>Jugador</th>
          <th>Pos</th>
          <th class="numeric">Edad</th>
          <th>Moral</th>
          <th class="numeric">Forma</th>
          <th class="numeric">Med</th>
          <th>Potencial</th>
          <th class="numeric">Sueldo</th>
          <th class="numeric">Años</th>
          <th>Estado</th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="player in rows"
          :key="player.id"
          class="cursor-pointer"
          @click="openPlayer(player)"
        >
          <td class="numeric">{{ numbers.get(player.id) }}</td>
          <td>
            <!-- El enlace es lo que se alcanza con el teclado; el clic vale en toda la fila. -->
            <RouterLink
              :to="{ name: 'player', params: { playerId: player.id } }"
              class="flex max-w-56 items-center gap-2 hover:text-tv-blue-ink"
              @click.stop
            >
              <AppAvatar
                kind="player"
                :seed="player.id"
                :name="`${player.firstName} ${player.lastName}`"
                :size="24"
              />
              <AppFlag :code="player.nationality" :label="nationName(player.nationality)" />
              <PlayerName :first="player.firstName" :last="player.lastName" />
            </RouterLink>
          </td>
          <td>
            <span class="flex gap-1">
              <PositionChip :position="player.position" />
              <PositionChip
                v-if="player.secondaryPosition && player.secondaryPosition !== player.position"
                :position="player.secondaryPosition"
              />
            </span>
          </td>
          <td class="numeric">{{ player.age }}</td>
          <td><MoodIcon :value="player.morale" /></td>
          <td
            class="numeric"
            :class="bandForValue(player.condition) === 'low' ? `${TONE_TEXT.bad} font-bold` : ''"
            :title="conditionLabel(player.condition)"
          >
            {{ player.condition }}
          </td>
          <td class="numeric is-key">
            <AppRing :value="player.overall" :size="28" />
          </td>
          <td>
            <AppStars :value="toStars(player.potential)" label="Potencial" :size="12" />
          </td>
          <td class="numeric">{{ formatMoney(player.wageCents) }}</td>
          <td
            class="numeric"
            :class="expiring(player) ? `${TONE_TEXT.bad} font-bold` : ''"
            :title="contractTitle(player)"
          >
            {{ contracts.get(player.id)?.contractYearsLeft ?? '-' }}
          </td>
          <td>
            <!-- El nombre de la lesión puede ser largo: se corta y va entero en el `title`. -->
            <span
              v-if="player.injuryDaysLeft > 0"
              class="block max-w-44 truncate"
              :class="TONE_TEXT.bad"
              :title="`${player.injuryName} · ${injuryLabel(player.injuryDaysLeft)}`"
            >
              <span class="font-bold">{{ injuryLabel(player.injuryDaysLeft) }}</span>
              · {{ player.injuryName }}
            </span>
            <span v-else class="text-tv-muted">-</span>
          </td>
        </tr>
      </tbody>
    </table>
  </AppPanel>
</template>
