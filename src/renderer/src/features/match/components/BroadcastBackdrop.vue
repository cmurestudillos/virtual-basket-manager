<script setup lang="ts">
/**
 * El fondo de la retransmisión: morado de noche con las franjas en diagonal
 * de las esquinas. Todo CSS, sin imágenes: pesa cero y se estira a cualquier
 * ventana.
 */
</script>

<template>
  <div class="broadcast-backdrop relative min-h-full overflow-hidden text-white">
    <div aria-hidden="true" class="stripes stripes-left"></div>
    <div aria-hidden="true" class="stripes stripes-right"></div>
    <div class="relative">
      <slot />
    </div>
  </div>
</template>

<style scoped>
.broadcast-backdrop {
  background:
    radial-gradient(ellipse at 20% 110%, rgb(21 94 117 / 0.55), transparent 55%),
    radial-gradient(ellipse at 85% -10%, rgb(184 23 94 / 0.45), transparent 50%),
    linear-gradient(160deg, var(--color-tv-900) 0%, #2a0d4d 55%, #1b0b3a 100%);
}

.stripes {
  position: absolute;
  width: 22rem;
  height: 30rem;
  pointer-events: none;
  opacity: 0.55;
  background: repeating-linear-gradient(
    -35deg,
    var(--color-tv-orange) 0 0.55rem,
    transparent 0.55rem 1.35rem
  );
  mask-image: linear-gradient(90deg, black, transparent);
}

.stripes-left {
  left: -6rem;
  bottom: -4rem;
  transform: skewY(-20deg);
}

.stripes-right {
  right: -6rem;
  top: 4rem;
  transform: scaleX(-1) skewY(-20deg);
  background: repeating-linear-gradient(
    -35deg,
    var(--color-tv-magenta) 0 0.55rem,
    transparent 0.55rem 1.35rem
  );
}
</style>
