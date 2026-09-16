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
 * three.js va en su propio trozo del programa y sólo se descarga al abrir una
 * previa. Si el equipo no puede dibujar en 3D, se avisa al padre y éste deja
 * el fondo plano de la retransmisión.
 */
import { onMounted, onUnmounted, ref } from 'vue';
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
  type Kit
} from '@shared/domain/court';

const props = defineProps<{ homeKit: Kit; awayKit: Kit }>();
const emit = defineEmits<{ failed: [] }>();

const host = ref<HTMLDivElement | null>(null);

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
  context.strokeStyle = 'rgba(90, 55, 20, 0.12)';
  context.lineWidth = 0.02;
  for (let y = 0; y < COURT_WIDTH; y += 0.35) {
    context.beginPath();
    context.moveTo(0, y);
    context.lineTo(COURT_LENGTH, y);
    context.stroke();
  }
  const midY = COURT_WIDTH / 2;
  context.fillStyle = props.homeKit.shirt;
  context.globalAlpha = 0.55;
  context.fillRect(0, midY - LANE_WIDTH / 2, LANE_LENGTH, LANE_WIDTH);
  context.fillRect(COURT_LENGTH - LANE_LENGTH, midY - LANE_WIDTH / 2, LANE_LENGTH, LANE_WIDTH);
  context.beginPath();
  context.arc(COURT_LENGTH / 2, midY, CENTER_CIRCLE_RADIUS, 0, Math.PI * 2);
  context.fill();
  context.globalAlpha = 1;

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

  const steel = new THREE.MeshStandardMaterial({ color: '#1f2937', roughness: 0.6 });
  const padding = new THREE.MeshStandardMaterial({ color: props.homeKit.shirt, roughness: 0.7 });
  const base = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1, 1.4), padding);
  base.position.copy(toScene(boardX - direction * 2.2, COURT_WIDTH / 2, 0.5));
  group.add(base);
  const pole = new THREE.Mesh(new THREE.BoxGeometry(0.25, 3.4, 0.25), steel);
  pole.position.copy(toScene(boardX - direction * 1.9, COURT_WIDTH / 2, 1.7));
  group.add(pole);
  const arm = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.15, 0.15), steel);
  arm.position.copy(toScene(boardX - direction * 0.95, COURT_WIDTH / 2, 3.35));
  group.add(arm);

  const board = new THREE.Mesh(
    new THREE.BoxGeometry(0.05, 1.05, 1.8),
    new THREE.MeshStandardMaterial({ color: '#f8fafc', transparent: true, opacity: 0.7 })
  );
  board.position.copy(toScene(boardX, COURT_WIDTH / 2, HOOP_HEIGHT + 0.45));
  group.add(board);

  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(0.23, 0.02, 8, 24),
    new THREE.MeshStandardMaterial({ color: '#ff6a00' })
  );
  ring.rotation.x = Math.PI / 2;
  ring.position.copy(toScene(hoopX, COURT_WIDTH / 2, HOOP_HEIGHT));
  group.add(ring);
  return group;
}

/**
 * Las gradas: filas de asientos que suben por niveles alrededor de la pista.
 * Van en un único `InstancedMesh` —unos tres mil asientos en una sola llamada
 * de dibujo— porque un pabellón a base de mallas sueltas no se mueve en un
 * portátil.
 */
function buildStands(): THREE.InstancedMesh {
  const ROWS = 16;
  const SEAT = 0.55;
  const ROW_DEPTH = 0.85;
  const ROW_RISE = 0.42;
  const GAP = 3.2;
  const seats: { position: THREE.Vector3; rotation: number; ring: number }[] = [];

  const halfLength = COURT_LENGTH / 2 + GAP;
  const halfWidth = COURT_WIDTH / 2 + GAP;
  for (let row = 0; row < ROWS; row += 1) {
    const offset = row * ROW_DEPTH;
    const height = 0.3 + row * ROW_RISE;
    // Lados largos.
    for (let x = -halfLength - offset; x <= halfLength + offset; x += SEAT) {
      seats.push({
        position: new THREE.Vector3(x, height, halfWidth + offset),
        rotation: Math.PI,
        ring: row
      });
      seats.push({
        position: new THREE.Vector3(x, height, -halfWidth - offset),
        rotation: 0,
        ring: row
      });
    }
    // Fondos.
    for (let z = -halfWidth - offset + SEAT; z < halfWidth + offset; z += SEAT) {
      seats.push({
        position: new THREE.Vector3(halfLength + offset, height, z),
        rotation: -Math.PI / 2,
        ring: row
      });
      seats.push({
        position: new THREE.Vector3(-halfLength - offset, height, z),
        rotation: Math.PI / 2,
        ring: row
      });
    }
  }

  const geometry = new THREE.BoxGeometry(0.46, 0.5, 0.42);
  const material = new THREE.MeshStandardMaterial({ roughness: 0.8 });
  const mesh = new THREE.InstancedMesh(geometry, material, seats.length);
  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3(1, 1, 1);
  const up = new THREE.Vector3(0, 1, 0);
  const grey = new THREE.Color('#4b5563');
  const light = new THREE.Color('#6b7280');
  const home = new THREE.Color(props.homeKit.shirt);
  seats.forEach((seat, index) => {
    quaternion.setFromAxisAngle(up, seat.rotation);
    matrix.compose(seat.position, quaternion, scale);
    mesh.setMatrixAt(index, matrix);
    // Una franja con el color del local a media altura, como las gradas pintadas.
    const color = seat.ring === 6 || seat.ring === 7 ? home : index % 7 === 0 ? light : grey;
    mesh.setColorAt(index, color);
  });
  mesh.instanceMatrix.needsUpdate = true;
  return mesh;
}

/** Las vallas de publicidad: una tira luminosa alrededor de la pista. */
function buildBoards(): THREE.Group {
  const group = new THREE.Group();
  const material = new THREE.MeshStandardMaterial({
    color: '#0b1020',
    emissive: new THREE.Color(props.homeKit.shirt),
    emissiveIntensity: 0.55
  });
  const halfLength = COURT_LENGTH / 2 + 1.8;
  const halfWidth = COURT_WIDTH / 2 + 1.8;
  const long = new THREE.BoxGeometry(COURT_LENGTH + 3.6, 0.9, 0.12);
  const short = new THREE.BoxGeometry(0.12, 0.9, COURT_WIDTH + 3.6);
  for (const sign of [1, -1]) {
    const side = new THREE.Mesh(long, material);
    side.position.set(0, 0.45, sign * halfWidth);
    group.add(side);
    const end = new THREE.Mesh(short, material);
    end.position.set(sign * halfLength, 0.45, 0);
    group.add(end);
  }
  return group;
}

/** El marcador colgado del techo y los focos. */
function buildCeiling(): THREE.Group {
  const group = new THREE.Group();
  const cube = new THREE.Mesh(
    new THREE.BoxGeometry(4.5, 2.6, 4.5),
    new THREE.MeshStandardMaterial({
      color: '#111827',
      emissive: '#1d4ed8',
      emissiveIntensity: 0.25
    })
  );
  cube.position.set(0, 14, 0);
  group.add(cube);

  const lamp = new THREE.MeshBasicMaterial({ color: '#fff7d6' });
  const bulb = new THREE.SphereGeometry(0.28, 10, 8);
  for (let x = -18; x <= 18; x += 4.5) {
    for (let z = -12; z <= 12; z += 6) {
      const light = new THREE.Mesh(bulb, lamp);
      light.position.set(x, 18, z);
      group.add(light);
    }
  }

  // Pancartas colgadas en los fondos, con los colores de los dos equipos.
  const banner = new THREE.PlaneGeometry(1.6, 3.2);
  [props.homeKit.shirt, props.awayKit.shirt, props.homeKit.shirt].forEach((color, index) => {
    const material = new THREE.MeshStandardMaterial({ color, side: THREE.DoubleSide });
    for (const sign of [1, -1]) {
      const plane = new THREE.Mesh(banner, material);
      plane.position.set(sign * (COURT_LENGTH / 2 + 12), 13, (index - 1) * 2.4);
      plane.rotation.y = Math.PI / 2;
      group.add(plane);
    }
  });
  return group;
}

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

  const scene = new THREE.Scene();
  sceneRef = scene;
  scene.background = new THREE.Color('#05030f');
  scene.fog = new THREE.Fog('#05030f', 30, 70);
  const camera = new THREE.PerspectiveCamera(45, 16 / 9, 0.1, 200);

  scene.add(new THREE.HemisphereLight('#cbd5e1', '#1e1b4b', 0.9));
  const top = new THREE.SpotLight('#fff4d6', 900, 60, Math.PI / 4, 0.5);
  top.position.set(0, 22, 0);
  top.target.position.set(0, 0, 0);
  scene.add(top, top.target);

  const surround = new THREE.Mesh(
    new THREE.PlaneGeometry(COURT_LENGTH + 12, COURT_WIDTH + 12),
    new THREE.MeshStandardMaterial({ color: '#1f2433', roughness: 0.9 })
  );
  surround.rotation.x = -Math.PI / 2;
  surround.position.y = -0.01;
  scene.add(surround);

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(COURT_LENGTH, COURT_WIDTH),
    new THREE.MeshStandardMaterial({ map: floorTexture(), roughness: 0.45 })
  );
  floor.rotation.x = -Math.PI / 2;
  scene.add(floor);

  scene.add(buildHoop(true), buildHoop(false), buildStands(), buildBoards(), buildCeiling());

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
  sceneRef?.traverse((object) => {
    if (object instanceof THREE.Mesh || object instanceof THREE.InstancedMesh) {
      object.geometry.dispose();
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of materials) {
        (material as THREE.MeshStandardMaterial).map?.dispose();
        material.dispose();
      }
    }
  });
  renderer?.dispose();
  renderer?.domElement.remove();
  renderer = null;
  sceneRef = null;
});
</script>

<template>
  <div ref="host" class="absolute inset-0" role="img" aria-label="Pabellón del partido en 3D"></div>
</template>
