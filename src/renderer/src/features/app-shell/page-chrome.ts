import { inject, onBeforeUnmount, onMounted, type InjectionKey, type Ref } from 'vue';

/**
 * Los huecos del marco que rellena cada pantalla: controles en la barra de
 * sección y botones en la barra de acciones de abajo.
 *
 * Mecanismo: el layout pinta los destinos (`#section-bar-tabs`,
 * `#section-bar-tools`, `#action-bar`) y la pantalla manda allí su contenido con
 * `PageToolbar` y `PageActions`, que son un `<Teleport defer>` a esos ids. Se
 * eligió `Teleport` y no `meta` de ruta con slots porque lo que va en la barra
 * es de la pantalla —usa su estado, sus funciones— y así se escribe junto al
 * resto de su plantilla, sin pasar nada por el router.
 *
 * La barra de acciones sólo existe si alguien la usa: cada `PageActions` se
 * apunta en un contador que el layout provee y lee para enseñarla u ocultarla.
 * Fuera del marco (sin layout que provea) los dos componentes pintan su
 * contenido donde están, con el `Teleport` desactivado.
 */
export interface PageChrome {
  actions: Ref<number>;
}

export const PAGE_CHROME: InjectionKey<PageChrome> = Symbol('page-chrome');

export const SECTION_TABS_TARGET = 'section-bar-tabs';
export const SECTION_TOOLS_TARGET = 'section-bar-tools';
export const ACTION_BAR_TARGET = 'action-bar';

/** El marco, si la pantalla está dentro de él. */
export function usePageChrome(): PageChrome | null {
  return inject(PAGE_CHROME, null);
}

/** Apunta a quien lo llama en el contador de la barra de acciones mientras viva. */
export function useActionBarSlot(chrome: PageChrome | null): void {
  if (!chrome) {
    return;
  }
  onMounted(() => {
    chrome.actions.value += 1;
  });
  onBeforeUnmount(() => {
    chrome.actions.value -= 1;
  });
}
