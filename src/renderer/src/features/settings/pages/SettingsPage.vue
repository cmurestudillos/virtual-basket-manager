<script setup lang="ts">
/**
 * Ajustes de la aplicación.
 *
 * Dos cosas se ajustan y las dos dicen cuándo se notan, porque no se notan igual:
 * la resolución cambia la ventana en el momento, y el reglamento sólo lo recibe
 * la próxima partida que se cree. Debajo van los créditos, que no son un ajuste
 * pero tienen que estar en algún sitio que se pueda encontrar: dos de los
 * estilos de avatar piden atribución.
 */
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import {
  DEFAULT_RULESET_MODE,
  RULESET_MODE_HINTS,
  RULESET_MODE_LABELS,
  RULESET_MODES,
  isRulesetMode,
  type RulesetMode
} from '@shared/domain/ruleset-mode';
import {
  DEFAULT_WINDOW_RESOLUTION,
  WINDOW_RESOLUTIONS,
  type WindowResolution
} from '@shared/domain/window-resolution';
import {
  AVATAR_CREDITS,
  AppAvatar,
  AppButton,
  AppFlag,
  AppPageHeader,
  AppPanel
} from '@renderer/shared/ui';
import { useUpdates } from '@renderer/features/updates/useUpdates';
import { useGameStateStore } from '@renderer/shared/game-state.store';
import { NATION_NAMES } from '@shared/domain/national-teams';

const router = useRouter();
const version = __APP_VERSION__;

const resolution = ref<WindowResolution>(DEFAULT_WINDOW_RESOLUTION);
const ruleset = ref<RulesetMode>(DEFAULT_RULESET_MODE);
const saved = ref<string | null>(null);
const updates = useUpdates();
const gameState = useGameStateStore();
/** Con una partida cargada, el entrenador también se ajusta aquí. */
const nationalityOptions = Object.entries(NATION_NAMES).sort((a, b) =>
  a[1].localeCompare(b[1], 'es')
);

async function chooseNationality(code: string): Promise<void> {
  await window.api.gameState.setManagerNationality(code);
  await gameState.refresh();
  saved.value = `Tu entrenador ahora es de ${NATION_NAMES[code] ?? code}.`;
}

/** Lo que se lee del estado de la actualización, en una frase. */
function updateText(): string {
  const state = updates.view.value?.state;
  if (!state) return '';
  switch (state.status) {
    case 'unsupported':
      return state.reason;
    case 'idle':
      return 'Todavía no se ha comprobado en esta sesión.';
    case 'checking':
      return 'Comprobando…';
    case 'up-to-date':
      return 'Tienes la última versión.';
    case 'available':
      return `Hay una versión nueva, la ${state.version}. Descargando…`;
    case 'downloading':
      return `Descargando la versión ${state.version}: ${state.percent} %`;
    case 'downloaded':
      return `La versión ${state.version} está lista. Se instala al reiniciar.`;
    case 'error':
      return state.message;
  }
}

onMounted(async () => {
  const storedResolution = await window.api.settings.get('resolution');
  if ((WINDOW_RESOLUTIONS as readonly string[]).includes(storedResolution ?? '')) {
    resolution.value = storedResolution as WindowResolution;
  }
  const storedRuleset = await window.api.settings.get('ruleset');
  if (isRulesetMode(storedRuleset)) {
    ruleset.value = storedRuleset;
  }
});

async function chooseResolution(value: WindowResolution): Promise<void> {
  resolution.value = value;
  await window.api.settings.set('resolution', value);
  saved.value = `Ventana a ${value.replace('x', ' × ')}.`;
}

async function chooseRuleset(value: RulesetMode): Promise<void> {
  ruleset.value = value;
  await window.api.settings.set('ruleset', value);
  saved.value = `Las partidas nuevas se jugarán con «${RULESET_MODE_LABELS[value]}».`;
}

function back(): void {
  if (window.history.length > 1) {
    router.back();
  } else {
    void router.push({ name: 'main-menu' });
  }
}
</script>

<template>
  <div class="mx-auto flex h-screen max-w-3xl flex-col gap-5 overflow-auto p-8">
    <header class="flex items-center justify-between">
      <AppPageHeader title="Ajustes" />
      <button type="button" class="text-sm text-court-300 hover:text-court-100" @click="back">
        Volver
      </button>
    </header>

    <p
      v-if="saved"
      class="rounded border border-good-500 px-3 py-2 text-sm text-good-400"
      role="status"
    >
      {{ saved }}
    </p>

    <AppPanel v-if="gameState.state" title="Tu entrenador" hint="en la partida cargada">
      <label class="flex items-center gap-3 text-sm" for="manager-nationality-setting">
        <span class="text-court-300">Nacionalidad</span>
        <AppFlag :code="gameState.state.managerNationality" size="md" />
        <select
          id="manager-nationality-setting"
          :value="gameState.state.managerNationality"
          class="rounded border border-court-600 bg-court-900 px-3 py-2"
          @change="chooseNationality(($event.target as HTMLSelectElement).value)"
        >
          <option v-for="[code, name] in nationalityOptions" :key="code" :value="code">
            {{ name }}
          </option>
        </select>
      </label>
    </AppPanel>

    <AppPanel title="Resolución" hint="se aplica al momento">
      <div class="grid grid-cols-2 gap-2 sm:grid-cols-4" role="radiogroup" aria-label="Resolución">
        <button
          v-for="option in WINDOW_RESOLUTIONS"
          :id="`resolution-${option}`"
          :key="option"
          type="button"
          role="radio"
          :aria-checked="resolution === option"
          class="rounded border px-3 py-2 text-sm tabular-nums transition"
          :class="
            resolution === option
              ? 'border-ball-500 bg-court-800 text-court-100'
              : 'border-court-700 text-court-300 hover:border-court-600'
          "
          @click="chooseResolution(option)"
        >
          {{ option.replace('x', ' × ') }}
        </button>
      </div>
      <p class="mt-2 text-xs text-court-600">
        Con la ventana maximizada no cambia de tamaño; se aplica al restaurarla o en el próximo
        arranque.
      </p>
    </AppPanel>

    <AppPanel title="Reglamento" hint="para las partidas nuevas">
      <div class="flex flex-col gap-2" role="radiogroup" aria-label="Reglamento">
        <button
          v-for="option in RULESET_MODES"
          :id="`ruleset-${option}`"
          :key="option"
          type="button"
          role="radio"
          :aria-checked="ruleset === option"
          class="flex flex-col rounded border px-3 py-2 text-left transition"
          :class="
            ruleset === option
              ? 'border-ball-500 bg-court-800'
              : 'border-court-700 hover:border-court-600'
          "
          @click="chooseRuleset(option)"
        >
          <span class="text-sm" :class="ruleset === option ? 'text-court-100' : 'text-court-300'">
            {{ RULESET_MODE_LABELS[option] }}
          </span>
          <span class="text-xs text-court-600">{{ RULESET_MODE_HINTS[option] }}</span>
        </button>
      </div>
      <p class="mt-2 text-xs text-court-600">
        Las partidas empezadas siguen con el suyo: cambiar la duración de los cuartos a mitad de
        temporada mezclaría estadísticas de dos reglamentos.
      </p>
    </AppPanel>

    <AppPanel
      title="Actualizaciones"
      :hint="`versión ${updates.view.value?.currentVersion ?? version}`"
    >
      <div class="flex flex-wrap items-center justify-between gap-3">
        <p
          id="updates-status"
          class="text-sm"
          :class="updates.view.value?.state.status === 'error' ? 'text-warn-400' : 'text-court-300'"
        >
          {{ updateText() }}
        </p>
        <span class="flex gap-2">
          <AppButton
            v-if="updates.view.value?.state.status === 'downloaded'"
            variant="primary"
            @click="updates.install"
          >
            Reiniciar e instalar
          </AppButton>
          <AppButton
            v-else-if="updates.view.value?.state.status !== 'unsupported'"
            variant="secondary"
            :disabled="
              updates.busy.value ||
              updates.view.value?.state.status === 'checking' ||
              updates.view.value?.state.status === 'downloading'
            "
            @click="updates.check"
          >
            Buscar actualizaciones
          </AppButton>
        </span>
      </div>
      <p class="mt-2 text-xs text-court-600">
        Guarda antes de reiniciar: un partido a medio jugar se repite desde el principio.
      </p>
    </AppPanel>

    <AppPanel title="Créditos">
      <ul class="flex flex-col gap-3 text-sm">
        <li v-for="credit in AVATAR_CREDITS" :key="credit.kind" class="flex items-center gap-3">
          <AppAvatar :kind="credit.kind" :seed="`creditos-${credit.kind}`" :size="36" />
          <span class="flex flex-col">
            <span>
              {{ credit.usedFor }}: <span class="text-court-100">{{ credit.title }}</span
              >, de
              {{ credit.creator }}
            </span>
            <span class="text-xs text-court-300">
              {{ credit.license }} · {{ credit.licenseUrl }}
            </span>
          </span>
        </li>
        <li class="text-xs text-court-300">
          Avatares generados con DiceBear, banderas de flag-icons y pista 3D con three.js (las tres
          con licencia MIT). Tipografía Signika, de The Signika Project Authors (SIL Open Font
          License 1.1). Clubes, jugadores y competiciones son inventados.
        </li>
      </ul>
    </AppPanel>

    <p class="text-center text-xs text-court-600">Triple Manager v{{ version }}</p>
  </div>
</template>
