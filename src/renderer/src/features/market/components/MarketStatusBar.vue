<script setup lang="ts">
/**
 * La barra negra de arriba del mercado, como la de «CAPITAL» en las finanzas de
 * IBM: la ventana de fichajes y lo que pone límite a lo que se puede hacer en
 * ella —caja, plantilla y, según la liga, cupo de formación y tope del consejo
 * o tope salarial con su impuesto—.
 *
 * Es la cabecera de la pantalla (`header`, con la ventana como `h1`): el nombre
 * de la sección ya está en la barra de sección, así que el encabezado dice lo
 * que cambia con el calendario.
 */
import type { MarketStatus } from '@shared/contracts/market.contract';
import { formatMoney } from '@renderer/shared/format';
import { AppBadge } from '@renderer/shared/ui';

defineProps<{ status: MarketStatus }>();
</script>

<template>
  <header class="flex flex-wrap items-center gap-x-6 gap-y-1 bg-tv-slab px-4 py-2 text-white">
    <h1 class="flex items-center gap-2 text-base font-bold uppercase tracking-wide">
      {{ status.windowLabel }}
      <AppBadge v-if="status.isOpen" tone="good">Abierto</AppBadge>
    </h1>

    <dl class="ml-auto flex flex-wrap items-baseline gap-x-5 gap-y-1 text-sm">
      <div class="flex items-baseline gap-2">
        <dt class="text-xs font-bold uppercase tracking-wide text-white/70">Caja</dt>
        <dd class="figure m-0 font-bold" :class="status.balanceCents < 0 ? 'text-tv-mood-low' : ''">
          {{ formatMoney(status.balanceCents) }}
        </dd>
      </div>
      <div class="flex items-baseline gap-2">
        <dt class="text-xs font-bold uppercase tracking-wide text-white/70">Plantilla</dt>
        <dd class="figure m-0 font-bold">{{ status.rosterSize }}/{{ status.maxRoster }}</dd>
      </div>

      <template v-if="status.salaryCap">
        <div class="flex items-baseline gap-2">
          <dt class="text-xs font-bold uppercase tracking-wide text-white/70">Nómina</dt>
          <dd class="figure m-0 font-bold">{{ formatMoney(status.seasonWagesCents) }}</dd>
        </div>
        <div class="flex items-baseline gap-2">
          <dt class="text-xs font-bold uppercase tracking-wide text-white/70">Tope</dt>
          <dd class="figure m-0 font-bold">{{ formatMoney(status.salaryCap.capCents) }}</dd>
        </div>
        <div class="flex items-baseline gap-2">
          <dt class="text-xs font-bold uppercase tracking-wide text-white/70">Impuesto desde</dt>
          <dd class="figure m-0 font-bold">
            {{ formatMoney(status.salaryCap.taxLineCents) }}
            <span
              v-if="status.salaryCap.projectedTaxCents > 0"
              class="font-semibold text-tv-mood-low"
            >
              (pagarías {{ formatMoney(status.salaryCap.projectedTaxCents) }})
            </span>
          </dd>
        </div>
      </template>
      <template v-else>
        <div class="flex items-baseline gap-2">
          <dt class="text-xs font-bold uppercase tracking-wide text-white/70">Formación</dt>
          <dd
            class="figure m-0 font-bold"
            :class="status.homegrownInSquad <= status.minHomegrown ? 'text-tv-amber' : ''"
          >
            {{ status.homegrownInSquad }}/{{ status.minHomegrown }}
          </dd>
        </div>
        <div class="flex items-baseline gap-2">
          <dt class="text-xs font-bold uppercase tracking-wide text-white/70">Nóminas</dt>
          <dd class="figure m-0 font-bold">
            {{ formatMoney(status.seasonWagesCents) }}
            <span class="font-normal text-white/70">de</span>
            {{ formatMoney(status.wageCeilingCents) }}
          </dd>
        </div>
      </template>
    </dl>
  </header>
</template>
