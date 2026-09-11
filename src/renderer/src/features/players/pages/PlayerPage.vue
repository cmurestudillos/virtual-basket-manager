<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import type { PlayerSummary } from '@shared/contracts/players.contract';
import { ATTRIBUTE_GROUPS, ATTRIBUTE_LABELS } from '@shared/domain/attributes';
import { conditionLabel } from '@shared/domain/conditioning';
import { injuryLabel } from '@shared/domain/injuries';
import { POSITION_LABELS } from '@shared/domain/positions';
import { formatHeight, formatMoney } from '@renderer/shared/format';

const route = useRoute();
const player = ref<PlayerSummary | null>(null);

const groups = Object.entries(ATTRIBUTE_GROUPS) as [
  keyof typeof ATTRIBUTE_GROUPS,
  readonly (keyof typeof ATTRIBUTE_LABELS)[]
][];

const groupLabels: Record<keyof typeof ATTRIBUTE_GROUPS, string> = {
  tiro: 'Tiro',
  creacion: 'Creación',
  defensa: 'Defensa',
  rebote: 'Rebote',
  fisico: 'Físico',
  mental: 'Mental'
};

async function load(): Promise<void> {
  player.value = await window.api.players.get(String(route.params.playerId));
}

onMounted(load);
// La ficha se navega desde la propia ficha (compañeros, rivales), así que la
// ruta cambia sin desmontar el componente: sin esto se quedaría el anterior.
watch(() => route.params.playerId, load);

/** Barra de color: verde arriba, naranja en la media, rojo abajo. */
function barColor(value: number): string {
  if (value >= 80) return 'bg-emerald-500';
  if (value >= 65) return 'bg-ball-500';
  if (value >= 50) return 'bg-line-500';
  return 'bg-court-600';
}
</script>

<template>
  <div v-if="player" class="flex flex-col gap-6">
    <header class="flex items-baseline gap-4">
      <h1 class="text-2xl font-semibold">{{ player.firstName }} {{ player.lastName }}</h1>
      <span class="text-ball-400">
        {{ POSITION_LABELS[player.position] }}
        <template v-if="player.secondaryPosition">
          / {{ POSITION_LABELS[player.secondaryPosition] }}
        </template>
      </span>
      <RouterLink
        :to="{ name: 'squad' }"
        class="ml-auto text-sm text-court-300 hover:text-court-100"
      >
        Volver a la plantilla
      </RouterLink>
    </header>

    <div class="grid grid-cols-7 gap-4">
      <article class="rounded border border-court-700 p-3">
        <p class="text-xs text-court-300">Media</p>
        <p class="text-2xl font-semibold text-ball-500">
          {{ player.overall
          }}<span v-if="player.uncertainty > 0" class="text-sm text-court-300">
            ±{{ player.uncertainty }}</span
          >
        </p>
      </article>
      <article class="rounded border border-court-700 p-3">
        <p class="text-xs text-court-300">Potencial</p>
        <p class="text-2xl font-semibold">{{ player.potential }}</p>
      </article>
      <article class="rounded border border-court-700 p-3">
        <p class="text-xs text-court-300">Edad</p>
        <p class="text-2xl font-semibold">{{ player.age }}</p>
      </article>
      <article class="rounded border border-court-700 p-3">
        <p class="text-xs text-court-300">Altura / envergadura</p>
        <p class="text-lg">{{ formatHeight(player.heightCm) }} · {{ player.wingspanCm }} cm</p>
      </article>
      <article class="rounded border border-court-700 p-3">
        <p class="text-xs text-court-300">Nacionalidad</p>
        <p class="text-lg">{{ player.nationality }}</p>
      </article>
      <article class="rounded border border-court-700 p-3">
        <p class="text-xs text-court-300">Sueldo</p>
        <p class="text-lg">{{ formatMoney(player.wageCents) }}</p>
      </article>
      <article
        class="rounded border p-3"
        :class="player.injuryDaysLeft > 0 ? 'border-red-900' : 'border-court-700'"
      >
        <p class="text-xs text-court-300">Estado</p>
        <p v-if="player.injuryDaysLeft > 0" class="text-lg text-red-400">
          {{ player.injuryName }}
        </p>
        <p v-else class="text-lg">{{ conditionLabel(player.condition) }}</p>
        <p class="text-sm text-court-300">
          {{
            player.injuryDaysLeft > 0
              ? injuryLabel(player.injuryDaysLeft)
              : `Forma ${player.condition}`
          }}
        </p>
      </article>
    </div>

    <p v-if="player.uncertainty > 0" class="text-sm text-line-500">
      No es tu jugador: esto es lo que ha visto tu ojeador, con un margen de ±{{
        player.uncertainty
      }}
      en cada atributo.
    </p>

    <div class="grid grid-cols-3 gap-4">
      <section
        v-for="[group, keys] in groups"
        :key="group"
        class="rounded border border-court-700 p-4"
      >
        <h2 class="mb-3 text-sm uppercase tracking-wide text-court-300">
          {{ groupLabels[group] }}
        </h2>
        <ul class="flex flex-col gap-2">
          <li v-for="key in keys" :key="key" class="flex items-center gap-3 text-sm">
            <span class="w-36 shrink-0 text-court-300">{{ ATTRIBUTE_LABELS[key] }}</span>
            <span class="h-2 flex-1 overflow-hidden rounded bg-court-800">
              <span
                class="block h-full"
                :class="barColor(player.attributes[key])"
                :style="{ width: `${player.attributes[key]}%` }"
              />
            </span>
            <span class="w-7 text-right tabular-nums">{{ player.attributes[key] }}</span>
          </li>
        </ul>
      </section>
    </div>
  </div>
</template>
