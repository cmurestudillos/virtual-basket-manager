<script setup lang="ts">
/**
 * El correo: lo que ha pasado desde la última vez.
 *
 * Como IBM (131054): la lista de correos a la izquierda y el que está abierto a
 * la derecha, los dos con el rótulo azul del correo. Abrir un aviso lo marca
 * como leído, y cada uno trae abajo su acceso directo a la pantalla donde se
 * decide —la lesión a la ficha, el contrato al mercado— porque un aviso que
 * sólo informa obliga a ir a buscar lo que ya se sabía. Las ruedas de prensa se
 * contestan aquí mismo, en el sitio del mensaje.
 */
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { matchKits } from '@shared/domain/court';
import type { InboxMessage, InboxView, PressConference } from '@shared/contracts/inbox.contract';
import { formatGameDate } from '@renderer/shared/format';
import { AppBadge, AppButton, AppEmpty, TONE_CHIP, TeamBadge } from '@renderer/shared/ui';
import { useGameStateStore } from '@renderer/shared/game-state.store';
import PageActions from '@renderer/features/app-shell/components/PageActions.vue';
import MailPanel from '../components/MailPanel.vue';
import MailRow from '../components/MailRow.vue';
import PressConferencePanel from '../components/PressConferencePanel.vue';
import { MAIL_SENDERS, shortcutLabel } from '../mail';
import { useInboxStore } from '../inbox.store';

const router = useRouter();
const store = useInboxStore();
const gameState = useGameStateStore();

const view = ref<InboxView | null>(null);
const press = ref<PressConference | null>(null);
const selectedId = ref<string | null>(null);

const unread = computed(() => view.value?.unread ?? 0);
const selected = computed(
  () => view.value?.messages.find((message) => message.id === selectedId.value) ?? null
);
/** El mensaje abierto, si no es una rueda de prensa: esa tiene su propio panel. */
const letter = computed(() => (press.value ? null : selected.value));
const club = computed(() => {
  const state = gameState.state;
  return state?.teamId ? { name: state.teamName, kit: matchKits(state.teamId, '').home } : null;
});

onMounted(load);

async function load(): Promise<void> {
  view.value = await window.api.inbox.get();
  store.unread = view.value.unread;
}

async function open(message: InboxMessage): Promise<void> {
  selectedId.value = message.id;
  if (message.pressConferenceId) {
    press.value = await window.api.inbox.getPress(message.pressConferenceId);
    return;
  }

  press.value = null;
  if (!message.read) {
    view.value = await window.api.inbox.markRead(message.id);
    store.unread = view.value.unread;
  }
}

async function goToShortcut(): Promise<void> {
  const route = letter.value?.route;
  if (route) {
    await router.push({ name: route.name, params: route.params ?? {} });
  }
}

async function markAll(): Promise<void> {
  view.value = await window.api.inbox.markAllRead();
  store.unread = 0;
}

async function onAnswered(conference: PressConference): Promise<void> {
  // «Ahora no» devuelve la misma rueda sin contestar: se cierra el panel y ya.
  press.value = conference.answeredTone ? conference : null;
  if (!press.value) {
    selectedId.value = null;
  }
  await load();
}
</script>

<template>
  <!--
    El panel abierto va **antes** que la lista en el documento y se coloca a la
    derecha con `order`: así lo primero que se lee de la pantalla, con un
    mensaje abierto, es ese mensaje —y es lo que lee el arnés—. Sin nada
    abierto, lo primero es la lista con su contador de no leídos.
  -->
  <div class="grid h-full grid-cols-[minmax(0,2fr)_minmax(0,3fr)] grid-rows-[minmax(0,1fr)] gap-4">
    <PressConferencePanel v-if="press" class="order-2" :conference="press" @answered="onAnswered" />

    <MailPanel v-else-if="letter" title="Correo" class="order-2" scroll flush>
      <div class="flex items-start gap-4 p-4">
        <span
          class="flex h-20 w-20 shrink-0 items-center justify-center rounded-full text-3xl font-bold"
          :class="TONE_CHIP[MAIL_SENDERS[letter.category].tone]"
          aria-hidden="true"
        >
          {{ MAIL_SENDERS[letter.category].initials }}
        </span>
        <div class="flex min-w-0 flex-1 flex-col items-start gap-1.5">
          <span class="text-lg font-bold">{{ MAIL_SENDERS[letter.category].name }}</span>
          <AppBadge :tone="MAIL_SENDERS[letter.category].tone">
            {{ MAIL_SENDERS[letter.category].label }}
          </AppBadge>
        </div>
        <div class="flex shrink-0 flex-col items-end gap-2">
          <time class="text-sm text-tv-blue-ink">{{ formatGameDate(letter.createdOn) }}</time>
          <TeamBadge v-if="club" :name="club.name" :kit="club.kit" :size="64" />
        </div>
      </div>

      <div class="px-4 pb-4">
        <h3
          class="bg-linear-to-r from-tv-mail-from to-tv-mail-to py-1.5 text-center text-sm font-bold uppercase tracking-wide text-white"
        >
          Mensaje
        </h3>
        <p class="mt-2 flex items-center gap-3 bg-tv-cell px-4 py-3 text-lg">
          <span aria-hidden="true" class="font-bold text-tv-blue-ink">»</span>
          {{ letter.title }}
        </p>
        <p class="whitespace-pre-line px-4 py-4 text-sm leading-relaxed">{{ letter.body }}</p>
      </div>
    </MailPanel>

    <MailPanel
      title="Lista de correos"
      :hint="unread === 0 ? 'Todo leído' : `${unread} sin leer`"
      envelope
      scroll
      flush
      class="order-1"
    >
      <AppEmpty v-if="!view || view.messages.length === 0">
        No hay correos. Cuando pase algo en el club —una lesión, un fichaje, una rueda de prensa—
        llegará aquí.
      </AppEmpty>

      <ul v-else class="flex flex-col gap-1 p-2">
        <li v-for="message in view.messages" :key="message.id">
          <button
            type="button"
            class="block w-full border-l-4 px-3 py-2 text-left transition-colors"
            :class="
              message.id === selectedId
                ? 'border-tv-blue-dim bg-tv-select'
                : 'border-transparent bg-tv-cell hover:bg-tv-cell-strong'
            "
            :aria-current="message.id === selectedId ? 'true' : undefined"
            @click="open(message)"
          >
            <MailRow :message="message" />
          </button>
        </li>
      </ul>
    </MailPanel>

    <MailPanel v-if="!press && !letter" title="Correo" class="order-2">
      <AppEmpty>Elige un correo de la lista para leerlo.</AppEmpty>
    </MailPanel>

    <PageActions v-if="letter?.route || unread > 0">
      <AppButton v-if="letter?.route" variant="primary" @click="goToShortcut">
        {{ shortcutLabel(letter.route) }}
      </AppButton>
      <AppButton v-if="unread > 0" @click="markAll">Marcar todo como leído</AppButton>
    </PageActions>
  </div>
</template>
