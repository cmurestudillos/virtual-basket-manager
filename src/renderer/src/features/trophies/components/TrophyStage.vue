<script setup lang="ts">
/**
 * La copa en el centro de la pista, en el pabellón de la previa pintado con
 * los colores del campeón.
 *
 * El pabellón es el mismo de `ArenaBackdrop` (`match/arena-scene.ts`); aquí se
 * le añade un pedestal en el círculo central, la copa encima con sus focos y
 * una cámara que se acerca a ella y la rodea muy despacio. **Un solo contexto
 * WebGL**: al pasar de un título al siguiente se cambia la copa y los colores,
 * no el lienzo.
 *
 * Con `prefers-reduced-motion` no se mueve nada: ni la cámara ni la copa. Sin
 * WebGL se avisa al padre (`failed`) y éste pinta el fondo plano con el
 * trofeo del kit: la pantalla se sigue leyendo, la copa es la guinda.
 */
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import * as THREE from 'three';
import { AWAY_KIT, type Kit } from '@shared/domain/court';
import type { TrophyKind } from '@shared/domain/trophies';
import { buildArenaScene, disposeArenaScene } from '@renderer/features/match/arena-scene';
import { buildTrophyFor, disposeTrophy } from '../trophy-models';
import { addTrophyLights, trophyEnvironment } from '../trophy-thumbnail';

const props = withDefaults(
  defineProps<{
    kind: TrophyKind;
    /** Los colores del campeón: la pista, las vallas y la grada. */
    kit: Kit;
    /**
     * Cuánto se aparta la copa del centro de la pantalla, en cuartos del
     * ancho: negativo a la izquierda. En la gala deja sitio a los premios.
     */
    shift?: number;
  }>(),
  { shift: 0 }
);
const emit = defineEmits<{ failed: [] }>();

const host = ref<HTMLDivElement | null>(null);

/** Altura del pedestal y escala de la copa: una copa de ochenta centímetros no se ve en una pista. */
const PEDESTAL_HEIGHT = 1;
const TROPHY_SCALE = 2.1;

let renderer: THREE.WebGLRenderer | null = null;
let scene: THREE.Scene | null = null;
let camera: THREE.PerspectiveCamera | null = null;
let trophy: THREE.Object3D | null = null;
let environment: THREE.Texture | null = null;
let focus = new THREE.Vector3(0, 1.6, 0);
let frame: number | null = null;
let resize: ResizeObserver | null = null;
/** Ajusta el lienzo al hueco; se asigna al montar, cuando hay lienzo que ajustar. */
let fit: () => void = () => {};

function placeTrophy(kind: TrophyKind): void {
  if (!scene) return;
  if (trophy) {
    scene.remove(trophy);
    disposeTrophy(trophy);
  }
  trophy = buildTrophyFor(kind, environment);
  trophy.scale.setScalar(TROPHY_SCALE);
  trophy.position.y = PEDESTAL_HEIGHT;
  scene.add(trophy);

  // La cámara mira al centro de la copa, que no mide lo mismo en todas.
  const box = new THREE.Box3().setFromObject(trophy);
  focus = box.getCenter(new THREE.Vector3());
}

function buildScene(kit: Kit): THREE.Scene {
  const built = buildArenaScene({ homeKit: kit, awayKit: AWAY_KIT });

  // El pedestal, en el círculo central.
  const pedestal = new THREE.Mesh(
    new THREE.CylinderGeometry(0.5, 0.6, PEDESTAL_HEIGHT, 48),
    new THREE.MeshStandardMaterial({ color: '#111827', roughness: 0.5, metalness: 0.3 })
  );
  pedestal.position.y = PEDESTAL_HEIGHT / 2;
  built.add(pedestal);
  const trim = new THREE.Mesh(
    new THREE.CylinderGeometry(0.52, 0.52, 0.06, 48, 1, true),
    new THREE.MeshStandardMaterial({
      color: kit.shirt,
      emissive: new THREE.Color(kit.shirt),
      emissiveIntensity: 0.6
    })
  );
  trim.position.y = PEDESTAL_HEIGHT - 0.08;
  built.add(trim);

  // Un foco cenital sobre la copa, y sus luces de siempre alrededor.
  const spot = new THREE.SpotLight('#fff4d6', 180, 16, Math.PI / 12, 0.5);
  spot.position.set(0, 12, 0);
  spot.target.position.set(0, PEDESTAL_HEIGHT, 0);
  built.add(spot, spot.target);
  const lights = new THREE.Group();
  const lightScene = new THREE.Scene();
  addTrophyLights(lightScene, 2.5, 0.4);
  for (const light of [...lightScene.children]) {
    lights.add(light);
  }
  lights.position.y = PEDESTAL_HEIGHT;
  built.add(lights);

  return built;
}

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
  environment = trophyEnvironment(renderer);

  scene = buildScene(props.kit);
  camera = new THREE.PerspectiveCamera(40, 16 / 9, 0.1, 200);
  placeTrophy(props.kind);

  const still = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  const started = performance.now();

  function draw(now: number): void {
    frame = requestAnimationFrame(draw);
    if (!renderer || !scene || !camera) return;
    const elapsed = still ? 0 : now - started;
    // La cámara rodea la copa (una vuelta cada minuto) y la copa gira sobre
    // sí misma más despacio: se le ven todas las caras sin marear.
    const angle = 0.5 + (elapsed / 60_000) * Math.PI * 2;
    camera.position.set(Math.sin(angle) * 4.6, focus.y + 0.8, Math.cos(angle) * 4.6);
    camera.lookAt(focus);
    if (trophy) trophy.rotation.y = -(elapsed / 90_000) * Math.PI * 2;
    renderer.render(scene, camera);
  }

  fit = (): void => {
    if (!renderer || !container || !camera) return;
    const width = Math.max(1, container.clientWidth);
    const height = Math.max(1, container.clientHeight);
    renderer.setSize(width, height);
    camera.aspect = width / height;
    // Correr la vista y no la cámara: la copa se aparta sin dejar de mirarse de frente.
    camera.setViewOffset(width, height, -props.shift * width * 0.25, 0, width, height);
    camera.updateProjectionMatrix();
  };

  resize = new ResizeObserver(fit);
  resize.observe(container);
  fit();
  frame = requestAnimationFrame(draw);
});

watch(
  () => [props.kind, props.kit.shirt] as const,
  ([kind], [, previousShirt]) => {
    if (!scene) return;
    if (props.kit.shirt !== previousShirt) {
      // Otro campeón (el club y después su selección): otro pabellón, mismo lienzo.
      if (trophy) {
        scene.remove(trophy);
        disposeTrophy(trophy);
        trophy = null;
      }
      disposeArenaScene(scene);
      scene = buildScene(props.kit);
    }
    placeTrophy(kind);
  }
);

watch(
  () => props.shift,
  () => fit()
);

onBeforeUnmount(() => {
  if (frame !== null) cancelAnimationFrame(frame);
  resize?.disconnect();
  if (trophy) disposeTrophy(trophy);
  if (scene) disposeArenaScene(scene);
  environment?.dispose();
  renderer?.dispose();
  renderer?.domElement.remove();
  renderer = null;
  scene = null;
  camera = null;
  trophy = null;
});
</script>

<template>
  <div
    ref="host"
    class="absolute inset-0"
    role="img"
    aria-label="La copa en el centro de la pista"
    data-testid="trophy-stage"
    :data-trophy="kind"
  ></div>
</template>
