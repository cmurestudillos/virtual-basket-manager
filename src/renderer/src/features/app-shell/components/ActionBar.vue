<script setup lang="ts">
/**
 * La barra de acciones de abajo (IBM: ~55 px, `tv-footer`), con los botones de
 * la pantalla a la derecha. Es sólo el destino: los botones los pone cada
 * pantalla con `PageActions`, y el layout la oculta si nadie pone nada.
 *
 * No es un `<footer>` a propósito: las pantallas ya tienen el suyo (el resumen
 * de la rotación, el del plan de entrenamiento) y el arnés los busca por ahí.
 */
import { ACTION_BAR_TARGET } from '../page-chrome';
</script>

<template>
  <div
    role="toolbar"
    aria-label="Acciones de la pantalla"
    class="flex h-[55px] items-center justify-end border-t border-white/10 bg-tv-footer px-4"
  >
    <div :id="ACTION_BAR_TARGET" class="flex items-center gap-3"></div>
  </div>
</template>
