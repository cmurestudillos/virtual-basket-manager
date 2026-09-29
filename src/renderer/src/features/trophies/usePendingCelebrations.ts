import type { Router } from 'vue-router';

/**
 * Lleva al mánager a su pantalla de campeón si hay alguna esperando (trofeos,
 * 2026-09-29).
 *
 * Los títulos se ganan dentro del avance del calendario, cuando nadie puede
 * enseñar nada: quedan apuntados en el proceso principal y se recogen aquí. Se
 * pregunta desde donde se vuelve —el inicio al abrirse y CONTINUAR al acabar—
 * y no desde un guardia global del router, que dispararía en cada navegación.
 *
 * Devuelve `true` si ha navegado, para que quien llama no siga con lo suyo.
 */
export async function goToPendingCelebrations(router: Router): Promise<boolean> {
  if (router.currentRoute.value.name === 'celebration') {
    return false;
  }
  if (!(await hasPendingCelebrations())) {
    return false;
  }
  await router.push({ name: 'celebration' });
  return true;
}

/** Si hay alguna pantalla por enseñar. Un fallo cuenta como que no: se enseñará la próxima vez. */
export async function hasPendingCelebrations(): Promise<boolean> {
  try {
    return (await window.api.trophies.listPending()).length > 0;
  } catch {
    return false;
  }
}
