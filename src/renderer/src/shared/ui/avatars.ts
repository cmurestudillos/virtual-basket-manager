import { createAvatar, type Style } from '@dicebear/core';
import { avataaars, personas, toonHead } from '@dicebear/collection';

/**
 * Las caras del juego.
 *
 * Cada tipo de persona tiene su estilo, para que se distinga de un vistazo quién
 * es quién: los jugadores con ToonHead, el entrenador con Personas y el cuerpo
 * técnico con Avataaars. Se generan **en local**, a partir del identificador de
 * cada uno: no hay peticiones a ningún servidor, el juego funciona sin conexión y
 * un mismo jugador tiene siempre la misma cara, partida tras partida.
 *
 * ToonHead y Personas son CC BY 4.0 y piden atribución: los créditos salen de
 * {@link AVATAR_CREDITS}, que se lee de los metadatos de los propios estilos para
 * que no puedan quedarse desfasados.
 */

export type AvatarKind = 'player' | 'coach' | 'staff';

const STYLES: Record<AvatarKind, Style<object>> = {
  player: toonHead as Style<object>,
  coach: personas as Style<object>,
  staff: avataaars as Style<object>
};

/**
 * Fondo de cada tipo: el mismo tono de pista para todos, con un matiz para que
 * una fila de jugadores no se confunda con una de técnicos.
 */
const BACKGROUNDS: Record<AvatarKind, string[]> = {
  player: ['263143'],
  coach: ['3a2415'],
  staff: ['1a2230']
};

/**
 * Los rasgos que puede sacar cada estilo.
 *
 * Los estilos sortean pelo, ropa y gestos sin saber de quién es la cara, y
 * jugadores y técnicos llevan nombres masculinos —la lista de nombres del juego
 * lo es—: sin acotarlo, a un «Davide Marchetti» le tocaba una melena rubia. Por
 * eso ahí se quitan los rasgos que no casan con el nombre, y los gestos fuera de
 * tono para una ficha de club (lágrimas, vómito, ojos de corazón).
 *
 * Al entrenador no se le impone nada de eso: es el propio usuario, con el nombre
 * que haya escrito, y su cara no tiene por qué suponer quién es. Sólo se le
 * quitan los rasgos que no pintan nada en un banquillo.
 */
const OPTIONS: Record<AvatarKind, Record<string, unknown>> = {
  player: {
    hair: ['sideComed', 'undercut', 'spiky'],
    rearHairProbability: 0,
    clothes: ['turtleNeck', 'openJacket', 'shirt', 'tShirt'],
    eyes: ['happy', 'wide', 'humble', 'wink'],
    beardProbability: 30
  },
  coach: {
    mouth: ['smile', 'frown', 'surprise', 'bigSmile', 'smirk', 'lips']
  },
  staff: {
    top: [
      'shortCurly',
      'shortFlat',
      'shortRound',
      'shortWaved',
      'sides',
      'theCaesar',
      'theCaesarAndSidePart',
      'shavedSides',
      'frizzle',
      'shaggy',
      'shaggyMullet',
      'dreads01',
      'dreads02',
      'fro',
      'froBand',
      'hat',
      'winterHat1',
      'winterHat02'
    ],
    eyes: ['default', 'happy', 'side', 'squint', 'wink', 'surprised'],
    mouth: ['default', 'serious', 'smile', 'twinkle', 'concerned'],
    eyebrows: ['defaultNatural', 'flatNatural', 'raisedExcitedNatural', 'upDownNatural'],
    facialHairProbability: 35
  }
};

const cache = new Map<string, string>();

/** El avatar como data URI, listo para un `<img>`. Misma semilla, mismo SVG. */
export function avatarUri(kind: AvatarKind, seed: string): string {
  const key = `${kind}|${seed}`;
  const hit = cache.get(key);
  if (hit) {
    return hit;
  }
  const uri = createAvatar(STYLES[kind], {
    seed,
    backgroundColor: BACKGROUNDS[kind],
    ...OPTIONS[kind]
  }).toDataUri();
  cache.set(key, uri);
  return uri;
}

export interface AvatarCredit {
  kind: AvatarKind;
  usedFor: string;
  title: string;
  creator: string;
  license: string;
  licenseUrl: string;
  source: string;
}

const USED_FOR: Record<AvatarKind, string> = {
  player: 'Jugadores',
  coach: 'Entrenador',
  staff: 'Cuerpo técnico'
};

interface StyleMeta {
  title?: string;
  creator?: string;
  source?: string;
  license?: { name?: string; url?: string };
}

/** Atribución de cada estilo, sacada de sus metadatos. */
export const AVATAR_CREDITS: AvatarCredit[] = (Object.keys(STYLES) as AvatarKind[]).map((kind) => {
  const meta = ((STYLES[kind] as { meta?: StyleMeta }).meta ?? {}) as StyleMeta;
  return {
    kind,
    usedFor: USED_FOR[kind],
    title: meta.title ?? '',
    creator: meta.creator ?? '',
    license: meta.license?.name ?? '',
    licenseUrl: meta.license?.url ?? '',
    source: meta.source ?? ''
  };
});
