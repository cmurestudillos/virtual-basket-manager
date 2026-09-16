import { defineStore } from 'pinia';
import { ref } from 'vue';

/**
 * El contador de avisos sin leer, para el menú.
 *
 * No hace falta que nadie le avise de que ha pasado algo: preguntar ya pone la
 * bandeja al día, porque la bandeja compara la foto del club al leerse. Basta
 * con preguntar cuando pueda haber cambiado algo — al moverse el reloj o al
 * cambiar de pantalla.
 */
export const useInboxStore = defineStore('inbox', () => {
  const unread = ref(0);

  async function refresh(): Promise<void> {
    try {
      unread.value = await window.api.inbox.unreadCount();
    } catch {
      // Sin partida cargada no hay bandeja: el contador se queda a cero.
      unread.value = 0;
    }
  }

  return { unread, refresh };
});
