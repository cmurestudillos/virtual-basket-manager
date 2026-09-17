<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import type { YouthAcademy, YouthPlayer } from '@shared/contracts/youth.contract';
import { nationName } from '@shared/domain/national-teams';
import { toStars } from '@shared/domain/stars';
import { useGameStateStore } from '@renderer/shared/game-state.store';
import { formatHeight, formatMoney } from '@renderer/shared/format';
import {
  AppAvatar,
  AppButton,
  AppEmpty,
  AppFlag,
  AppPanel,
  AppRing,
  AppStars,
  AppStat,
  PlayerName,
  PositionChip,
  TONE_TEXT
} from '@renderer/shared/ui';
import PageActions from '@renderer/features/app-shell/components/PageActions.vue';

/**
 * La cantera, como la plantilla U18 de IBM: las instalaciones y lo que cuestan
 * arriba, y la tabla de juveniles con la media en anillo —en rojo casi siempre:
 * un juvenil vale poco hoy— y el techo en estrellas, que es de lo que va esto.
 *
 * Promocionar y mejorar las instalaciones van en la barra de abajo. Se
 * promociona al juvenil elegido en la tabla (el primero, si no se elige).
 */

const store = useGameStateStore();

const academy = ref<YouthAcademy | null>(null);
const selectedId = ref<string | null>(null);
const busy = ref(false);
const message = ref<string | null>(null);
const error = ref<string | null>(null);

onMounted(async () => {
  if (!store.state) {
    await store.refresh();
  }
  if (store.state) {
    academy.value = await window.api.youth.get(store.state.teamId);
  }
});

/** El elegido, o el primero si el elegido ya no está (subió o no se eligió a nadie). */
const selected = computed<YouthPlayer | null>(() => {
  const players = academy.value?.players ?? [];
  return players.find((player) => player.playerId === selectedId.value) ?? players[0] ?? null;
});

async function run(action: () => Promise<YouthAcademy>, done: string): Promise<void> {
  busy.value = true;
  error.value = null;
  message.value = null;
  try {
    academy.value = await action();
    message.value = done;
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'No se pudo hacer la operación';
  } finally {
    busy.value = false;
  }
}

function promote(): void {
  const player = selected.value;
  if (!academy.value || !player) {
    return;
  }
  const teamId = academy.value.teamId;
  void run(
    () => window.api.youth.promote({ teamId, playerId: player.playerId }),
    `${player.playerName} sube al primer equipo.`
  );
}

function upgrade(): void {
  if (!academy.value) {
    return;
  }
  const teamId = academy.value.teamId;
  void run(() => window.api.youth.upgrade({ teamId }), 'Obra encargada: la cantera sube de nivel.');
}

/** Cuánto le queda por crecer: es lo único que importa de un juvenil. */
function headroom(player: YouthPlayer): number {
  return Math.max(0, player.potential - player.overall);
}
</script>

<template>
  <div v-if="academy" class="flex flex-col gap-4">
    <AppPanel>
      <section class="grid grid-cols-4 gap-4">
        <AppStat label="Instalaciones" size="md" boxed>
          {{ academy.levelLabel }}
          <template #note>
            <span class="flex flex-col items-center gap-1">
              <AppStars :value="academy.level" label="Instalaciones" />
              Nivel {{ academy.level }} de 5
            </span>
          </template>
        </AppStat>
        <AppStat label="Mantenimiento" size="md" boxed>
          {{ formatMoney(academy.upkeepCents) }}
          <template #note>al año, dentro del recibo del club</template>
        </AppStat>
        <AppStat label="Plantilla" size="md" boxed>
          {{ academy.rosterSize }} / {{ academy.maxRoster }}
          <template #note>
            <span :class="academy.canPromote ? '' : TONE_TEXT.warn">
              {{
                academy.canPromote
                  ? 'Hay hueco para subir a alguien'
                  : 'Sin hueco: no se puede promocionar'
              }}
            </span>
          </template>
        </AppStat>
        <AppStat label="Mejorar" size="md" boxed>
          {{
            academy.upgradeCostCents === null ? 'Al máximo' : formatMoney(academy.upgradeCostCents)
          }}
          <template #note>
            {{
              academy.upgradeCostCents === null
                ? 'Ya no hay obra que encargar'
                : `lo que cuesta subir a nivel ${academy.level + 1}`
            }}
          </template>
        </AppStat>
      </section>
    </AppPanel>

    <AppPanel :hint="`Juveniles en la cantera: ${academy.players.length}`" flush>
      <AppEmpty v-if="academy.players.length === 0">
        No hay juveniles ahora mismo. La próxima hornada sale en verano.
      </AppEmpty>
      <table v-else class="data-table">
        <thead>
          <tr>
            <th>Jugador</th>
            <th>Pos</th>
            <th class="numeric">Edad</th>
            <th class="numeric">Altura</th>
            <th class="numeric">Med</th>
            <th>Techo</th>
            <th class="numeric">Margen</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="player in academy.players"
            :key="player.playerId"
            class="cursor-pointer"
            :class="selected?.playerId === player.playerId ? 'is-selected' : ''"
            @click="selectedId = player.playerId"
          >
            <td>
              <!-- El botón es lo que se alcanza con el teclado; el clic vale en toda la fila. -->
              <button
                type="button"
                class="flex max-w-72 items-center gap-2 text-left"
                :aria-pressed="selected?.playerId === player.playerId"
                @click.stop="selectedId = player.playerId"
              >
                <AppAvatar
                  kind="player"
                  :seed="player.playerId"
                  :name="player.playerName"
                  :size="24"
                />
                <AppFlag :code="player.nationality" :label="nationName(player.nationality)" />
                <PlayerName :name="player.playerName" />
              </button>
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
            <td class="numeric">{{ formatHeight(player.heightCm) }}</td>
            <td class="numeric is-key">
              <AppRing :value="player.overall" :size="28" />
            </td>
            <td>
              <span class="flex items-center gap-2">
                <AppStars :value="toStars(player.potential)" label="Techo" :size="12" />
                <span class="figure font-bold">{{ player.potential }}</span>
              </span>
            </td>
            <td class="numeric font-bold" :class="headroom(player) > 0 ? TONE_TEXT.good : ''">
              +{{ headroom(player) }}
            </td>
          </tr>
        </tbody>
      </table>
      <p class="px-3 py-2 text-xs text-tv-muted">
        Cada verano sale una hornada nueva; a los diecinueve, o suben o se van.
      </p>
      <p
        v-if="error || message"
        role="status"
        class="px-3 pb-3 text-sm font-semibold"
        :class="error ? TONE_TEXT.bad : TONE_TEXT.good"
      >
        {{ error ?? message }}
      </p>
    </AppPanel>

    <PageActions>
      <AppButton
        v-if="academy.upgradeCostCents !== null"
        :disabled="busy || !academy.isManaged"
        @click="upgrade"
      >
        Subir a nivel {{ academy.level + 1 }}
      </AppButton>
      <AppButton
        variant="primary"
        :disabled="busy || !selected || !academy.canPromote || !academy.isManaged"
        :title="selected ? `Subir a ${selected.playerName} al primer equipo` : ''"
        @click="promote"
      >
        Promocionar
      </AppButton>
    </PageActions>
  </div>
</template>
