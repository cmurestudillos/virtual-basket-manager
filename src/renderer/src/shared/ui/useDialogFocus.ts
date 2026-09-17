import { nextTick, onUnmounted, watch, type Ref } from 'vue';

/**
 * El foco de un diálogo (el modal y el cajón): al abrirse entra en él, el
 * tabulador no se escapa por detrás del velo, Escape lo cierra y, al cerrarse,
 * el foco vuelve a donde estaba —normalmente, al botón que lo abrió—.
 *
 * Sin esto, quien juega con teclado abre un diálogo y sigue tabulando por la
 * pantalla de debajo, que no ve.
 */

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function useDialogFocus(
  container: Ref<HTMLElement | null>,
  open: Ref<boolean>,
  onEscape: () => void
): void {
  let previous: HTMLElement | null = null;

  function focusables(): HTMLElement[] {
    return container.value ? [...container.value.querySelectorAll<HTMLElement>(FOCUSABLE)] : [];
  }

  function onKey(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.stopPropagation();
      onEscape();
      return;
    }
    if (event.key !== 'Tab') return;
    const items = focusables();
    const first = items[0];
    const last = items.at(-1);
    if (!first || !last) {
      event.preventDefault();
      return;
    }
    const active = document.activeElement;
    if (event.shiftKey && (active === first || !container.value?.contains(active))) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (active === last || !container.value?.contains(active))) {
      event.preventDefault();
      first.focus();
    }
  }

  function release(): void {
    document.removeEventListener('keydown', onKey);
    previous?.focus();
    previous = null;
  }

  watch(
    open,
    async (isOpen) => {
      if (!isOpen) {
        release();
        return;
      }
      previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      document.addEventListener('keydown', onKey);
      await nextTick();
      (focusables()[0] ?? container.value)?.focus();
    },
    { immediate: true }
  );

  onUnmounted(release);
}
