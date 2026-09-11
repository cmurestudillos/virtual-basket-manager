<script setup lang="ts">
import { ref } from 'vue';
import {
  AppBadge,
  AppButton,
  AppEmpty,
  AppField,
  AppMeter,
  AppPageHeader,
  AppPanel,
  AppSectionTitle,
  AppTabs,
  TONE_TEXT,
  type Tone
} from '@renderer/shared/ui';

/**
 * La guía de estilo: todas las piezas del kit, en un sitio, con sus variantes.
 *
 * No está enlazada desde el juego —al jugador no le sirve de nada— pero sí es
 * una ruta de verdad, y el arnés le hace una captura en cada pasada. Eso es lo
 * que evita que el kit se pudra: si alguien rompe un botón, se ve aquí antes
 * que en la pantalla donde esté escondido.
 *
 * Se abre con `#/estilo`.
 */

const TONES: Tone[] = ['neutral', 'accent', 'good', 'warn', 'bad'];
const tab = ref('primera');
const pill = ref('euroliga');
const texto = ref('Carlos');
</script>

<template>
  <div class="flex h-screen flex-col gap-6 overflow-auto p-8">
    <AppPageHeader title="Guía de estilo">
      <span class="text-sm text-court-300">Las piezas con las que se montan las pantallas</span>
    </AppPageHeader>

    <AppPanel title="Tonos" hint="qué significa cada color">
      <div class="flex flex-col gap-2">
        <p class="text-sm text-court-300">
          Un tono dice lo que <em>significa</em> un dato, no de qué color se pinta. Los componentes
          traducen tono a color en un único sitio.
        </p>
        <ul class="flex flex-wrap gap-4 text-sm">
          <li v-for="tone in TONES" :key="tone" :class="TONE_TEXT[tone]">{{ tone }}</li>
        </ul>
      </div>
    </AppPanel>

    <AppPanel title="Botones">
      <div class="flex flex-col gap-4">
        <div class="flex flex-wrap items-center gap-3">
          <AppButton variant="primary">Principal</AppButton>
          <AppButton>Secundario</AppButton>
          <AppButton variant="ghost">Discreto</AppButton>
          <AppButton variant="danger">Destructivo</AppButton>
        </div>
        <div class="flex flex-wrap items-center gap-3">
          <AppButton size="sm">Pequeño</AppButton>
          <AppButton size="md">Normal</AppButton>
          <AppButton size="lg" variant="primary">Grande</AppButton>
        </div>
        <div class="flex flex-wrap items-center gap-3">
          <AppButton variant="primary" disabled>Deshabilitado</AppButton>
          <AppButton disabled>Deshabilitado</AppButton>
        </div>
      </div>
    </AppPanel>

    <AppPanel title="Pestañas">
      <div class="flex flex-col gap-6">
        <div class="flex flex-col gap-2">
          <AppSectionTitle hint="dentro de una pantalla">Subrayadas</AppSectionTitle>
          <AppTabs
            v-model="tab"
            :options="[
              { id: 'primera', label: 'Clasificación' },
              { id: 'segunda', label: 'Calendario' },
              { id: 'tercera', label: 'Copa' }
            ]"
          />
        </div>

        <div class="flex flex-col gap-2">
          <AppSectionTitle hint="elegir entre iguales">Pastillas</AppSectionTitle>
          <AppTabs
            v-model="pill"
            variant="pills"
            :options="[
              { id: 'euroliga', label: 'Euroliga', hint: ' · juegas' },
              { id: 'eurocup', label: 'Eurocup' },
              { id: 'europe', label: 'Europe League' }
            ]"
          />
        </div>
      </div>
    </AppPanel>

    <div class="grid gap-6 md:grid-cols-2">
      <AppPanel title="Medidores" hint="de 0 a 100, más es mejor">
        <div class="flex flex-col gap-3">
          <AppMeter :value="88" label="Forma" />
          <AppMeter :value="55" label="Moral" />
          <AppMeter :value="21" label="Confianza" />
          <AppMeter :value="60" :max="100" tone="accent" label="Fijo" />
        </div>
      </AppPanel>

      <AppPanel title="Etiquetas">
        <div class="flex flex-wrap gap-2">
          <AppBadge v-for="tone in TONES" :key="tone" :tone="tone">{{ tone }}</AppBadge>
        </div>
      </AppPanel>
    </div>

    <div class="grid gap-6 md:grid-cols-2">
      <AppPanel title="Campos">
        <div class="flex flex-col gap-4">
          <AppField label="Tu nombre" hint="Es el que verá el consejo en los comunicados.">
            <input
              v-model="texto"
              type="text"
              class="rounded border border-court-600 bg-court-900 px-3 py-2"
            />
          </AppField>
          <AppField label="Precio de la entrada">
            <input type="range" min="5" max="60" value="20" class="w-full accent-ball-500" />
          </AppField>
        </div>
      </AppPanel>

      <AppPanel title="Estado vacío">
        <AppEmpty>
          La Copa se sortea al cerrar la primera vuelta: la juegan los ocho primeros de la
          clasificación, a partido único y en sede neutral.
        </AppEmpty>
      </AppPanel>
    </div>

    <AppPanel title="Tabla de datos" hint="la clase .data-table" flush scroll>
      <table class="data-table">
        <thead>
          <tr>
            <th class="numeric">#</th>
            <th>Equipo</th>
            <th class="numeric">J</th>
            <th class="numeric">G</th>
            <th class="numeric">Dif</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td class="numeric border-l-4 border-ball-500">1</td>
            <td>Basket Valdeorán</td>
            <td class="numeric">34</td>
            <td class="numeric font-semibold">25</td>
            <td class="numeric text-good-400">+151</td>
          </tr>
          <tr class="bg-court-800 text-ball-400">
            <td class="numeric border-l-4 border-ball-500">2</td>
            <td>CB Montenegro</td>
            <td class="numeric">34</td>
            <td class="numeric font-semibold">24</td>
            <td class="numeric text-good-400">+96</td>
          </tr>
          <tr>
            <td class="numeric border-l-4 border-bad-500">18</td>
            <td>CB Nueva Estrada</td>
            <td class="numeric">34</td>
            <td class="numeric font-semibold">6</td>
            <td class="numeric text-bad-400">-204</td>
          </tr>
        </tbody>
      </table>
    </AppPanel>
  </div>
</template>
