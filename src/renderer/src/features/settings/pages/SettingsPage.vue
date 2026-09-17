<script setup lang="ts">
/**
 * Ajustes de la aplicación.
 *
 * Dos cosas se ajustan y las dos dicen cuándo se notan, porque no se notan igual:
 * la resolución cambia la ventana en el momento, y el reglamento sólo lo recibe
 * la próxima partida que se cree. Al lado van los créditos, que no son un ajuste
 * pero tienen que estar en algún sitio que se pueda encontrar: dos de los
 * estilos de avatar piden atribución.
 *
 * Va fuera del marco del juego —se entra desde el menú y desde la partida— y
 * con la piel de IBM: barra morada arriba, paneles claros sobre el fondo liso y
 * la barra negra de abajo con «Volver» y la confirmación de lo que se acaba de
 * cambiar. IBM no tiene captura de sus ajustes; las opciones siguen las de su
 * asistente (130911): la elegida en azul.
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
  AppField,
  AppFlag,
  AppPanel,
  AppSelect,
  TONE_TEXT
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
const nationalityOptions = Object.entries(NATION_NAMES)
  .sort((a, b) => a[1].localeCompare(b[1], 'es'))
  .map(([code, name]) => ({ id: code, label: name }));

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
  <div class="flex h-screen flex-col bg-tv-canvas">
    <header
      class="flex h-16 shrink-0 flex-col justify-center bg-linear-to-r from-tv-chrome to-tv-chrome-2 px-6"
    >
      <h1 class="text-lg font-bold uppercase tracking-wide">Ajustes</h1>
      <p class="text-sm text-white/80">
        La ventana, el reglamento de las partidas nuevas y los créditos
      </p>
    </header>

    <main class="min-h-0 flex-1 overflow-auto p-4">
      <div class="mx-auto grid max-w-6xl grid-cols-2 items-start gap-3">
        <div class="flex flex-col gap-3">
          <AppPanel v-if="gameState.state" title="Tu entrenador" hint="en la partida cargada">
            <AppField label="Nacionalidad">
              <AppSelect
                id="manager-nationality-setting"
                :model-value="gameState.state.managerNationality ?? ''"
                :options="nationalityOptions"
                @update:model-value="chooseNationality"
              >
                <template #leading>
                  <AppFlag :code="gameState.state.managerNationality" size="md" />
                </template>
              </AppSelect>
            </AppField>
          </AppPanel>

          <AppPanel title="Resolución" hint="se aplica al momento">
            <div class="grid grid-cols-4 gap-[3px]" role="radiogroup" aria-label="Resolución">
              <button
                v-for="option in WINDOW_RESOLUTIONS"
                :id="`resolution-${option}`"
                :key="option"
                type="button"
                role="radio"
                :aria-checked="resolution === option"
                class="figure px-3 py-2 text-sm font-bold transition-colors"
                :class="
                  resolution === option
                    ? 'bg-tv-blue text-white'
                    : 'bg-tv-cell text-tv-ink hover:bg-tv-cell-strong'
                "
                @click="chooseResolution(option)"
              >
                {{ option.replace('x', ' × ') }}
              </button>
            </div>
            <p class="mt-2 text-xs text-tv-muted">
              Con la ventana maximizada no cambia de tamaño; se aplica al restaurarla o en el
              próximo arranque.
            </p>
          </AppPanel>

          <AppPanel title="Reglamento" hint="para las partidas nuevas">
            <div class="flex flex-col gap-[3px]" role="radiogroup" aria-label="Reglamento">
              <button
                v-for="option in RULESET_MODES"
                :id="`ruleset-${option}`"
                :key="option"
                type="button"
                role="radio"
                :aria-checked="ruleset === option"
                class="flex items-start gap-3 px-3 py-2 text-left text-tv-ink transition-colors"
                :class="ruleset === option ? 'bg-tv-select' : 'bg-tv-cell hover:bg-tv-cell-strong'"
                @click="chooseRuleset(option)"
              >
                <span
                  aria-hidden="true"
                  class="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 border-tv-blue bg-white"
                >
                  <span v-if="ruleset === option" class="h-2 w-2 rounded-full bg-tv-blue"></span>
                </span>
                <span class="flex flex-col">
                  <span class="text-sm font-bold">{{ RULESET_MODE_LABELS[option] }}</span>
                  <span class="text-xs text-tv-muted">{{ RULESET_MODE_HINTS[option] }}</span>
                </span>
              </button>
            </div>
            <p class="mt-2 text-xs text-tv-muted">
              Las partidas empezadas siguen con el suyo: cambiar la duración de los cuartos a mitad
              de temporada mezclaría estadísticas de dos reglamentos.
            </p>
          </AppPanel>
        </div>

        <div class="flex flex-col gap-3">
          <AppPanel
            title="Actualizaciones"
            :hint="`versión ${updates.view.value?.currentVersion ?? version}`"
          >
            <div class="flex flex-wrap items-center justify-between gap-3">
              <p
                id="updates-status"
                class="text-sm"
                :class="updates.view.value?.state.status === 'error' ? TONE_TEXT.warn : ''"
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
            <p class="mt-2 text-xs text-tv-muted">
              Guarda antes de reiniciar: un partido a medio jugar se repite desde el principio.
            </p>
          </AppPanel>

          <AppPanel title="Créditos" :hint="`Triple Manager v${version}`">
            <ul class="flex flex-col text-sm">
              <li
                v-for="credit in AVATAR_CREDITS"
                :key="credit.kind"
                class="flex items-center gap-3 px-3 py-2 odd:bg-tv-cell"
              >
                <AppAvatar :kind="credit.kind" :seed="`creditos-${credit.kind}`" :size="36" />
                <span class="flex min-w-0 flex-col">
                  <span>
                    {{ credit.usedFor }}: <span class="font-bold">{{ credit.title }}</span
                    >, de
                    {{ credit.creator }}
                  </span>
                  <span class="break-all text-xs text-tv-muted">
                    {{ credit.license }} · {{ credit.licenseUrl }}
                  </span>
                </span>
              </li>
              <li class="px-3 py-2 text-xs text-tv-muted odd:bg-tv-cell">
                Avatares generados con DiceBear, banderas de flag-icons y pista 3D con three.js (las
                tres con licencia MIT). Tipografía Signika, de The Signika Project Authors (SIL Open
                Font License 1.1). Clubes, jugadores y competiciones son inventados.
              </li>
            </ul>
          </AppPanel>
        </div>
      </div>
    </main>

    <footer
      class="flex h-[55px] shrink-0 items-center justify-between gap-4 border-t border-white/10 bg-tv-footer px-4"
    >
      <p v-if="saved" class="truncate text-sm text-white/80" role="status">{{ saved }}</p>
      <span v-else></span>
      <AppButton class="min-w-32" @click="back">Volver</AppButton>
    </footer>
  </div>
</template>
