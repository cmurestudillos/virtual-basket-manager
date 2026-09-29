import {
  AmbientLight,
  Box3,
  Color,
  DirectionalLight,
  PMREMGenerator,
  PerspectiveCamera,
  PointLight,
  Scene,
  Vector3,
  WebGLRenderer,
  type Texture
} from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import type { TrophyKind } from '@shared/domain/trophies';
import { buildTrophyFor, disposeTrophy } from './trophy-models';

/**
 * La foto de un trofeo, para enseñarlo pequeño y muchas veces: la vitrina.
 *
 * La pantalla de campeón monta una escena viva porque enseña **una** copa; una
 * vitrina con quince títulos no puede abrir quince contextos de WebGL (los
 * navegadores cortan en torno a dieciséis y empiezan a tirar los viejos). Aquí
 * se dibuja cada tipo **una sola vez**, con un único lienzo para toda la
 * partida, y se guarda el PNG en memoria: la vitrina no es más que `<img>`.
 *
 * Devuelve `null` si el equipo no puede pintar en 3D, y quien llama enseña
 * entonces el trofeo plano de siempre (`TrophyIcon`).
 */

const cache = new Map<TrophyKind, string | null>();
let renderer: WebGLRenderer | null = null;
let environment: Texture | null = null;
let failed = false;

/** Tamaño del PNG: generoso, para que valga igual en una fila que en una vitrina grande. */
const SIZE = 256;

function sharedRenderer(): WebGLRenderer | null {
  if (renderer || failed) {
    return renderer;
  }
  try {
    renderer = new WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    renderer.setSize(SIZE, SIZE, false);
    environment = trophyEnvironment(renderer);
  } catch {
    failed = true;
    renderer = null;
  }
  return renderer;
}

export function trophyThumbnail(kind: TrophyKind): string | null {
  const cached = cache.get(kind);
  if (cached !== undefined) {
    return cached;
  }

  const target = sharedRenderer();
  if (!target) {
    cache.set(kind, null);
    return null;
  }

  const scene = new Scene();
  const trophy = buildTrophyFor(kind, environment);
  scene.add(trophy);
  // Las mismas luces que la pantalla de campeón, para que la miniatura y la
  // copa grande sean la misma pieza y no dos dibujos distintos.
  addTrophyLights(scene);

  const camera = new PerspectiveCamera(30, 1, 0.05, 20);
  const box = new Box3().setFromObject(trophy);
  const size = box.getSize(new Vector3());
  const center = box.getCenter(new Vector3());
  // Con margen: la boca de las continentales es casi tan ancha como alta.
  const extent = Math.max(size.y, size.x) * 1.3;
  camera.position.set(
    0,
    center.y + size.y * 0.12,
    extent / (2 * Math.tan((camera.fov * Math.PI) / 360))
  );
  camera.lookAt(0, center.y, 0);
  // Un poco de lado: de frente, las asas quedan de canto y la placa se aplana.
  trophy.rotation.y = -0.45;

  target.render(scene, camera);
  const url = target.domElement.toDataURL('image/png');

  // El lienzo se reutiliza para el siguiente tipo: la escena se desmonta entera.
  disposeTrophy(trophy);
  scene.clear();

  cache.set(kind, url);
  return url;
}

/**
 * Las luces de un trofeo: ambiente, una principal, una de relleno de frente
 * —sin ella el metal sólo devuelve el cielo y la cara que mira al jugador se
 * ve casi negra— y un contraluz cálido que le saca el brillo. En el
 * pabellón van más flojas (`intensity`): las direccionales alumbran también la
 * pista, y a plena potencia la dejaban quemada.
 */
export function addTrophyLights(scene: Scene, scale = 1, intensity = 1): void {
  scene.add(new AmbientLight(0xffffff, 0.6 * intensity));
  const key = new DirectionalLight(0xffffff, 2.4 * intensity);
  key.position.set(1.4 * scale, 2.4 * scale, 1.8 * scale);
  scene.add(key);
  const fill = new DirectionalLight(0xffffff, 1.3 * intensity);
  fill.position.set(-0.6 * scale, 0.9 * scale, 2.2 * scale);
  scene.add(fill);
  const rim = new PointLight(new Color(0xffd27a), 8 * scale * scale * intensity, 7 * scale);
  rim.position.set(-1.2 * scale, 1.1 * scale, -1.4 * scale);
  scene.add(rim);
}

/** Los reflejos del metal, hechos una vez con el renderer que se pase. */
export function trophyEnvironment(target: WebGLRenderer): Texture {
  const pmrem = new PMREMGenerator(target);
  const texture = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  pmrem.dispose();
  return texture;
}
