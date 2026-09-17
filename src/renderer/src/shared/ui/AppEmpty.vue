<script setup lang="ts">
/**
 * Lo que se enseña cuando todavía no hay nada que enseñar.
 *
 * Nunca en blanco: un hueco vacío parece una pantalla rota, y aquí casi
 * siempre hay una razón concreta —«la Copa se sortea en enero»— que conviene
 * contar. Existe para que esa razón no se olvide.
 *
 * Va sobre papel, dentro del panel que estaría lleno: texto centrado en gris,
 * como IBM.
 */
</script>

<template>
  <p class="mx-auto max-w-prose px-4 py-6 text-center text-sm text-tv-muted"><slot /></p>
</template>
