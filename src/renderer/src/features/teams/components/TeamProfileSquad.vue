<script setup lang="ts">
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import type { TeamProfile, TeamProfilePlayer } from '@shared/contracts/teams.contract';
import { conditionLabel } from '@shared/domain/conditioning';
import { shirtNumbers } from '@shared/domain/court';
import { injuryLabel } from '@shared/domain/injuries';
import { nationName } from '@shared/domain/national-teams';
import { NO_SCOUT_ERROR } from '@shared/domain/staff';
import { toStars } from '@shared/domain/stars';
import { formatHeight, formatMoney } from '@renderer/shared/format';
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
 * La plantilla de un club, con la tabla de `SquadPage`: lo que sabe cualquiera
 * —puesto, edad, nacionalidad, altura, sueldo y contrato, forma y lesiones— y lo
 * que cuenta el ojeador —media y potencial, con su margen—. Sin ojeador, «?».
 *
 * La moral sólo llega de los tuyos, así que su columna sólo sale en tu club. La
 * fila lleva a la ficha del jugador.
 */

const props = defineProps<{ profile: TeamProfile }>();
const router = useRouter();

const numbers = computed(() => shirtNumbers(props.profile.squad.map((player) => player.id)));
const blind = computed(() => props.profile.uncertainty >= NO_SCOUT_ERROR);
const showMorale = computed(() => props.profile.squad.some((player) => player.morale !== null));

function openPlayer(player: TeamProfilePlayer): void {
  void router.push({ name: 'player', params: { playerId: player.id } });
}
</script>

<template>
  <AppPanel
    :hint="`Jugadores: ${profile.squad.length}`"
    :title="profile.isManaged ? 'Plantilla' : 'Plantilla vista por tu ojeador'"
    scroll
    flush
    class="min-h-0 flex-1"
  >
    <template v-if="profile.uncertainty > 0" #actions>
      <span class="text-xs font-semibold text-white/75">
        {{
          blind ? 'Sin ojeador: ni la media se sabe' : `Margen del ojeador: ±${profile.uncertainty}`
        }}
      </span>
    </template>
    <AppEmpty v-if="profile.squad.length === 0">Este club no tiene a nadie en plantilla.</AppEmpty>
    <table v-else class="data-table">
      <thead>
        <tr>
          <th class="numeric">Nº</th>
          <th>Jugador</th>
          <th>Pos</th>
          <th class="numeric">Edad</th>
          <th class="numeric">Altura</th>
          <th v-if="showMorale">Moral</th>
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
          v-for="player in profile.squad"
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
          <td><PositionChip :position="player.position" /></td>
          <td class="numeric">{{ player.age }}</td>
          <td class="numeric">{{ formatHeight(player.heightCm) }}</td>
          <td v-if="showMorale">
            <MoodIcon v-if="player.morale !== null" :value="player.morale" />
          </td>
          <td
            class="numeric"
            :class="bandForValue(player.condition) === 'low' ? `${TONE_TEXT.bad} font-bold` : ''"
            :title="conditionLabel(player.condition)"
          >
            {{ player.condition }}
          </td>
          <td class="numeric is-key py-0.5">
            <span class="inline-flex items-center gap-1">
              <AppRing :value="player.overall" :unknown="blind" :size="28" />
              <span v-if="player.uncertainty > 0 && !blind" class="text-xs text-tv-muted">
                ±{{ player.uncertainty }}
              </span>
            </span>
          </td>
          <td class="py-0.5">
            <span v-if="blind" class="text-tv-muted">?</span>
            <AppStars v-else :value="toStars(player.potential)" label="Potencial" :size="12" />
          </td>
          <td class="numeric">{{ formatMoney(player.wageCents) }}</td>
          <td
            class="numeric"
            :class="player.contractYearsLeft <= 1 ? `${TONE_TEXT.bad} font-bold` : ''"
          >
            {{ player.contractYearsLeft }}
          </td>
          <td>
            <span
              v-if="player.injuryDaysLeft > 0"
              class="block max-w-40 truncate"
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
