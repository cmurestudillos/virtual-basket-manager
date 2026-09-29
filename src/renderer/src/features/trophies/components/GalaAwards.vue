<script setup lang="ts">
/**
 * Los premios de una temporada de liga: los individuales en fichas de líder y
 * el quinteto ideal, de base a pívot. Lo usan la gala (en la pantalla de
 * campeón) y la pestaña Galas del historial.
 *
 * Todo llega hecho del proceso principal —quién, de qué club, con qué cifra—
 * con los nombres congelados el día que se entregó. Lo del club del usuario va
 * en azul pálido, como todo lo tuyo.
 */
import { computed } from 'vue';
import type { SeasonAwardEntry } from '@shared/contracts/trophies.contract';
import { POSITION_LABELS } from '@shared/domain/positions';
import { SEASON_AWARD_LABEL, SEASON_AWARD_VALUE_LABEL } from '@shared/domain/season-awards';
import {
  AppPanel,
  LeaderCard,
  PositionChip,
  PlayerName,
  AppAvatar,
  AppEmpty
} from '@renderer/shared/ui';
import { formatPoints } from '@renderer/shared/format';
import { coachAvatarSeed } from '@renderer/features/coaches/coach-avatar';

const props = withDefaults(
  defineProps<{
    awards: SeasonAwardEntry[];
    /** Tres fichas por fila en vez de dos: para cuando va a todo el ancho. */
    compact?: boolean;
    /** Qué liga y qué año, a la izquierda del rótulo. */
    hint?: string;
  }>(),
  { compact: false, hint: '' }
);

const individual = computed(() => props.awards.filter((award) => award.type !== 'all_league'));
const quintet = computed(() =>
  props.awards.filter((award) => award.type === 'all_league').sort((a, b) => a.slot - b.slot)
);

function nameOf(award: SeasonAwardEntry): string {
  return award.playerName ?? award.coachName ?? award.teamName;
}

function seedOf(award: SeasonAwardEntry): string {
  if (award.type === 'coach_of_year') {
    return coachAvatarSeed({
      id: award.coachId ?? award.teamId,
      name: award.coachName ?? '',
      isManager: award.coachIsManager
    });
  }
  return award.playerId ?? award.teamId;
}

/** La cifra, a la española: «18,4»; la del entrenador, en puestos con su signo. */
function valueOf(award: SeasonAwardEntry): string {
  if (award.type === 'coach_of_year') {
    return award.value > 0 ? `+${award.value}` : String(award.value);
  }
  return formatPoints(award.value);
}

function noteOf(award: SeasonAwardEntry): string {
  return award.type === 'coach_of_year' ? `${award.teamName} · sobre lo previsto` : award.teamName;
}
</script>

<template>
  <div class="flex min-h-0 flex-col gap-4" data-testid="gala-awards">
    <AppEmpty v-if="awards.length === 0">
      Sin premios: la liga se jugó sin actas que contar.
    </AppEmpty>
    <template v-else>
      <AppPanel title="Premios de la temporada" :hint="hint">
        <ul class="grid gap-[3px]" :class="compact ? 'grid-cols-3' : 'grid-cols-2'">
          <li v-for="award in individual" :key="award.type">
            <LeaderCard
              :label="SEASON_AWARD_LABEL[award.type]"
              :name="nameOf(award)"
              :seed="seedOf(award)"
              :value="valueOf(award)"
              :value-label="SEASON_AWARD_VALUE_LABEL[award.type]"
              :nationality="award.nationality"
              :note="noteOf(award)"
              :avatar-kind="award.type === 'coach_of_year' ? 'coach' : 'player'"
              :mine="award.isManaged"
              name-mode="initial"
            />
          </li>
        </ul>
      </AppPanel>

      <AppPanel v-if="quintet.length > 0" title="Quinteto ideal">
        <ol class="grid grid-cols-5 gap-[3px]" data-testid="gala-quintet">
          <li
            v-for="award in quintet"
            :key="award.slot"
            class="flex min-w-0 flex-col gap-0.5 px-2 py-1.5 text-sm"
            :class="award.isManaged ? 'bg-tv-select' : 'bg-tv-cell'"
          >
            <span class="flex items-center gap-2">
              <PositionChip v-if="award.position" :position="award.position" size="md" />
              <span v-if="award.position" class="sr-only">
                {{ POSITION_LABELS[award.position] }}
              </span>
              <AppAvatar kind="player" :seed="seedOf(award)" :name="nameOf(award)" :size="32" />
              <span class="figure ml-auto bg-tv-box px-2 font-bold">{{ valueOf(award) }}</span>
            </span>
            <PlayerName
              :name="nameOf(award)"
              mode="initial"
              class="max-w-full truncate font-bold"
            />
            <span class="max-w-full truncate text-xs text-tv-muted">{{ award.teamName }}</span>
          </li>
        </ol>
      </AppPanel>
    </template>
  </div>
</template>
