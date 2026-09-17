<script setup lang="ts">
/**
 * Una fila de la lista de correos (IBM, 131054): el círculo con las iniciales
 * de quien escribe, el remitente en azul, la fecha a la derecha y, debajo, el
 * asunto con su sobre, cerrado si está sin leer.
 *
 * Sólo pinta: quien la usa decide si es un botón (la bandeja) o un enlace (el
 * panel del inicio). Todo son `span` y no `p`: la bandeja deja que se lea
 * antes el mensaje abierto que la lista.
 */
import { computed } from 'vue';
import type { InboxMessage } from '@shared/contracts/inbox.contract';
import { TONE_CHIP } from '@renderer/shared/ui';
import { formatShortDate } from '@renderer/shared/format';
import { MAIL_SENDERS } from '../mail';

const props = defineProps<{ message: InboxMessage }>();

const sender = computed(() => MAIL_SENDERS[props.message.category]);
</script>

<template>
  <span class="flex min-w-0 items-center gap-3">
    <span
      class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold"
      :class="TONE_CHIP[sender.tone]"
      aria-hidden="true"
    >
      {{ sender.initials }}
    </span>
    <span class="flex min-w-0 flex-1 flex-col leading-tight">
      <span class="flex min-w-0 items-baseline gap-2">
        <span class="min-w-0 flex-1 truncate font-bold text-tv-blue-ink">{{ sender.name }}</span>
        <span class="figure shrink-0 text-xs text-tv-muted">
          {{ formatShortDate(message.createdOn) }}
        </span>
      </span>
      <span class="flex min-w-0 items-center gap-1.5 text-sm">
        <svg viewBox="0 0 24 24" class="h-4 w-4 shrink-0 text-tv-muted" aria-hidden="true">
          <rect
            x="3"
            y="6"
            width="18"
            height="13"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          />
          <path
            :d="message.read ? 'M3 11 L12 4 L21 11' : 'M3 7 L12 13 L21 7'"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          />
        </svg>
        <span class="truncate" :class="message.read ? '' : 'font-bold'">{{ message.title }}</span>
        <span v-if="!message.read" class="sr-only">(sin leer)</span>
      </span>
    </span>
  </span>
</template>
