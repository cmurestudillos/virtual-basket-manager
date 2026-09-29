import {
  BoxGeometry,
  CylinderGeometry,
  Group,
  LatheGeometry,
  Mesh,
  MeshStandardMaterial,
  SphereGeometry,
  TorusGeometry,
  Vector2,
  type Object3D,
  type Texture
} from 'three';
import {
  TROPHY_DESIGN,
  type TrophyKind,
  type TrophyMetal,
  type TrophyShape
} from '@shared/domain/trophies';
import { METAL_COLORS } from './trophy-metals';

/**
 * Los trofeos, modelados aquí mismo (2026-09-29).
 *
 * Ninguna galería daba siete piezas libres de marcas y de atribución, y las
 * que se parecen a algo son réplicas de trofeos reales (el de la NBA, el del
 * Mundial, la copa de la Euroliga): justo lo que el juego no puede llevar. Se
 * dibujan con primitivas —casi todo geometría de revolución (`LatheGeometry`),
 * que es lo que es una copa: un perfil girado sobre su eje— y un material
 * metálico. No hay fichero que cargar, ni licencia que arrastrar, ni peso que
 * sumar al instalador (ver `assets/trophies/LICENSE.md`).
 *
 * Una forma por tipo de título y el metal por categoría (ver
 * `shared/domain/trophies.ts`). Todas miden entre medio metro y noventa
 * centímetros, de pie sobre su peana y centradas en el origen, para que la
 * misma cámara valga para todas.
 */

/** Altura de la peana común: todo lo demás se apoya encima. */
const PLINTH = 0.07;

/**
 * El perfil de cada copa, en metros y de abajo arriba: cada punto es (radio,
 * altura) sobre la peana y el torno lo gira. Sale hueca por arriba porque el
 * último tramo vuelve hacia dentro, como una copa de verdad.
 */
const PROFILES: Partial<Record<TrophyShape, [number, number][]>> = {
  // La liga: alta y esbelta, con nudo en el tallo y la boca recogida.
  league_cup: [
    [0, 0],
    [0.11, 0],
    [0.1, 0.025],
    [0.045, 0.07],
    [0.03, 0.17],
    [0.055, 0.2],
    [0.03, 0.23],
    [0.05, 0.27],
    [0.12, 0.36],
    [0.155, 0.48],
    [0.15, 0.6],
    [0.165, 0.64],
    [0.15, 0.64],
    [0.135, 0.6],
    [0.14, 0.48],
    [0.1, 0.37]
  ],
  // La liga americana: un cáliz alto, de tallo largo y copa en cono.
  chalice: [
    [0, 0],
    [0.1, 0],
    [0.095, 0.02],
    [0.04, 0.06],
    [0.028, 0.12],
    [0.028, 0.44],
    [0.04, 0.47],
    [0.07, 0.52],
    [0.13, 0.66],
    [0.16, 0.78],
    [0.145, 0.78],
    [0.115, 0.66],
    [0.055, 0.53]
  ],
  // La Copa: baja y ancha, casi un cuenco, sobre un pie corto.
  low_cup: [
    [0, 0],
    [0.12, 0],
    [0.11, 0.02],
    [0.05, 0.05],
    [0.04, 0.1],
    [0.09, 0.13],
    [0.17, 0.2],
    [0.2, 0.29],
    [0.205, 0.34],
    [0.19, 0.34],
    [0.185, 0.29],
    [0.155, 0.21],
    [0.08, 0.15]
  ],
  // Las continentales: tallo medio y una boca que se abre muchísimo.
  wide_cup: [
    [0, 0],
    [0.12, 0],
    [0.11, 0.025],
    [0.05, 0.07],
    [0.035, 0.2],
    [0.05, 0.26],
    [0.1, 0.36],
    [0.2, 0.46],
    [0.3, 0.54],
    [0.32, 0.57],
    [0.3, 0.57],
    [0.28, 0.55],
    [0.18, 0.47],
    [0.08, 0.37]
  ],
  // La estatuilla: una figura esbelta que sostiene el balón en lo alto.
  statuette: [
    [0, 0],
    [0.08, 0],
    [0.075, 0.02],
    [0.035, 0.06],
    [0.028, 0.2],
    [0.045, 0.3],
    [0.06, 0.36],
    [0.05, 0.4],
    [0.03, 0.42],
    [0, 0.42]
  ]
};

/**
 * Las asas: radio del aro, grosor, altura sobre la peana y distancia al eje.
 * Van metidas un tercio en la copa, que es lo que las hace asas y no aros
 * sueltos flotando al lado.
 */
const HANDLES: Partial<
  Record<TrophyShape, { radius: number; tube: number; height: number; offset: number }>
> = {
  league_cup: { radius: 0.075, tube: 0.013, height: 0.5, offset: 0.18 },
  low_cup: { radius: 0.07, tube: 0.014, height: 0.25, offset: 0.21 }
};

export interface TrophyOptions {
  shape: TrophyShape;
  metal: TrophyMetal;
  /** Reflejos del metal; sin ellos se ve casi negro por la cara que no da la luz. */
  environment?: Texture | null;
}

/** El material de una pieza: metal pulido, con un poco de brillo propio. */
export function metalMaterial(
  metal: TrophyMetal,
  environment?: Texture | null
): MeshStandardMaterial {
  const { color, emissive } = METAL_COLORS[metal];
  return new MeshStandardMaterial({
    color,
    emissive,
    metalness: 0.92,
    roughness: 0.22,
    envMap: environment ?? null,
    envMapIntensity: 1.1
  });
}

/** Construye un trofeo listo para meter en una escena, centrado y de pie sobre su peana. */
export function buildTrophy({ shape, metal, environment }: TrophyOptions): Object3D {
  const group = new Group();
  group.name = `trophy-${shape}`;
  const material = metalMaterial(metal, environment);

  if (shape === 'plaque') {
    buildPlaque(group, material);
    return group;
  }

  // La peana es redonda y de piedra oscura: gira sin enseñar esquinas y la
  // copa despega de ella.
  const base = new Mesh(
    new CylinderGeometry(0.17, 0.19, PLINTH, 40),
    new MeshStandardMaterial({ color: 0x1c2430, metalness: 0.15, roughness: 0.75 })
  );
  base.name = 'base';
  base.position.y = PLINTH / 2;
  group.add(base);

  // La franja de la placa de la peana, del mismo metal que la copa.
  const band = new Mesh(new CylinderGeometry(0.182, 0.182, 0.016, 40, 1, true), material);
  band.name = 'band';
  band.position.y = PLINTH * 0.55;
  group.add(band);

  if (shape === 'globe') {
    buildGlobe(group, material);
    return group;
  }

  const profile = PROFILES[shape] ?? [];
  const body = new Mesh(
    new LatheGeometry(
      profile.map(([radius, height]) => new Vector2(radius, height)),
      56
    ),
    material
  );
  body.name = 'body';
  body.position.y = PLINTH;
  group.add(body);

  const handle = HANDLES[shape];
  if (handle) {
    for (const side of [-1, 1]) {
      const ear = new Mesh(new TorusGeometry(handle.radius, handle.tube, 12, 32), material);
      ear.name = side === -1 ? 'handle-left' : 'handle-right';
      ear.position.set(side * handle.offset, PLINTH + handle.height, 0);
      ear.scale.set(0.8, 1.2, 1);
      group.add(ear);
    }
  }

  if (shape === 'chalice') {
    // Los tres aros del tallo: es lo que distingue el cáliz de un vaso.
    [0.2, 0.3, 0.4].forEach((height, index) => {
      const ring = new Mesh(new TorusGeometry(0.048, 0.011, 10, 32), material);
      ring.name = `ring-${index}`;
      ring.rotation.x = Math.PI / 2;
      ring.position.y = PLINTH + height;
      group.add(ring);
    });
  }

  if (shape === 'wide_cup') {
    // El labio de la boca, para que se lea abierta y no como un plato.
    const rim = new Mesh(new TorusGeometry(0.31, 0.012, 10, 64), material);
    rim.name = 'rim';
    rim.rotation.x = Math.PI / 2;
    rim.position.y = PLINTH + 0.57;
    group.add(rim);
  }

  if (shape === 'statuette') {
    // El balón en lo alto, con sus costuras: el premio individual se
    // reconoce de un vistazo.
    const ballY = PLINTH + 0.42 + 0.075;
    const ball = new Mesh(new SphereGeometry(0.08, 32, 20), material);
    ball.name = 'ball';
    ball.position.y = ballY;
    group.add(ball);
    const seamMaterial = new MeshStandardMaterial({ color: 0x1c2430, roughness: 0.6 });
    for (const [index, rotation] of [
      [0, [0, 0, 0]],
      [1, [Math.PI / 2, 0, 0]],
      [2, [0, Math.PI / 2, 0]]
    ] as const) {
      const seam = new Mesh(new TorusGeometry(0.081, 0.004, 6, 48), seamMaterial);
      seam.name = `seam-${index}`;
      seam.rotation.set(rotation[0], rotation[1], rotation[2]);
      seam.position.y = ballY;
      group.add(seam);
    }
  }

  return group;
}

/**
 * El Mundial: una esfera de meridianos y paralelos, hueca, sobre una columna.
 * Nada que ver con el trofeo de verdad, que es una figura sujetando el mundo.
 */
function buildGlobe(group: Group, material: MeshStandardMaterial): void {
  const column = new Mesh(
    new LatheGeometry(
      [
        [0, 0],
        [0.09, 0],
        [0.085, 0.02],
        [0.04, 0.06],
        [0.032, 0.3],
        [0.05, 0.34],
        [0.05, 0.36],
        [0, 0.36]
      ].map(([radius, height]) => new Vector2(radius as number, height as number)),
      48
    ),
    material
  );
  column.name = 'body';
  column.position.y = PLINTH;
  group.add(column);

  const radius = 0.17;
  const center = PLINTH + 0.36 + radius - 0.02;
  // Seis meridianos, a treinta grados unos de otros.
  for (let index = 0; index < 6; index += 1) {
    const meridian = new Mesh(new TorusGeometry(radius, 0.008, 8, 64), material);
    meridian.name = `meridian-${index}`;
    meridian.rotation.y = (index * Math.PI) / 6;
    meridian.position.y = center;
    group.add(meridian);
  }
  // El ecuador y dos paralelos.
  for (const [index, latitude] of [0, Math.PI / 5, -Math.PI / 5].entries()) {
    const parallel = new Mesh(
      new TorusGeometry(radius * Math.cos(latitude), 0.008, 8, 64),
      material
    );
    parallel.name = `parallel-${index}`;
    parallel.rotation.x = Math.PI / 2;
    parallel.position.y = center + radius * Math.sin(latitude);
    group.add(parallel);
  }
  // Un núcleo pequeño, para que los aros no parezcan flotar en el vacío.
  const core = new Mesh(new SphereGeometry(0.035, 20, 14), material);
  core.name = 'core';
  core.position.y = center;
  group.add(core);
}

/**
 * El ascenso: una placa de metal sobre un atril de madera oscura, con un
 * medallón. No es una copa a propósito: subir se celebra, pero no es un título.
 */
function buildPlaque(group: Group, material: MeshStandardMaterial): void {
  const wood = new MeshStandardMaterial({ color: 0x3a2618, metalness: 0.05, roughness: 0.7 });

  const base = new Mesh(new BoxGeometry(0.36, 0.06, 0.16), wood);
  base.name = 'base';
  base.position.y = 0.03;
  group.add(base);

  const board = new Mesh(new BoxGeometry(0.32, 0.42, 0.035), wood);
  board.name = 'board';
  board.position.set(0, 0.06 + 0.21, 0);
  board.rotation.x = -0.08;
  group.add(board);

  const plate = new Mesh(new BoxGeometry(0.26, 0.34, 0.012), material);
  plate.name = 'plate';
  plate.position.set(0, 0.06 + 0.21, 0.022);
  plate.rotation.x = -0.08;
  group.add(plate);

  // El medallón y la franja de la leyenda, en relieve.
  const medal = new Mesh(new CylinderGeometry(0.07, 0.07, 0.014, 40), material);
  medal.name = 'medal';
  medal.rotation.x = Math.PI / 2 - 0.08;
  medal.position.set(0, 0.06 + 0.25, 0.034);
  group.add(medal);

  const legend = new Mesh(new BoxGeometry(0.18, 0.03, 0.01), wood);
  legend.name = 'legend';
  legend.rotation.x = -0.08;
  legend.position.set(0, 0.06 + 0.12, 0.03);
  group.add(legend);
}

/** El trofeo que toca a un título, sin que quien lo pide sepa de formas ni metales. */
export function buildTrophyFor(kind: TrophyKind, environment?: Texture | null): Object3D {
  const design = TROPHY_DESIGN[kind];
  return buildTrophy({ shape: design.shape, metal: design.metal, environment });
}

/** Suelta de la tarjeta gráfica lo que construyó {@link buildTrophy}. */
export function disposeTrophy(trophy: Object3D): void {
  trophy.traverse((child) => {
    if (child instanceof Mesh) {
      child.geometry.dispose();
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      for (const material of materials) {
        material.dispose();
      }
    }
  });
}
