<script setup lang="ts">
import { onMounted, ref } from 'vue';
import type { YouthAcademy, YouthPlayer } from '@shared/contracts/youth.contract';
import { POSITION_LABELS } from '@shared/domain/positions';
import { useGameStateStore } from '@renderer/shared/game-state.store';
import { formatHeight, formatMoney } from '@renderer/shared/format';
import { AppButton, AppPageHeader, AppStat } from '@renderer/shared/ui';

const store = useGameStateStore();

const academy = ref<YouthAcademy | null>(null);
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

function promote(player: YouthPlayer): void {
  if (!academy.value) {
    return;
  }
  void run(
    () =>
      window.api.youth.promote({
        teamId: academy.value!.teamId,
        playerId: player.playerId
      }),
    `${player.playerName} sube al primer equipo.`
  );
}

function upgrade(): void {
  if (!academy.value) {
    return;
  }
  void run(
    () => window.api.youth.upgrade({ teamId: academy.value!.teamId }),
    'Obra encargada: la cantera sube de nivel.'
  );
}

/** Cuánto le queda por crecer: es lo único que importa de un juvenil. */
function headroom(player: YouthPlayer): number {
  return Math.max(0, player.potential - player.overall);
}
</script>

<template>
  <div v-if="academy" class="flex flex-col gap-5">
    <AppPageHeader title="Cantera">
      <span class="text-sm text-court-300">
        Cada verano sale una hornada nueva; a los diecinueve, o suben o se van
      </span>
    </AppPageHeader>

    <section class="grid grid-cols-4 gap-4">
      <AppStat label="Instalaciones" tone="accent" boxed>
        {{ academy.levelLabel }}
        <template #note>Nivel {{ academy.level }} de 5</template>
      </AppStat>
      <AppStat label="Mantenimiento" size="md" boxed>
        {{ formatMoney(academy.upkeepCents) }}
        <template #note>al año, dentro del recibo del club</template>
      </AppStat>
      <AppStat label="Plantilla" size="md" boxed>
        {{ academy.rosterSize }} / {{ academy.maxRoster }}
        <template #note>
          <span :class="academy.canPromote ? '' : 'text-warn-400'">
            {{
              academy.canPromote
                ? 'Hay hueco para subir a alguien'
                : 'Sin hueco: no se puede promocionar'
            }}
          </span>
        </template>
      </AppStat>
      <article class="flex flex-col justify-between rounded border border-court-700 p-4">
        <p class="text-xs uppercase tracking-wide text-court-300">Mejorar</p>
        <p v-if="academy.upgradeCostCents === null" class="mt-1 text-sm text-court-300">
          Ya está al máximo.
        </p>
        <template v-else>
          <p class="mt-1 text-lg">{{ formatMoney(academy.upgradeCostCents) }}</p>
          <AppButton
            variant="primary"
            size="sm"
            class="mt-2"
            :disabled="busy || !academy.isManaged"
            @click="upgrade"
          >
            Subir a nivel {{ academy.level + 1 }}
          </AppButton>
        </template>
      </article>
    </section>

    <div class="overflow-auto rounded border border-court-700">
      <table class="data-table">
        <thead>
          <tr>
            <th>Jugador</th>
            <th>Pos</th>
            <th class="numeric">Edad</th>
            <th class="numeric">Altura</th>
            <th class="numeric">Media</th>
            <th class="numeric">Techo</th>
            <th class="numeric">Margen</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="academy.players.length === 0">
            <td colspan="8" class="text-court-300">
              No hay juveniles ahora mismo. La próxima hornada sale en verano.
            </td>
          </tr>
          <tr v-for="player in academy.players" :key="player.playerId">
            <td>{{ player.playerName }}</td>
            <td>
              <span class="text-ball-400">{{ player.position }}</span>
              <span class="ml-1 text-xs text-court-600">
                {{ POSITION_LABELS[player.position] }}
              </span>
            </td>
            <td class="numeric">{{ player.age }}</td>
            <td class="numeric text-court-300">{{ formatHeight(player.heightCm) }}</td>
            <td class="numeric">{{ player.overall }}</td>
            <td class="numeric font-semibold text-ball-400">{{ player.potential }}</td>
            <td class="numeric" :class="headroom(player) >= 20 ? 'text-good-400' : ''">
              +{{ headroom(player) }}
            </td>
            <td>
              <AppButton
                size="sm"
                :disabled="busy || !academy.canPromote || !academy.isManaged"
                @click="promote(player)"
              >
                Promocionar
              </AppButton>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <p v-if="error" class="text-sm text-bad-400">{{ error }}</p>
    <p v-else-if="message" class="text-sm text-good-400">{{ message }}</p>
  </div>
</template>
