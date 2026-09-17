<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import type { DraftView } from '@shared/contracts/draft.contract';
import { toStars } from '@shared/domain/stars';
import { formatHeight, formatMoney } from '@renderer/shared/format';
import {
  AppBadge,
  AppButton,
  AppEmpty,
  AppFlag,
  AppPanel,
  AppRing,
  AppSectionTitle,
  AppStars,
  PlayerName,
  PositionChip,
  TONE_TEXT
} from '@renderer/shared/ui';
import PageActions from '@renderer/features/app-shell/components/PageActions.vue';

/**
 * El draft: el orden con su lotería a un lado y los prospectos al otro.
 *
 * La IA elige hasta que le toca al usuario, que escoge con lo que ve su
 * ojeador. Nada obliga a terminarlo: lo que quede se elige solo al empezar la
 * temporada siguiente.
 *
 * Como la previsión del draft de IBM: los prospectos en la rejilla, con el
 * puesto en su chip, la media en su aro y el potencial en estrellas. Avanzar,
 * renunciar y terminar van en la barra de acciones de abajo; elegir, en la
 * fila de cada prospecto.
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
    <AppPanel v-if="!view" title="Draft">
      <AppEmpty>El draft sólo existe si se juega la liga americana.</AppEmpty>
    </AppPanel>

    <template v-else>
      <PageActions v-if="view.status === 'open'">
        <AppButton v-if="!view.userOnTheClock" :disabled="busy" @click="run(simulateToUser)">
          {{ view.userInLeague ? 'Avanzar hasta mi elección' : 'Avanzar' }}
        </AppButton>
        <AppButton v-if="view.userOnTheClock" :disabled="busy" @click="run(passPick)">
          Renunciar a la elección
        </AppButton>
        <AppButton :disabled="busy" @click="run(simulateAll)">Terminar el draft</AppButton>
      </PageActions>

      <AppPanel :title="`Draft de la temporada ${view.seasonNumber}`" :hint="view.competitionName">
        <div class="flex flex-col gap-1 text-sm">
          <p v-if="view.status === 'waiting'" class="text-tv-muted">
            El draft se celebra al acabar la temporada de {{ view.competitionName }}: los que no
            llegan a playoffs sortean las cuatro primeras elecciones.
            <template v-if="view.picks.length > 0">
              Debajo, el de la temporada {{ view.seasonNumber }}.
            </template>
          </p>
          <p v-else-if="view.status === 'done'" class="text-tv-muted">
            Draft de la temporada {{ view.seasonNumber }} terminado.
          </p>
          <p v-else-if="view.onTheClock">
            En el reloj: elección {{ view.onTheClock.pick }} ·
            <span class="font-bold">{{ view.onTheClock.teamName }}</span>
            <span
              v-if="view.userOnTheClock && view.rosterFull"
              class="ml-2 font-semibold"
              :class="TONE_TEXT.bad"
            >
              Tu plantilla está llena: libera a alguien en el mercado o renuncia.
            </span>
          </p>
          <p v-if="view.userPickCost" class="text-tv-muted">
            Tu novato cobrará {{ formatMoney(view.userPickCost.rookieWageCents) }} · la nómina pasa
            de {{ formatMoney(view.userPickCost.payrollCents) }} a
            {{ formatMoney(view.userPickCost.payrollAfterCents) }} (impuesto desde
            {{ formatMoney(view.userPickCost.taxLineCents) }})
            <span
              v-if="view.userPickCost.projectedTaxCents > 0"
              class="font-semibold"
              :class="TONE_TEXT.bad"
            >
              · pagarías {{ formatMoney(view.userPickCost.projectedTaxCents) }} de impuesto
            </span>
          </p>
          <p v-if="error" class="font-semibold" :class="TONE_TEXT.bad">{{ error }}</p>
        </div>
      </AppPanel>

      <div
        v-if="view.picks.length > 0"
        class="grid items-start gap-4"
        :class="view.status === 'open' ? 'grid-cols-[20rem_minmax(0,1fr)]' : 'max-w-xl'"
      >
        <AppPanel title="Orden" flush scroll class="h-[calc(100vh-22rem)] min-h-72">
          <template v-for="round in rounds" :key="round.round">
            <AppSectionTitle size="xs">{{ round.round }}ª ronda</AppSectionTitle>
            <table class="data-table">
              <tbody>
                <tr
                  v-for="pick in round.picks"
                  :key="pick.pick"
                  :class="pick.isUser ? 'is-mine' : ''"
                >
                  <td class="numeric w-10">
                    <span
                      v-if="view.onTheClock?.pick === pick.pick"
                      class="figure inline-block min-w-6 bg-tv-blue px-1 text-center font-bold text-white"
                      title="En el reloj"
                    >
                      {{ pick.pick }}
                    </span>
                    <template v-else>{{ pick.pick }}</template>
                  </td>
                  <td class="max-w-0">
                    <span class="flex items-center gap-1.5">
                      <span class="truncate" :title="pick.teamName">{{ pick.teamName }}</span>
                      <AppBadge v-if="pick.lotteryWinner" tone="warn">lotería</AppBadge>
                    </span>
                    <span
                      v-if="pick.playerName || pick.passed"
                      class="flex items-center gap-1.5 text-xs text-tv-muted"
                    >
                      <template v-if="pick.playerName">
                        <AppFlag :code="pick.nationality" />
                        <PlayerName :name="pick.playerName" mode="initial" />
                        <PositionChip v-if="pick.position" :position="pick.position" />
                      </template>
                      <template v-else>Renuncia</template>
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>
          </template>
        </AppPanel>

        <AppPanel
          v-if="view.status === 'open'"
          title="Prospectos"
          :hint="`${view.prospects.length} disponibles · medias de tu ojeador`"
          flush
          scroll
          class="h-[calc(100vh-22rem)] min-h-72"
        >
          <table class="data-table">
            <thead>
              <tr>
                <th>Jugador</th>
                <th>Pos</th>
                <th class="numeric">Edad</th>
                <th class="numeric">Altura</th>
                <th class="numeric">Media</th>
                <th>Potencial</th>
                <th><span class="sr-only">Elegir</span></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="prospect in view.prospects" :key="prospect.playerId">
                <td>
                  <span class="flex items-center gap-2">
                    <AppFlag :code="prospect.nationality" />
                    <PlayerName :name="prospect.name" />
                  </span>
                </td>
                <td><PositionChip :position="prospect.position" /></td>
                <td class="numeric">{{ prospect.age }}</td>
                <td class="numeric">{{ formatHeight(prospect.heightCm) }}</td>
                <td class="numeric is-key py-0.5">
                  <span class="inline-flex items-center gap-1">
                    <AppRing :value="prospect.overall" :size="28" />
                    <span v-if="prospect.uncertainty > 0" class="w-7 text-xs text-tv-muted">
                      ±{{ prospect.uncertainty }}
                    </span>
                  </span>
                </td>
                <td class="py-0.5">
                  <AppStars :value="toStars(prospect.potential)" label="Potencial" :size="12" />
                </td>
                <td class="py-0.5">
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
        </AppPanel>
      </div>
    </template>
  </div>
</template>
