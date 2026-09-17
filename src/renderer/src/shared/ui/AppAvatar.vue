<script setup lang="ts">
/**
 * La cara de una persona del juego: jugador, entrenador o técnico.
 *
 * Siempre redonda y a tamaño fijo, para que una fila de nombres alinee igual
 * tenga o no tenga avatar al lado. El `alt` es el nombre: la imagen no dice nada
 * que no diga ya el texto, pero un lector de pantalla tiene que saber de quién es.
 */
import { computed } from 'vue';
import { avatarUri, type AvatarKind } from './avatars';

const props = withDefaults(
  defineProps<{ kind: AvatarKind; seed: string; name?: string; size?: number }>(),
  { name: '', size: 28 }
);

const src = computed(() => avatarUri(props.kind, props.seed));
</script>

<template>
  <img
    :src="src"
    :alt="name"
    :width="size"
    :height="size"
    class="inline-block shrink-0 rounded-full bg-tv-box align-middle"
    :style="{ width: `${size}px`, height: `${size}px` }"
    loading="lazy"
    decoding="async"
  />
</template>
