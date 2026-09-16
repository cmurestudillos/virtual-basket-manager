<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import type { DraftView } from '@shared/contracts/draft.contract';
import { POSITION_LABELS } from '@shared/domain/positions';
import { formatHeight } from '@renderer/shared/format';
import {
  AppAvatar,
  AppBadge,
  AppButton,
  AppEmpty,
  AppFlag,
  AppPanel,
  AppSectionTitle
} from '@renderer/shared/ui';

/**
 * El draft: el orden con su lotería a un lado y los prospectos al otro.
 *
 * La IA elige hasta que le toca al usuario, que escoge con lo que ve su
 * ojeador. Nada obliga a terminarlo: lo que quede se elige solo al empezar la
 * temporada siguiente.
 */

const view = ref<DraftView | null>(null);
const loaded = ref(false);
const busy = ref(false);
const error = ref<string | null>(null);

onMounted(async () => {
  view.value = await window.api.draft.get();
  loaded.value = true;
});

async function run(action: () => Promise<DraftView | null>): Promise<void> {
  busy.value = true;
  error.value = null;
  try {
    view.value = await action();
  } catch (cause) {
    const text = cause instanceof Error ? cause.message : 'No se pudo completar';
    error.value = text.replace(/^Error invoking remote method '[^']+': (\w*Error: )?/, '');
  } finally {
    busy.value = false;
  }
}

const simulateToUser = () => window.api.draft.simulateToUser();
const passPick = () => window.api.draft.pass();
const simulateAll = () => window.api.draft.simulateAll();
const pickProspect = (playerId: string) => window.api.draft.pick(playerId);

const rounds = computed(() =>
  [1, 2].map((round) => ({
    round,
    picks: view.value?.picks.filter((row) => row.round === round) ?? []
  }))
);
</script>

<template>
  <div v-if="loaded" class="flex flex-col gap-4">
    <AppEmpty v-if="!view">El draft sólo existe si se juega la liga americana.</AppEmpty>

    <template v-else>
      <section class="flex flex-wrap items-center gap-3 rounded border border-court-700 px-4 py-3">
        <div class="flex-1">
          <p v-if="view.status === 'waiting'" class="text-sm text-court-300">
            El draft se celebra al acabar la temporada de {{ view.competitionName }}: los que no
            llegan a playoffs sortean las cuatro primeras elecciones.
            <template v-if="view.picks.length > 0">
              Debajo, el de la temporada {{ view.seasonNumber }}.
            </template>
          </p>
          <p v-else-if="view.status === 'done'" class="text-sm text-court-300">
            Draft de la temporada {{ view.seasonNumber }} terminado.
          </p>
          <p v-else-if="view.onTheClock" class="text-sm">
            En el reloj: elección {{ view.onTheClock.pick }} ·
            <span :class="view.userOnTheClock ? 'text-ball-400' : ''">{{
              view.onTheClock.teamName
            }}</span>
            <span v-if="view.userOnTheClock && view.rosterFull" class="ml-2 text-bad-400">
              Tu plantilla está llena: libera a alguien en el mercado o renuncia.
            </span>
          </p>
          <p v-if="error" class="text-sm text-bad-400">{{ error }}</p>
        </div>
        <template v-if="view.status === 'open'">
          <AppButton v-if="!view.userOnTheClock" :disabled="busy" @click="run(simulateToUser)">
            {{ view.userInLeague ? 'Avanzar hasta mi elección' : 'Avanzar' }}
          </AppButton>
          <AppButton
            v-if="view.userOnTheClock"
            variant="ghost"
            :disabled="busy"
            @click="run(passPick)"
          >
            Renunciar a la elección
          </AppButton>
          <AppButton variant="ghost" :disabled="busy" @click="run(simulateAll)">
            Terminar el draft
          </AppButton>
        </template>
      </section>

      <div class="grid gap-4 xl:grid-cols-[22rem_1fr]">
        <AppPanel title="Orden" flush scroll class="max-h-[42rem]">
          <div class="overflow-auto">
            <template v-for="round in rounds" :key="round.round">
              <AppSectionTitle class="px-4 pt-3">{{ round.round }}ª ronda</AppSectionTitle>
              <ul class="flex flex-col px-2 pb-2 text-sm">
                <li
                  v-for="pick in round.picks"
                  :key="pick.pick"
                  class="grid grid-cols-[2rem_1fr] gap-2 rounded px-2 py-1"
                  :class="[
                    pick.isUser ? 'text-ball-400' : '',
                    view.onTheClock?.pick === pick.pick ? 'bg-court-800' : ''
                  ]"
                >
                  <span class="numeric text-court-300">{{ pick.pick }}</span>
                  <span>
                    {{ pick.teamName }}
                    <AppBadge v-if="pick.lotteryWinner" tone="accent" class="ml-1"
                      >lotería</AppBadge
                    >
                    <span class="block text-xs text-court-300">
                      <template v-if="pick.playerName">
                        <AppFlag :code="pick.nationality" /> {{ pick.playerName }}
                        <span v-if="pick.position">· {{ pick.position }}</span>
                      </template>
                      <template v-else-if="pick.passed">Renuncia</template>
                    </span>
                  </span>
                </li>
              </ul>
            </template>
          </div>
        </AppPanel>

        <AppPanel
          v-if="view.status === 'open'"
          title="Prospectos"
          :hint="`${view.prospects.length} disponibles · medias vistas por tu ojeador`"
          flush
          scroll
          class="max-h-[42rem]"
        >
          <div class="overflow-auto">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Jugador</th>
                  <th>Puesto</th>
                  <th class="numeric">Edad</th>
                  <th class="numeric">Altura</th>
                  <th class="numeric">Media</th>
                  <th class="numeric">Potencial</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="prospect in view.prospects" :key="prospect.playerId">
                  <td>
                    <span class="inline-flex items-center gap-2">
                      <AppAvatar kind="player" :seed="prospect.playerId" />
                      <AppFlag :code="prospect.nationality" />
                      {{ prospect.name }}
                    </span>
                  </td>
                  <td class="text-court-300">{{ POSITION_LABELS[prospect.position] }}</td>
                  <td class="numeric">{{ prospect.age }}</td>
                  <td class="numeric">{{ formatHeight(prospect.heightCm) }}</td>
                  <td class="numeric font-semibold">
                    {{ prospect.overall }}
                    <span v-if="prospect.uncertainty > 0" class="text-xs text-court-300">
                      ±{{ prospect.uncertainty }}
                    </span>
                  </td>
                  <td class="numeric">{{ prospect.potential }}</td>
                  <td>
                    <AppButton
                      v-if="view.userOnTheClock"
                      size="sm"
                      variant="primary"
                      :disabled="busy || view.rosterFull"
                      @click="run(() => pickProspect(prospect.playerId))"
                    >
                      Elegir
                    </AppButton>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </AppPanel>
      </div>
    </template>
  </div>
</template>
