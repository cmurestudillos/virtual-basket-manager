<script setup lang="ts">
/**
 * La misma pista en 3D: la escena que dibuja la 2D, con volumen.
 *
 * No hay otra coreografía: jugadores, balón y rótulo salen del mismo director,
 * así que 2D y 3D enseñan exactamente la misma jugada. Los muñecos son sencillos
 * —un cuerpo con la camiseta, una cabeza y el dorsal flotando— porque lo que
 * importa es leer el partido, no el parecido.
 *
 * Dos cámaras: la de la tele, de lado y siguiendo el balón, y la de detrás del
 * aro al que ataca quien lleva la pelota. three.js va en su propio trozo del
 * programa y sólo se carga si alguien abre la vista 3D.
 */
import { onMounted, onUnmounted, ref, watch } from 'vue';
import * as THREE from 'three';
import {
  CENTER_CIRCLE_RADIUS,
  COURT_LENGTH,
  COURT_WIDTH,
  HOOP_HEIGHT,
  HOOP_OFFSET,
  LANE_LENGTH,
  LANE_WIDTH,
  THREE_POINT_RADIUS,
  attacksRight,
  type CourtSide,
  type Kit
} from '@shared/domain/court';
import { AppSegmented } from '@renderer/shared/ui';
import type { CourtScene, ScenePlayer } from '../composables/useCourtScene';

const props = defineProps<{
  scene: CourtScene;
  kits: Record<CourtSide, Kit>;
  regulationPeriods: number;
}>();

type CameraMode = 'tv' | 'hoop';
const CAMERA_KEY = 'match.court3dCamera';

function readCamera(): CameraMode {
  try {
    return localStorage.getItem(CAMERA_KEY) === 'hoop' ? 'hoop' : 'tv';
  } catch {
    return 'tv';
  }
}

const cameraMode = ref<CameraMode>(readCamera());
watch(cameraMode, (value) => {
  try {
    localStorage.setItem(CAMERA_KEY, value);
  } catch {
    // Sin almacenamiento, la cámara se olvida al salir.
  }
});

const CAMERAS = [
  { id: 'tv', label: 'Tele' },
  { id: 'hoop', label: 'Detrás del aro' }
];

const host = ref<HTMLDivElement | null>(null);
const failed = ref(false);

/** De metros de la pista a la escena: el centro en el origen y la altura hacia arriba. */
function toScene(x: number, y: number, z = 0): THREE.Vector3 {
  return new THREE.Vector3(x - COURT_LENGTH / 2, z, y - COURT_WIDTH / 2);
}

/** El parqué con sus líneas, pintado una vez en un lienzo. */
function floorTexture(): THREE.CanvasTexture {
  const scale = 64;
  const canvas = document.createElement('canvas');
  canvas.width = COURT_LENGTH * scale;
  canvas.height = COURT_WIDTH * scale;
  const context = canvas.getContext('2d') as CanvasRenderingContext2D;
  context.scale(scale, scale);

  context.fillStyle = '#c8955a';
  context.fillRect(0, 0, COURT_LENGTH, COURT_WIDTH);
  // Tablillas del parqué.
  context.strokeStyle = 'rgba(90, 55, 20, 0.12)';
  context.lineWidth = 0.02;
  for (let y = 0; y < COURT_WIDTH; y += 0.35) {
    context.beginPath();
    context.moveTo(0, y);
    context.lineTo(COURT_LENGTH, y);
    context.stroke();
  }
  const midY = COURT_WIDTH / 2;
  context.fillStyle = '#b07c45';
  context.fillRect(0, midY - LANE_WIDTH / 2, LANE_LENGTH, LANE_WIDTH);
  context.fillRect(COURT_LENGTH - LANE_LENGTH, midY - LANE_WIDTH / 2, LANE_LENGTH, LANE_WIDTH);

  context.strokeStyle = '#fdf6ec';
  context.lineWidth = 0.06;
  context.strokeRect(0.03, 0.03, COURT_LENGTH - 0.06, COURT_WIDTH - 0.06);
  context.beginPath();
  context.moveTo(COURT_LENGTH / 2, 0);
  context.lineTo(COURT_LENGTH / 2, COURT_WIDTH);
  context.stroke();
  context.beginPath();
  context.arc(COURT_LENGTH / 2, midY, CENTER_CIRCLE_RADIUS, 0, Math.PI * 2);
  context.stroke();

  for (const left of [true, false]) {
    const hoopX = left ? HOOP_OFFSET : COURT_LENGTH - HOOP_OFFSET;
    const laneX = left ? 0 : COURT_LENGTH - LANE_LENGTH;
    context.strokeRect(laneX, midY - LANE_WIDTH / 2, LANE_LENGTH, LANE_WIDTH);
    const lineX = left ? LANE_LENGTH : COURT_LENGTH - LANE_LENGTH;
    context.beginPath();
    context.arc(lineX, midY, CENTER_CIRCLE_RADIUS, -Math.PI / 2, Math.PI / 2, !left);
    context.stroke();

    const cornerY = 0.9;
    const angle = Math.asin((midY - cornerY) / THREE_POINT_RADIUS);
    const cornerX = hoopX + (left ? 1 : -1) * Math.cos(angle) * THREE_POINT_RADIUS;
    const base = left ? 0 : COURT_LENGTH;
    context.beginPath();
    context.moveTo(base, cornerY);
    context.lineTo(cornerX, cornerY);
    if (left) {
      context.arc(hoopX, midY, THREE_POINT_RADIUS, -angle, angle);
    } else {
      context.arc(hoopX, midY, THREE_POINT_RADIUS, Math.PI + angle, Math.PI - angle, true);
    }
    context.lineTo(base, COURT_WIDTH - cornerY);
    context.stroke();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

/** Canasta: poste, brazo, tablero y aro. */
function buildHoop(left: boolean): THREE.Group {
  const group = new THREE.Group();
  const direction = left ? 1 : -1;
  const hoopX = left ? HOOP_OFFSET : COURT_LENGTH - HOOP_OFFSET;
  const boardX = left ? 1.2 : COURT_LENGTH - 1.2;

  const steel = new THREE.MeshStandardMaterial({ color: '#374151', roughness: 0.6 });
  const pole = new THREE.Mesh(new THREE.BoxGeometry(0.25, 3.4, 0.25), steel);
  pole.position.copy(toScene(boardX - direction * 1.4, COURT_WIDTH / 2, 1.7));
  group.add(pole);
  const arm = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.15, 0.15), steel);
  arm.position.copy(toScene(boardX - direction * 0.7, COURT_WIDTH / 2, 3.35));
  group.add(arm);

  const board = new THREE.Mesh(
    new THREE.BoxGeometry(0.05, 1.05, 1.8),
    new THREE.MeshStandardMaterial({ color: '#f8fafc', transparent: true, opacity: 0.75 })
  );
  board.position.copy(toScene(boardX, COURT_WIDTH / 2, HOOP_HEIGHT + 0.45));
  group.add(board);

  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(0.23, 0.02, 8, 24),
    new THREE.MeshStandardMaterial({ color: '#ff6a00' })
  );
  ring.rotation.x = Math.PI / 2;
  ring.position.copy(toScene(hoopX, COURT_WIDTH / 2, HOOP_HEIGHT));
  ring.name = 'ring';
  group.add(ring);
  return group;
}

/** El dorsal, en un cartel que siempre mira a cámara. */
function numberSprite(number: number, kit: Kit): THREE.Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const context = canvas.getContext('2d') as CanvasRenderingContext2D;
  context.fillStyle = kit.shirt;
  context.beginPath();
  context.arc(32, 32, 28, 0, Math.PI * 2);
  context.fill();
  context.lineWidth = 4;
  context.strokeStyle = '#0b0f14';
  context.stroke();
  context.fillStyle = kit.number;
  context.font = 'bold 30px system-ui, sans-serif';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(String(number), 32, 34);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, depthTest: false }));
  sprite.scale.set(0.55, 0.55, 0.55);
  sprite.position.y = 2.35;
  return sprite;
}

interface PlayerMesh {
  group: THREE.Group;
  ring: THREE.Mesh;
}

let renderer: THREE.WebGLRenderer | null = null;
let frame: number | null = null;
let resize: ResizeObserver | null = null;
const disposables: { dispose: () => void }[] = [];

onMounted(() => {
  const container = host.value;
  if (!container) return;

  try {
    renderer = new THREE.WebGLRenderer({ antialias: true });
  } catch {
    failed.value = true;
    return;
  }
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
  renderer.shadowMap.enabled = true;
  container.appendChild(renderer.domElement);

  const scene3d = new THREE.Scene();
  scene3d.background = new THREE.Color('#0f1620');
  const camera = new THREE.PerspectiveCamera(42, 16 / 9, 0.1, 200);

  scene3d.add(new THREE.HemisphereLight('#f1f5f9', '#3b2a1a', 1.4));
  const sun = new THREE.DirectionalLight('#ffffff', 1.6);
  sun.position.set(-6, 18, 8);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = -16;
  sun.shadow.camera.right = 16;
  sun.shadow.camera.top = 10;
  sun.shadow.camera.bottom = -10;
  scene3d.add(sun);

  // Suelo del pabellón y pista.
  const surround = new THREE.Mesh(
    new THREE.PlaneGeometry(COURT_LENGTH + 10, COURT_WIDTH + 10),
    new THREE.MeshStandardMaterial({ color: '#1b2533' })
  );
  surround.rotation.x = -Math.PI / 2;
  surround.position.y = -0.01;
  surround.receiveShadow = true;
  scene3d.add(surround);

  const floorMap = floorTexture();
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(COURT_LENGTH, COURT_WIDTH),
    new THREE.MeshStandardMaterial({ map: floorMap, roughness: 0.55 })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene3d.add(floor);
  disposables.push(floorMap);

  const hoops = [buildHoop(true), buildHoop(false)];
  hoops.forEach((hoop) => scene3d.add(hoop));

  const ball = new THREE.Mesh(
    new THREE.SphereGeometry(0.16, 16, 12),
    new THREE.MeshStandardMaterial({ color: '#ff7a1a', roughness: 0.7 })
  );
  ball.castShadow = true;
  scene3d.add(ball);

  const bodyGeometry = new THREE.CylinderGeometry(0.26, 0.3, 1.45, 14);
  const headGeometry = new THREE.SphereGeometry(0.17, 14, 10);
  const legsGeometry = new THREE.CylinderGeometry(0.2, 0.18, 0.55, 10);
  const focusGeometry = new THREE.RingGeometry(0.45, 0.55, 24);
  const skin = new THREE.MeshStandardMaterial({ color: '#8d5a3b', roughness: 0.8 });
  const focusMaterial = new THREE.MeshBasicMaterial({ color: '#fde68a', side: THREE.DoubleSide });
  disposables.push(bodyGeometry, headGeometry, legsGeometry, focusGeometry, skin, focusMaterial);

  const meshes = new Map<string, PlayerMesh>();

  function meshFor(player: ScenePlayer): PlayerMesh {
    const existing = meshes.get(player.playerId);
    if (existing) return existing;
    const kit = props.kits[player.side];
    const shirt = new THREE.MeshStandardMaterial({ color: kit.shirt, roughness: 0.6 });
    const group = new THREE.Group();
    const legs = new THREE.Mesh(legsGeometry, skin);
    legs.position.y = 0.28;
    const body = new THREE.Mesh(bodyGeometry, shirt);
    body.position.y = 1.2;
    body.castShadow = true;
    const head = new THREE.Mesh(headGeometry, skin);
    head.position.y = 2.05;
    head.castShadow = true;
    const ring = new THREE.Mesh(focusGeometry, focusMaterial);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.02;
    group.add(legs, body, head, ring, numberSprite(player.number, kit));
    scene3d.add(group);
    const mesh = { group, ring };
    meshes.set(player.playerId, mesh);
    return mesh;
  }

  const lookAt = new THREE.Vector3();
  let lastMode: CameraMode | null = null;
  const cameraGoal = new THREE.Vector3();

  function draw(): void {
    frame = requestAnimationFrame(draw);
    if (!renderer) return;

    const onCourt = new Set<string>();
    for (const player of props.scene.players.value) {
      const mesh = meshFor(player);
      mesh.group.visible = true;
      mesh.group.position.copy(toScene(player.x, player.y));
      mesh.ring.visible = player.focus;
      onCourt.add(player.playerId);
    }
    for (const [playerId, mesh] of meshes) {
      if (!onCourt.has(playerId)) mesh.group.visible = false;
    }

    const point = props.scene.ball.value;
    ball.position.copy(toScene(point.x, point.y, Math.max(0.16, point.z)));

    const result = props.scene.shotResult.value;
    const ringColor = result === 'made' ? '#34d399' : result === 'missed' ? '#f87171' : '#ff6a00';
    for (const hoop of hoops) {
      const ring = hoop.getObjectByName('ring') as THREE.Mesh;
      (ring.material as THREE.MeshStandardMaterial).color.set(ringColor);
    }

    // Cámaras: la de la tele sigue el balón a lo largo; la del aro se pone
    // detrás de la canasta a la que ataca quien tiene la pelota.
    if (cameraMode.value === 'tv') {
      // Sigue el balón lo justo para que la pista entera quepa siempre.
      const followX = (point.x - COURT_LENGTH / 2) * 0.2;
      cameraGoal.set(followX, 15, COURT_WIDTH / 2 + 18);
      lookAt.set(followX, 0, 0.5);
    } else {
      const right = attacksRight(
        props.scene.offense.value,
        props.scene.period.value,
        props.regulationPeriods
      );
      const direction = right ? 1 : -1;
      cameraGoal.set((COURT_LENGTH / 2 + 4) * direction, 8, 0);
      lookAt.set(5 * direction, 0, 0);
    }
    // Al cambiar de cámara se salta a su sitio; después, sólo se desliza.
    if (lastMode !== cameraMode.value) {
      camera.position.copy(cameraGoal);
      lastMode = cameraMode.value;
    }
    camera.position.lerp(cameraGoal, 0.06);
    camera.lookAt(lookAt);

    renderer.render(scene3d, camera);
  }

  function fit(): void {
    if (!renderer || !container) return;
    const width = container.clientWidth;
    // Apaisada y sin pasar de dos tercios de la ventana: debajo va la retransmisión.
    const height = Math.round(Math.min((width * 9) / 16, window.innerHeight * 0.62));
    renderer.setSize(width, height);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }

  resize = new ResizeObserver(fit);
  resize.observe(container);
  fit();
  draw();

  disposables.push({
    dispose: () => {
      for (const mesh of meshes.values()) {
        mesh.group.traverse((object) => {
          if (object instanceof THREE.Sprite) {
            object.material.map?.dispose();
            object.material.dispose();
          }
        });
      }
    }
  });
});

onUnmounted(() => {
  if (frame !== null) cancelAnimationFrame(frame);
  resize?.disconnect();
  for (const item of disposables) item.dispose();
  renderer?.dispose();
  renderer?.domElement.remove();
  renderer = null;
});
</script>

<template>
  <div class="relative overflow-hidden rounded border border-court-700 bg-court-900">
    <div ref="host" class="w-full" role="img" aria-label="Pista del partido en 3D"></div>
    <p v-if="failed" class="p-6 text-center text-sm text-court-300">
      Este equipo no puede dibujar la pista en 3D. La vista 2D enseña lo mismo.
    </p>
    <div class="absolute right-2 top-2 rounded bg-court-950/80">
      <AppSegmented v-model="cameraMode" :options="CAMERAS" aria-label="Cámara" />
    </div>
    <p
      v-if="scene.caption.value"
      class="pointer-events-none absolute bottom-2 left-1/2 max-w-[90%] -translate-x-1/2 truncate rounded bg-court-950/80 px-3 py-1 text-sm text-court-100"
    >
      {{ scene.caption.value }}
    </p>
  </div>
</template>
