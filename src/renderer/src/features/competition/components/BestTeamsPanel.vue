<script setup lang="ts">
import { computed } from 'vue';
import type { StandingEntry } from '@shared/contracts/season.contract';
import { matchKits } from '@shared/domain/court';
import { AppEmpty, AppPanel, AppSectionTitle, AppStat, TeamBadge } from '@renderer/shared/ui';

/**
 * «Mejores equipos de la temporada», al lado de la clasificación, como IBM:
 * mejor ataque, mejor defensa, mejor y peor racha. Sale entero de la tabla —no
 * hay nada que no esté ya en sus columnas—, pero leído así se ve de un vistazo
 * quién mete más y quién va lanzado.
 *
 * Ataque y defensa se miden por partido, no en total: a mitad de jornada no
 * todos llevan los mismos partidos.
 */

const props = defineProps<{ rows: readonly StandingEntry[] }>();

interface Highlight {
  id: string;
  title: string;
  team: StandingEntry;
  stats: { label: string; value: string }[];
}

const DECIMAL = new Intl.NumberFormat('es-ES', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1
});

function perGame(total: number, played: number): number {
  return played > 0 ? total / played : 0;
}

function pick(
  rows: readonly StandingEntry[],
  better: (a: StandingEntry, b: StandingEntry) => boolean
): StandingEntry | null {
  return rows.reduce<StandingEntry | null>(
    (best, row) => (best === null || better(row, best) ? row : best),
    null
  );
}

function streakLabel(streak: number): string {
  return `${streak > 0 ? 'V' : 'D'}${Math.abs(streak)}`;
}

const highlights = computed<Highlight[]>(() => {
  const played = props.rows.filter((row) => row.played > 0);
  const result: Highlight[] = [];

  const attack = pick(
    played,
    (a, b) => perGame(a.pointsFor, a.played) > perGame(b.pointsFor, b.played)
  );
  if (attack) {
    result.push({
      id: 'attack',
      title: 'Mejor ataque',
      team: attack,
      stats: [
        { label: 'Puntos a favor', value: attack.pointsFor.toLocaleString('es-ES') },
        { label: 'Por partido', value: DECIMAL.format(perGame(attack.pointsFor, attack.played)) }
      ]
    });
  }

  const defense = pick(
    played,
    (a, b) => perGame(a.pointsAgainst, a.played) < perGame(b.pointsAgainst, b.played)
  );
  if (defense) {
    result.push({
      id: 'defense',
      title: 'Mejor defensa',
      team: defense,
      stats: [
        { label: 'Puntos en contra', value: defense.pointsAgainst.toLocaleString('es-ES') },
        {
          label: 'Por partido',
          value: DECIMAL.format(perGame(defense.pointsAgainst, defense.played))
        }
      ]
    });
  }

  const hot = pick(played, (a, b) => a.streak > b.streak);
  if (hot && hot.streak > 0) {
    result.push({
      id: 'hot',
      title: 'Mejor racha',
      team: hot,
      stats: [
        { label: 'Jugados', value: String(hot.played) },
        { label: 'Racha', value: streakLabel(hot.streak) }
      ]
    });
  }

  const cold = pick(played, (a, b) => a.streak < b.streak);
  if (cold && cold.streak < 0) {
    result.push({
      id: 'cold',
      title: 'Peor racha',
      team: cold,
      stats: [
        { label: 'Jugados', value: String(cold.played) },
        { label: 'Racha', value: streakLabel(cold.streak) }
      ]
    });
  }

  return result;
});
</script>

<template>
  <AppPanel title="Mejores equipos">
    <AppEmpty v-if="highlights.length === 0">
      Los mejores equipos salen en cuanto se juegue la primera jornada.
    </AppEmpty>

    <div v-else class="flex flex-col gap-4">
      <article v-for="item in highlights" :key="item.id" class="flex flex-col gap-[3px]">
        <AppSectionTitle size="xs">{{ item.title }}</AppSectionTitle>
        <!-- El equipo abre su ficha. -->
        <RouterLink
          :to="{ name: 'team-profile', params: { teamId: item.team.teamId } }"
          class="flex items-center gap-2 px-2 py-1 text-sm font-semibold uppercase hover:text-tv-blue-ink"
          :class="item.team.isManaged ? 'bg-tv-select' : 'bg-white'"
        >
          <TeamBadge
            :name="item.team.teamName"
            :kit="matchKits(item.team.teamId, '').home"
            :size="26"
          />
          <span class="truncate" :title="item.team.teamName">{{ item.team.teamName }}</span>
        </RouterLink>
        <div class="grid grid-cols-2 gap-[3px]">
          <AppStat v-for="stat in item.stats" :key="stat.label" :label="stat.label" size="md">
            {{ stat.value }}
          </AppStat>
        </div>
      </article>
    </div>
  </AppPanel>
</template>
