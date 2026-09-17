<script setup lang="ts">
import { computed } from 'vue';
import type { Kit } from '@shared/domain/court';
import TeamBadge from './TeamBadge.vue';

/**
 * La tarjeta de un partido: la tira de partidos del inicio, como IBM (125858).
 *
 * Cabecera y pie en el naranja de competición, con la fecha arriba —y la casa o
 * el avión según se juegue en casa o fuera— y la competición o la jornada
 * abajo. Dentro, papel: los dos escudos con su nombre y su marcador, el ganador
 * en negrita. `featured` es el PRÓXIMO PARTIDO, el grande del centro: los
 * escudos a los lados y los nombres en medio.
 *
 * El hueco por defecto sustituye al cuerpo en la tarjeta grande: sirve para lo
 * que ocupa el sitio del próximo partido cuando no lo hay (una semana de
 * descanso, el campeón). Va sobre el marco o sobre papel; no sabe de rutas, así
 * que quien quiera abrir el partido la envuelve en un enlace.
 */

export interface FixtureSide {
  name: string;
  kit: Kit;
  /** Código del país, si es una selección: lleva bandera y no escudo. */
  nationOf?: string | null;
  score?: number | null;
}

const props = withDefaults(
  defineProps<{
    home?: FixtureSide | null;
    away?: FixtureSide | null;
    /** Ya formateada: «28 nov». */
    date: string;
    /** Dónde se juega, visto desde el club del usuario; sin icono si no es suyo. */
    venue?: 'home' | 'away' | null;
    /** La línea de abajo: competición, jornada o eliminatoria. */
    footer?: string;
    featured?: boolean;
    /** Delante de la fecha en la tarjeta grande. */
    title?: string;
    /** Letra pequeña bajo los nombres en la tarjeta grande. */
    detail?: string;
  }>(),
  {
    home: null,
    away: null,
    venue: null,
    footer: '',
    featured: false,
    title: 'Próximo partido',
    detail: ''
  }
);

const sides = computed(() =>
  props.home && props.away ? ([props.home, props.away] as const) : null
);
const played = computed(
  () => sides.value !== null && sides.value.every((side) => typeof side.score === 'number')
);

function isWinner(side: FixtureSide): boolean {
  if (!played.value || !props.home || !props.away) {
    return false;
  }
  const other = side === props.home ? props.away : props.home;
  return (side.score ?? 0) > (other.score ?? 0);
}

/** «Próximo partido · 5 dic» en la grande; en la pequeña, sólo la fecha. */
const heading = computed(() => (props.featured ? `${props.title} · ${props.date}` : props.date));

const BAND = 'bg-linear-to-r from-tv-competition to-tv-competition-deep text-white';
</script>

<template>
  <article class="flex min-w-0 flex-col text-tv-ink">
    <div
      class="flex items-center gap-2 px-2 font-bold uppercase tracking-wide"
      :class="[BAND, featured ? 'py-1 text-sm' : 'py-0.5 text-xs']"
    >
      <!-- Casa o avión: dibujados aquí, nunca los de IBM. -->
      <svg
        v-if="venue"
        viewBox="0 0 24 24"
        class="h-4 w-4 shrink-0"
        role="img"
        :aria-label="venue === 'home' ? 'En casa' : 'Fuera'"
      >
        <path
          v-if="venue === 'home'"
          d="M3 11 L12 3 L21 11 V21 H14 V14 H10 V21 H3 Z"
          fill="currentColor"
        />
        <path
          v-else
          d="M21 15 V13 L13 8 V3.5 C13 2.7 12.6 2 12 2 C11.4 2 11 2.7 11 3.5 V8 L3 13 V15 L11 12.5 V18 L9 19.5 V21 L12 20 L15 21 V19.5 L13 18 V12.5 Z"
          fill="currentColor"
        />
      </svg>
      <span class="min-w-0 flex-1 truncate text-center">{{ heading }}</span>
    </div>

    <!-- La grande: escudos a los lados y los nombres en medio. -->
    <div v-if="featured" class="flex min-h-24 flex-1 items-center gap-3 bg-tv-paper px-3 py-2">
      <TeamBadge
        v-if="home"
        :name="home.name"
        :kit="home.kit"
        :nation-of="home.nationOf ?? null"
        :size="60"
      />
      <div class="flex min-w-0 flex-1 flex-col items-center gap-1 text-center">
        <slot>
          <span class="line-clamp-2 text-base font-bold uppercase leading-tight tracking-wide">
            {{ home?.name }} - {{ away?.name }}
          </span>
        </slot>
        <span v-if="detail" class="truncate text-xs text-tv-muted">{{ detail }}</span>
      </div>
      <TeamBadge
        v-if="away"
        :name="away.name"
        :kit="away.kit"
        :nation-of="away.nationOf ?? null"
        :size="60"
      />
    </div>

    <!-- La pequeña: una fila por equipo, con su marcador. -->
    <div v-else class="flex flex-1 flex-col gap-0.5 bg-tv-paper p-0.5">
      <div
        v-for="(side, index) in sides ?? []"
        :key="index"
        class="flex min-w-0 items-center gap-2 bg-tv-cell px-2 py-0.5"
      >
        <TeamBadge
          :name="side.name"
          :kit="side.kit"
          :nation-of="side.nationOf ?? null"
          :size="24"
        />
        <span class="min-w-0 flex-1 truncate text-sm" :title="side.name">{{ side.name }}</span>
        <span
          class="figure w-8 shrink-0 text-right text-sm"
          :class="isWinner(side) ? 'font-bold' : ''"
        >
          {{ typeof side.score === 'number' ? side.score : '-' }}
        </span>
      </div>
    </div>

    <p
      v-if="footer"
      class="truncate px-2 text-center font-bold"
      :class="[BAND, featured ? 'py-1 text-sm' : 'py-0.5 text-xs']"
    >
      {{ footer }}
    </p>
  </article>
</template>
