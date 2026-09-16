<script setup lang="ts">
/**
 * La bandeja: lo que ha pasado desde la última vez.
 *
 * Cada aviso lleva a la pantalla donde se decide —la lesión a la ficha, el
 * contrato al mercado— porque un aviso que sólo informa obliga a ir a buscar
 * lo que ya se sabía. Las ruedas de prensa no llevan a ninguna parte: se
 * contestan aquí mismo.
 */
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import type { InboxMessage, InboxView, PressConference } from '@shared/contracts/inbox.contract';
import type { InboxCategory } from '@shared/domain/inbox';
import { formatMatchDate } from '@renderer/shared/format';
import { AppBadge, AppButton, AppEmpty, AppPageHeader, AppPanel } from '@renderer/shared/ui';
import type { Tone } from '@renderer/shared/ui/tones';
import PressConferencePanel from '../components/PressConferencePanel.vue';
import { useInboxStore } from '../inbox.store';

const router = useRouter();
const store = useInboxStore();

const view = ref<InboxView | null>(null);
const press = ref<PressConference | null>(null);

const CATEGORY: Record<InboxCategory, { label: string; tone: Tone }> = {
  injury: { label: 'Lesión', tone: 'bad' },
  recovery: { label: 'Alta', tone: 'good' },
  squad: { label: 'Plantilla', tone: 'neutral' },
  board: { label: 'Consejo', tone: 'warn' },
  title: { label: 'Título', tone: 'accent' },
  division: { label: 'Categoría', tone: 'accent' },
  contract: { label: 'Contratos', tone: 'warn' },
  career: { label: 'Carrera', tone: 'accent' },
  press: { label: 'Prensa', tone: 'neutral' }
};

const unread = computed(() => view.value?.unread ?? 0);

onMounted(load);

async function load(): Promise<void> {
  view.value = await window.api.inbox.get();
  store.unread = view.value.unread;
}

async function open(message: InboxMessage): Promise<void> {
  if (message.pressConferenceId) {
    press.value = await window.api.inbox.getPress(message.pressConferenceId);
    return;
  }

  view.value = await window.api.inbox.markRead(message.id);
  store.unread = view.value.unread;
  if (message.route) {
    await router.push({ name: message.route.name, params: message.route.params ?? {} });
  }
}

async function markAll(): Promise<void> {
  view.value = await window.api.inbox.markAllRead();
  store.unread = 0;
}

async function onAnswered(conference: PressConference): Promise<void> {
  // «Ahora no» devuelve la misma rueda sin contestar: se cierra el panel y ya.
  press.value = conference.answeredTone ? conference : null;
  await load();
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <AppPageHeader title="Bandeja">
      <span class="text-sm text-court-300">
        {{ unread === 0 ? 'Todo leído' : `${unread} sin leer` }}
      </span>
      <template v-if="unread > 0" #actions>
        <AppButton size="sm" variant="ghost" @click="markAll">Marcar todo como leído</AppButton>
      </template>
    </AppPageHeader>

    <PressConferencePanel v-if="press" :conference="press" @answered="onAnswered" />

    <AppPanel flush>
      <AppEmpty v-if="!view || view.messages.length === 0" class="p-4">
        No hay avisos. Cuando pase algo en el club —una lesión, un fichaje, una rueda de prensa—
        aparecerá aquí.
      </AppEmpty>

      <ul v-else>
        <li v-for="message in view.messages" :key="message.id">
          <button
            type="button"
            class="flex w-full items-start gap-3 border-b border-court-800 px-4 py-3 text-left transition hover:bg-court-800"
            @click="open(message)"
          >
            <span
              class="mt-1.5 h-2 w-2 shrink-0 rounded-full"
              :class="message.read ? 'bg-transparent' : 'bg-ball-500'"
            />
            <span class="flex-1">
              <span class="flex flex-wrap items-center gap-2">
                <AppBadge :tone="CATEGORY[message.category].tone">
                  {{ CATEGORY[message.category].label }}
                </AppBadge>
                <span :class="message.read ? 'text-court-300' : 'text-court-100'">
                  {{ message.title }}
                </span>
              </span>
              <span class="mt-0.5 block text-sm text-court-300">{{ message.body }}</span>
            </span>
            <span class="shrink-0 text-xs text-court-600">
              {{ formatMatchDate(message.createdOn) }}
            </span>
          </button>
        </li>
      </ul>
    </AppPanel>
  </div>
</template>
