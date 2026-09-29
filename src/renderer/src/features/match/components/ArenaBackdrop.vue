<script setup lang="ts">
/**
 * El pabellón vacío de fondo de la previa, en 3D.
 *
 * Es decorado, no retransmisión: en IBM el partido nunca se anima en 3D, sólo
 * se ve el pabellón detrás de las pantallas de antes de jugar, y esto hace lo
 * mismo. La pista con sus líneas, las canastas, las gradas por niveles, las
 * vallas de publicidad con el color del local y el marcador colgado del techo,
 * con la cámara dando la vuelta muy despacio.
 *
 * El pabellón se construye en `arena-scene.ts`, que comparte con la pantalla
 * de campeón; aquí sólo van la cámara que gira y el bucle de dibujo.
 *
 * three.js va en su propio trozo del programa y sólo se descarga al abrir una
 * previa. Si el equipo no puede dibujar en 3D, se avisa al padre y éste deja
 * el fondo plano de la retransmisión.
 */
import { onMounted, onUnmounted, ref } from 'vue';
import * as THREE from 'three';
import type { Kit } from '@shared/domain/court';
import { buildArenaScene, disposeArenaScene } from '../arena-scene';

const props = defineProps<{ homeKit: Kit; awayKit: Kit }>();
const emit = defineEmits<{ failed: [] }>();

const host = ref<HTMLDivElement | null>(null);

let renderer: THREE.WebGLRenderer | null = null;
let frame: number | null = null;
let resize: ResizeObserver | null = null;
let sceneRef: THREE.Scene | null = null;

onMounted(() => {
  const container = host.value;
  if (!container) return;

  try {
    renderer = new THREE.WebGLRenderer({ antialias: true });
  } catch {
    emit('failed');
    return;
  }
  renderer.setPixelRatio(Math.min(1.5, window.devicePixelRatio));
  container.appendChild(renderer.domElement);

  const scene = buildArenaScene({ homeKit: props.homeKit, awayKit: props.awayKit });
  sceneRef = scene;
  const camera = new THREE.PerspectiveCamera(45, 16 / 9, 0.1, 200);

  const still = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  const started = performance.now();

  function draw(now: number): void {
    frame = requestAnimationFrame(draw);
    if (!renderer) return;
    // Una vuelta entera cada dos minutos y medio: se nota que es 3D sin marear.
    const angle = still ? 0.6 : 0.6 + ((now - started) / 150_000) * Math.PI * 2;
    camera.position.set(Math.cos(angle) * 26, 13, Math.sin(angle) * 20);
    camera.lookAt(0, 0, 0);
    renderer.render(scene, camera);
  }

  function fit(): void {
    if (!renderer || !container) return;
    const width = container.clientWidth;
    const height = container.clientHeight;
    renderer.setSize(width, height);
    camera.aspect = width / Math.max(1, height);
    camera.updateProjectionMatrix();
  }

  resize = new ResizeObserver(fit);
  resize.observe(container);
  fit();
  frame = requestAnimationFrame(draw);
});

onUnmounted(() => {
  if (frame !== null) cancelAnimationFrame(frame);
  resize?.disconnect();
  if (sceneRef) disposeArenaScene(sceneRef);
  renderer?.dispose();
  renderer?.domElement.remove();
  renderer = null;
  sceneRef = null;
});
</script>

<template>
  <div ref="host" class="absolute inset-0" role="img" aria-label="Pabellón del partido en 3D"></div>
</template>
