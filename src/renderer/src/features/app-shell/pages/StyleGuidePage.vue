<script setup lang="ts">
import { ref } from 'vue';
import { matchKits } from '@shared/domain/court';
import type { Position } from '@shared/domain/positions';
import { MORALE_LEVELS } from '@shared/domain/morale';
import { COMPETITION_KINDS, COMPETITION_KIND_LABEL } from '@shared/domain/competition-kind';
import {
  AppAvatar,
  AppBackdrop,
  AppBadge,
  AppButton,
  AppCheckbox,
  AppDrawer,
  AppEmpty,
  AppField,
  AppFlag,
  AppInput,
  AppMeter,
  AppModal,
  AppPageHeader,
  AppPager,
  AppPanel,
  AppRing,
  AppScale,
  AppSectionTitle,
  AppSegmented,
  AppSelect,
  AppStars,
  AppStat,
  AppStepper,
  AppTabs,
  AttributeGrid,
  COMPETITION_BAND,
  COMPETITION_FILL,
  FixtureCard,
  KeyValueList,
  LeaderCard,
  MoodIcon,
  PlayerName,
  PositionChip,
  RATING_BANDS,
  RATING_BAND_FLOOR,
  RATING_BAND_LABEL,
  RATING_CHIP,
  ResultBlock,
  TONE_TEXT,
  type AttributeItem,
  type Tone
} from '@renderer/shared/ui';

/**
 * La guía de estilo: todas las piezas del kit, en un sitio, con sus variantes y
 * con datos de un mundo inventado.
 *
 * No está enlazada desde el juego —al jugador no le sirve de nada— pero sí es
 * una ruta de verdad, y el arnés le hace una captura en cada pasada. Eso es lo
 * que evita que el kit se pudra: si alguien rompe un botón, se ve aquí antes
 * que en la pantalla donde esté escondido. Y es la referencia de la piel de IBM
 * para migrar cada pantalla: lo que aquí se ve bien es lo que se copia.
 *
 * Se abre con `#/estilo`.
 */

const TONES: Tone[] = ['neutral', 'accent', 'good', 'warn', 'bad'];
const POSITIONS: Position[] = ['PG', 'SG', 'SF', 'PF', 'C'];

const section = ref('clasificacion');
const league = ref('primera');
const defense = ref('individual');
const competition = ref('liga');
const round = ref(11);
const aggressiveness = ref(6);
const modalOpen = ref(false);
const drawerOpen = ref(false);
const search = ref('');
const managerName = ref('Teo Arraiz');
const maxAge = ref<number | null>(24);
const freeAgents = ref(true);
const dismissal = ref(false);
const minutes = ref(28);
const price = ref(12);

/** Las equipaciones salen del id del club, igual que en la partida. */
const OLMO = { name: 'Club Puerto Olmo', kit: matchKits('guia-puerto-olmo', '').home };
const RIBERAS = { name: 'CB Riberas', kit: matchKits('guia-riberas', '').home };
const SIERRA = { name: 'Atlético Sierra Alta', kit: matchKits('guia-sierra-alta', '').home };

const STANDINGS = [
  { pos: 1, team: 'Basket Valdeorán', played: 13, won: 12, diff: '+151', zone: 'zone-up' },
  { pos: 2, team: 'Atlético Sierra Alta', played: 13, won: 11, diff: '+96', zone: 'zone-up' },
  { pos: 3, team: 'Club Puerto Olmo', played: 13, won: 9, diff: '+40', zone: '', mine: true },
  { pos: 4, team: 'Unión Campo Frío', played: 13, won: 6, diff: '-12', zone: '' },
  { pos: 17, team: 'CB Riberas', played: 13, won: 2, diff: '-167', zone: 'zone-down' },
  { pos: 18, team: 'CB Nueva Estrada', played: 13, won: 1, diff: '-204', zone: 'zone-down' }
];

const SQUAD: {
  number: number;
  name: string;
  position: Position;
  morale: number;
  fitness: number;
  overall: number;
}[] = [
  { number: 4, name: 'Teo Arraiz', position: 'PG', morale: 90, fitness: 97, overall: 82 },
  { number: 9, name: 'Lukas Venkel', position: 'SG', morale: 70, fitness: 88, overall: 74 },
  { number: 13, name: 'Ramiro Pazos', position: 'SF', morale: 50, fitness: 64, overall: 67 },
  { number: 21, name: 'Nil Salaberri', position: 'PF', morale: 30, fitness: 55, overall: 58 },
  { number: 33, name: 'Bruno Estrada Luz', position: 'C', morale: 12, fitness: 71, overall: 79 }
];

const PLAYER_FACTS = [
  { id: 'team', label: 'Equipo', value: 'Club Puerto Olmo' },
  { id: 'position', label: 'Puesto' },
  { id: 'height', label: 'Altura / envergadura', value: '2,06 m / 2,14 m' },
  { id: 'age', label: 'Edad', value: 27 },
  { id: 'nationality', label: 'Nacionalidad' },
  { id: 'contract', label: 'Contrato', value: 'Hasta 2028 · 412.000 € al año' }
];

const ATTRIBUTES: AttributeItem[] = [
  { id: 'iq', label: 'Visión de juego', value: 76 },
  { id: 'leadership', label: 'Liderazgo', value: 83 },
  { id: 'experience', label: 'Experiencia', value: 39 },
  { id: 'speed', label: 'Velocidad', value: 67 },
  { id: 'strength', label: 'Fuerza', value: 77, strong: true },
  { id: 'stamina', label: 'Resistencia', value: 85 },
  { id: 'defense', label: 'Defensa', value: 71 },
  { id: 'rebound', label: 'Rebote', value: 88 },
  { id: 'blocks', label: 'Tapones', value: 62 },
  { id: 'two', label: 'Tiro de 2', value: 87 },
  { id: 'three', label: 'Tiro de 3', value: 60 },
  { id: 'free', label: 'Tiros libres', value: 77 }
];

const COMPETITIONS = [
  { id: 'liga', label: 'Liga Nacional' },
  { id: 'plata', label: 'Liga Plata' },
  { id: 'copa', label: 'Copa del Rey Olmo' }
];
</script>

<template>
  <div class="flex h-screen flex-col gap-4 overflow-auto bg-tv-950 p-6">
    <AppPageHeader title="Guía de estilo">
      La piel de IBM 23: marco oscuro, paneles claros
      <template #actions>
        <AppButton variant="primary" arrow="single">Continuar</AppButton>
      </template>
    </AppPageHeader>

    <AppTabs
      v-model="section"
      :options="[
        { id: 'clasificacion', label: 'Clasificación' },
        { id: 'resultados', label: 'Resultados' },
        { id: 'copa', label: 'Copa' },
        { id: 'estadisticas', label: 'Estadísticas' }
      ]"
    />

    <div class="grid grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] gap-4">
      <AppPanel title="Clasificación" hint=".data-table" flush>
        <template #actions>
          <AppPager v-model="round" :max="34" label="Jornada">
            <template #default="{ value }">Jornada {{ value }}</template>
          </AppPager>
        </template>
        <table class="data-table">
          <thead>
            <tr>
              <th class="numeric">Pos</th>
              <th>Equipo</th>
              <th class="numeric">PJ</th>
              <th class="numeric">PG</th>
              <th class="numeric">Dif</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in STANDINGS" :key="row.pos" :class="row.mine ? 'is-mine' : ''">
              <td class="numeric" :class="row.zone">{{ row.pos }}</td>
              <td>{{ row.team }}</td>
              <td class="numeric">{{ row.played }}</td>
              <td class="numeric is-key font-bold">{{ row.won }}</td>
              <td
                class="numeric"
                :class="row.diff.startsWith('+') ? TONE_TEXT.good : TONE_TEXT.bad"
              >
                {{ row.diff }}
              </td>
            </tr>
          </tbody>
        </table>
      </AppPanel>

      <AppPanel title="La escala de 0 a 100" hint="4 tramos">
        <div class="flex flex-col gap-3">
          <div class="flex justify-around">
            <AppRing
              v-for="band in RATING_BANDS"
              :key="band"
              :value="RATING_BAND_FLOOR[band] + (band === 'low' ? 41 : 4)"
              :label="RATING_BAND_LABEL[band]"
              :size="64"
            />
            <AppRing unknown label="Sin ojear" :size="64" />
          </div>
          <AppMeter :value="92" label="Forma" />
          <AppMeter :value="74" label="Moral" />
          <AppMeter :value="63" label="Confianza" />
          <AppMeter :value="38" label="Afición" />
          <AppMeter :value="60" tone="accent" label="Con tono" />
          <p class="flex flex-wrap gap-2 text-xs">
            <span
              v-for="band in RATING_BANDS"
              :key="band"
              class="figure px-2 py-0.5 font-bold"
              :class="RATING_CHIP[band]"
            >
              {{ RATING_BAND_LABEL[band] }}
            </span>
          </p>
        </div>
      </AppPanel>
    </div>

    <div class="grid grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] gap-4">
      <AppPanel title="Plantilla" hint="Jugadores: 5 / 17" flush>
        <table class="data-table">
          <thead>
            <tr>
              <th class="numeric">Nº</th>
              <th>Jugador</th>
              <th>Pos</th>
              <th>Moral</th>
              <th class="numeric">Forma</th>
              <th class="numeric">Med</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="(player, index) in SQUAD"
              :key="player.number"
              :class="index === 1 ? 'is-selected' : ''"
            >
              <td class="numeric">{{ player.number }}</td>
              <td>
                <span class="flex items-center gap-2">
                  <AppFlag code="ESP" />
                  <PlayerName :name="player.name" />
                </span>
              </td>
              <td><PositionChip :position="player.position" /></td>
              <td><MoodIcon :value="player.morale" /></td>
              <td class="numeric" :class="player.fitness < 60 ? TONE_TEXT.bad : ''">
                {{ player.fitness }}
              </td>
              <td class="numeric is-key py-0.5">
                <AppRing :value="player.overall" :size="28" />
              </td>
            </tr>
          </tbody>
        </table>
      </AppPanel>

      <AppPanel title="Botones">
        <div class="flex flex-col gap-3">
          <div class="flex flex-wrap items-center gap-2">
            <AppButton variant="primary">Principal</AppButton>
            <AppButton>Secundario</AppButton>
            <AppButton variant="ghost">Discreto</AppButton>
            <AppButton variant="danger">Despedir</AppButton>
          </div>
          <div class="flex flex-wrap items-center gap-2">
            <AppButton size="sm" variant="primary">Ver ficha</AppButton>
            <AppButton size="md" variant="primary" arrow="single">Jugar</AppButton>
            <AppButton size="md" variant="primary" arrow="double">Saltar cuarto</AppButton>
          </div>
          <div class="flex flex-wrap items-center gap-2">
            <AppButton size="lg" variant="primary" arrow="single">Continuar</AppButton>
            <AppButton variant="primary" disabled>Deshabilitado</AppButton>
            <AppButton variant="ghost" disabled>Discreto</AppButton>
          </div>
          <AppSectionTitle hint="subrótulo">Etiquetas</AppSectionTitle>
          <div class="flex flex-wrap items-center gap-2">
            <AppBadge v-for="tone in TONES" :key="tone" :tone="tone">{{ tone }}</AppBadge>
          </div>
          <p class="flex flex-wrap gap-3 text-sm font-semibold">
            <span v-for="tone in TONES" :key="tone" :class="TONE_TEXT[tone]">{{ tone }}</span>
          </p>
        </div>
      </AppPanel>
    </div>

    <div class="grid grid-cols-3 gap-4">
      <AppPanel title="Ficha">
        <div class="flex flex-col gap-3">
          <div class="flex items-center gap-3">
            <AppAvatar
              kind="player"
              seed="guia-bruno-estrada"
              name="Bruno Estrada Luz"
              :size="56"
            />
            <PlayerName name="Bruno Estrada Luz" mode="stacked" />
            <AppRing :value="79" label="Media" :size="56" class="ml-auto" />
          </div>
          <KeyValueList :items="PLAYER_FACTS">
            <template #value="{ item }">
              <PositionChip v-if="item.id === 'position'" position="C" />
              <template v-else-if="item.id === 'nationality'">
                España <AppFlag code="ESP" />
              </template>
              <template v-else>{{ item.value }}</template>
            </template>
          </KeyValueList>
        </div>
      </AppPanel>

      <AppPanel title="Nombres, puestos y moral">
        <div class="flex flex-col gap-3 text-sm">
          <p class="flex flex-col gap-1">
            <PlayerName name="Lukas Venkel" />
            <PlayerName name="Lukas Venkel" mode="initial" />
            <PlayerName first="Juan Carlos" last="Ibarra" />
          </p>
          <p class="flex gap-2">
            <PositionChip v-for="position in POSITIONS" :key="position" :position="position" />
            <PositionChip position="PF" size="md" />
          </p>
          <ul class="flex flex-col gap-1">
            <li v-for="level in MORALE_LEVELS" :key="level">
              <MoodIcon :level="level" labelled />
            </li>
          </ul>
        </div>
      </AppPanel>

      <AppPanel title="Cifras y estrellas">
        <div class="flex flex-col gap-3">
          <div class="grid grid-cols-2 gap-3">
            <AppStat label="Puntos totales">1.099</AppStat>
            <AppStat label="Caja" tone="bad" note="Nóminas: 1,3 M €">-240.000 €</AppStat>
            <AppStat label="Media puntos" size="md" boxed>84,5</AppStat>
            <AppStat label="Racha" size="md" boxed tone="good">+6</AppStat>
          </div>
          <div class="flex flex-col items-start gap-2">
            <AppStars :value="4.5" label="Pabellón" />
            <AppStars :value="2" label="Reputación" />
            <AppStars :value="0.5" label="Cantera" :size="18" />
          </div>
        </div>
      </AppPanel>
    </div>

    <AppPanel title="Atributos" hint="fuertes: 80 o más, o a mano">
      <AttributeGrid :items="ATTRIBUTES" />
    </AppPanel>

    <div class="grid grid-cols-3 gap-4">
      <AppPanel title="Controles">
        <div class="flex flex-col gap-4">
          <AppField label="Competición" hint="Selector negro: azul al pasar por encima.">
            <AppSelect v-model="competition" :options="COMPETITIONS">
              <template #leading><AppFlag code="ESP" /></template>
            </AppSelect>
          </AppField>
          <AppScale
            v-model="aggressiveness"
            label="Agresividad"
            :stops="['Prudente', 'Normal', 'Al límite']"
            hint="Más faltas a cambio de más robos."
          />
          <div class="flex flex-col gap-2">
            <AppSegmented
              v-model="defense"
              :options="[
                { id: 'individual', label: '1 vs 1' },
                { id: 'zonas', label: 'Zonas' }
              ]"
            />
            <AppTabs
              v-model="league"
              variant="pills"
              :options="[
                { id: 'primera', label: 'Liga Nacional', hint: ' · juegas' },
                { id: 'plata', label: 'Liga Plata' },
                { id: 'bronce', label: 'Liga Bronce' }
              ]"
            />
          </div>
        </div>
      </AppPanel>

      <AppPanel title="Diálogos">
        <div class="flex flex-col items-start gap-3">
          <p class="text-sm">
            El modal para la pantalla; el cajón se abre al lado y deja ver lo de debajo.
          </p>
          <AppButton variant="primary" @click="modalOpen = true">Abrir modal</AppButton>
          <AppButton @click="drawerOpen = true">Abrir cajón</AppButton>
        </div>
      </AppPanel>

      <AppPanel title="Estado vacío">
        <AppEmpty>
          La Copa se sortea al cerrar la primera vuelta: la juegan los ocho primeros de la
          clasificación, a partido único y en sede neutral.
        </AppEmpty>
      </AppPanel>
    </div>

    <div class="grid grid-cols-3 gap-4">
      <AppPanel title="Campos">
        <div class="flex flex-col gap-4">
          <AppField label="Nombre" hint="AppInput: losa negra, ejemplo en cursiva.">
            <AppInput v-model="managerName" placeholder="Introduce tu nombre" />
          </AppField>
          <div class="flex flex-wrap items-center gap-3">
            <AppInput v-model="search" type="search" dense label="Buscar" placeholder="Buscar…" />
            <AppInput v-model="maxAge" type="number" dense label="Edad máxima" class="w-16" />
          </div>
          <div class="flex flex-col gap-2">
            <AppCheckbox v-model="freeAgents">Sólo agentes libres</AppCheckbox>
            <AppCheckbox v-model="dismissal">El consejo puede despedirte</AppCheckbox>
            <AppCheckbox :model-value="true" disabled>Tu país, siempre</AppCheckbox>
          </div>
          <div class="flex flex-wrap items-center gap-4 text-sm">
            <AppStepper v-model="minutes" :min="0" :max="40" label="Minutos" />
            <AppStepper v-model="price" :min="5" :max="12" label="Precio" />
          </div>
        </div>
      </AppPanel>

      <AppPanel title="Partidos" hint="FixtureCard">
        <div class="flex flex-col gap-3">
          <FixtureCard
            featured
            :home="OLMO"
            :away="SIERRA"
            date="5 dic"
            venue="home"
            footer="Liga Nacional · Jornada 12"
            detail="Domingo, 5 de diciembre"
          />
          <div class="grid grid-cols-2 gap-3">
            <FixtureCard
              :home="{ ...RIBERAS, score: 78 }"
              :away="{ ...OLMO, score: 84 }"
              date="28 nov"
              venue="away"
              footer="Jornada 11"
            />
            <FixtureCard :home="OLMO" :away="RIBERAS" date="12 dic" venue="home" footer="Copa" />
          </div>
        </div>
      </AppPanel>

      <AppPanel title="Líderes" hint="LeaderCard">
        <div class="flex flex-col gap-[3px]">
          <LeaderCard
            label="Puntos"
            name="Teo Arraiz"
            seed="guia-teo-arraiz"
            value="21,4"
            nationality="ESP"
            note="Partidos jugados: 11"
          />
          <LeaderCard
            label="Rebotes"
            name="Bruno Estrada Luz"
            seed="guia-bruno-estrada"
            value="9,8"
            nationality="ESP"
            note="Partidos jugados: 10"
            :rank="1"
          />
          <LeaderCard
            label="Asistencias"
            name="Lukas Venkel"
            seed="guia-lukas-venkel"
            value="6,1"
            :rank="2"
            name-mode="initial"
          />
        </div>
      </AppPanel>
    </div>

    <div class="grid grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] gap-4">
      <AppPanel title="Colores por competición" hint="competitionKind()">
        <ul class="grid grid-cols-5 gap-[3px]">
          <li v-for="kind in COMPETITION_KINDS" :key="kind" class="flex flex-col">
            <span
              class="px-2 py-1 text-center text-xs font-bold uppercase tracking-wide"
              :class="COMPETITION_BAND[kind]"
            >
              {{ COMPETITION_KIND_LABEL[kind] }}
            </span>
            <span class="bg-tv-cell px-2 py-1 text-center text-xs text-tv-muted">
              tv-comp-{{ kind }}
            </span>
          </li>
        </ul>
        <p class="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs">
          <span v-for="kind in COMPETITION_KINDS" :key="kind" class="flex items-center gap-1.5">
            <span aria-hidden="true" class="h-3 w-3" :class="COMPETITION_FILL[kind]"></span>
            {{ COMPETITION_KIND_LABEL[kind] }}
          </span>
        </p>
      </AppPanel>

      <AppPanel title="Resultados" hint="ResultBlock">
        <div class="flex flex-col gap-3 text-tv-ink">
          <div class="flex flex-wrap items-center gap-4">
            <ResultBlock won :score="[82, 71]" />
            <ResultBlock :won="false" :score="[69, 77]" />
            <ResultBlock won />
          </div>
          <div class="flex flex-wrap items-end gap-4">
            <ResultBlock won size="sm" :score="[52, 57]" />
            <ResultBlock :won="false" size="sm" :score="[98, 101]" />
            <ResultBlock won size="sm" placement="below" :score="[74, 71]" />
            <ResultBlock :won="false" placement="below" :score="[54, 61]" />
          </div>
          <p class="flex gap-[3px]">
            <ResultBlock
              v-for="(won, index) in [true, true, false, true, false]"
              :key="index"
              :won="won"
              size="sm"
            />
          </p>
        </div>
      </AppPanel>
    </div>

    <div class="h-56 shrink-0 overflow-hidden">
      <AppBackdrop class="h-full">
        <div class="flex h-56 items-center justify-center">
          <p class="text-xl font-bold uppercase tracking-wide">
            Fondo con franjas: menú, asistente y pantallas vacías
          </p>
        </div>
      </AppBackdrop>
    </div>

    <AppModal :open="modalOpen" title="Cargar partida" @close="modalOpen = false">
      <table class="data-table">
        <tbody>
          <tr class="is-selected">
            <td>Temporada 2031 · Club Puerto Olmo</td>
            <td class="numeric">Jornada 11</td>
          </tr>
          <tr>
            <td>Carrera · CB Riberas</td>
            <td class="numeric">Jornada 3</td>
          </tr>
        </tbody>
      </table>
      <template #actions>
        <AppButton variant="primary" class="min-w-40" @click="modalOpen = false">Cargar</AppButton>
        <AppButton variant="danger" class="min-w-40" @click="modalOpen = false">Borrar</AppButton>
      </template>
    </AppModal>

    <AppDrawer v-if="drawerOpen" title="Sustituciones" @close="drawerOpen = false">
      <AppSectionTitle>En pista</AppSectionTitle>
      <AppEmpty>Los cambios se hacen jugando el cuarto en directo.</AppEmpty>
    </AppDrawer>
  </div>
</template>
