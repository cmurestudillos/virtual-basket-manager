/**
 * Los trofeos: qué copa levanta cada título y de qué metal es (2026-09-29).
 *
 * Una **forma por tipo de título** y el **metal por categoría** (decisión del
 * usuario): la liga de primera y la de segunda son la misma copa, en oro y en
 * bronce; la Euroliga, la Eurocup y la Europe League, la misma boca abierta en
 * platino, plata y bronce. Así el jugador aprende a leer la vitrina de un
 * vistazo: la silueta dice qué se ganó y el color, a qué nivel.
 *
 * Ninguna se parece a un trofeo real —ni el de la NBA, ni la copa de la
 * Euroliga, ni la del Mundial—: el juego no puede cargar marcas ni diseños de
 * nadie, y por eso todas se dibujan por código (`features/trophies/`).
 *
 * Módulo puro: lo usan el proceso principal (para apuntar qué copa se levantó)
 * y la interfaz (para dibujarla).
 */

/** Las siluetas. Cada una es un tipo de título, nunca una competición concreta. */
export const TROPHY_SHAPES = [
  /** Copa alta de dos asas: la liga. */
  'league_cup',
  /** Cáliz alto con tres aros: el campeón de la liga americana. */
  'chalice',
  /** Copa baja de dos asas: la copa nacional. */
  'low_cup',
  /** Boca muy abierta: las continentales. */
  'wide_cup',
  /** Esfera de meridianos sobre columna: el Mundial. */
  'globe',
  /** Placa: el ascenso. */
  'plaque',
  /** Estatuilla con balón: los premios individuales. */
  'statuette'
] as const;
export type TrophyShape = (typeof TROPHY_SHAPES)[number];

export const TROPHY_METALS = ['gold', 'silver', 'bronze', 'platinum'] as const;
export type TrophyMetal = (typeof TROPHY_METALS)[number];

export const TROPHY_METAL_LABEL: Record<TrophyMetal, string> = {
  gold: 'Oro',
  silver: 'Plata',
  bronze: 'Bronce',
  platinum: 'Platino'
};

/** Qué se gana: el tipo de título, que es lo que se guarda y lo que decide la copa. */
export const TROPHY_KINDS = [
  'league_top',
  'league_lower',
  'nba_champion',
  'national_cup',
  'continental_top',
  'continental_second',
  'continental_third',
  'world_cup',
  'promotion',
  'award'
] as const;
export type TrophyKind = (typeof TROPHY_KINDS)[number];

export interface TrophyDesign {
  shape: TrophyShape;
  metal: TrophyMetal;
}

/** La tabla que decidió el usuario, título a título. */
export const TROPHY_DESIGN: Record<TrophyKind, TrophyDesign> = {
  league_top: { shape: 'league_cup', metal: 'gold' },
  league_lower: { shape: 'league_cup', metal: 'bronze' },
  nba_champion: { shape: 'chalice', metal: 'gold' },
  national_cup: { shape: 'low_cup', metal: 'silver' },
  continental_top: { shape: 'wide_cup', metal: 'platinum' },
  continental_second: { shape: 'wide_cup', metal: 'silver' },
  continental_third: { shape: 'wide_cup', metal: 'bronze' },
  world_cup: { shape: 'globe', metal: 'gold' },
  promotion: { shape: 'plaque', metal: 'bronze' },
  award: { shape: 'statuette', metal: 'gold' }
};

/** Cómo se llama cada tipo en la vitrina, cuando no basta con el nombre de la competición. */
export const TROPHY_KIND_LABEL: Record<TrophyKind, string> = {
  league_top: 'Liga',
  league_lower: 'Liga de segunda',
  nba_champion: 'Campeón de la liga americana',
  national_cup: 'Copa',
  continental_top: 'Continental',
  continental_second: 'Continental',
  continental_third: 'Continental',
  world_cup: 'Mundial',
  promotion: 'Ascenso',
  award: 'Premio'
};

/** Lo que hace falta saber de una competición para dar con su copa. */
export interface TrophySource {
  /** El `format` de la base: `league`, `cup`, `continental`, `national-tournament`… */
  format: string;
  tier: number;
  nbaFormat: boolean;
}

/**
 * La copa de una competición, o `null` si no da título: la clasificación para
 * el Mundial, por ejemplo, no se levanta.
 */
export function trophyKindOf(source: TrophySource): TrophyKind | null {
  switch (source.format) {
    case 'league':
      if (source.nbaFormat) return 'nba_champion';
      return source.tier <= 1 ? 'league_top' : 'league_lower';
    case 'cup':
      return 'national_cup';
    case 'continental':
      if (source.tier <= 1) return 'continental_top';
      return source.tier === 2 ? 'continental_second' : 'continental_third';
    case 'national-tournament':
      return 'world_cup';
    default:
      return null;
  }
}

export function trophyDesignOf(kind: TrophyKind): TrophyDesign {
  return TROPHY_DESIGN[kind];
}

/** Si un tipo de trofeo cuenta como título en el palmarés. El ascenso y los premios, no. */
export function countsAsTitle(kind: TrophyKind): boolean {
  return kind !== 'promotion' && kind !== 'award';
}

// --- Las pantallas de campeón ------------------------------------------------

/**
 * Lo que el juego le tiene que enseñar al mánager y todavía no le ha enseñado:
 * un título, un ascenso o la gala de fin de temporada.
 */
export const CELEBRATION_KINDS = ['title', 'promotion', 'season_gala'] as const;
export type CelebrationKind = (typeof CELEBRATION_KINDS)[number];

/**
 * En qué orden salen las pantallas de un mismo día: lo que se levanta primero,
 * después el ascenso y la gala siempre la última, como en la tele.
 */
export const CELEBRATION_ORDER: Record<CelebrationKind, number> = {
  title: 0,
  promotion: 1,
  season_gala: 2
};

/** El titular de la pantalla. */
export function celebrationHeadline(
  kind: CelebrationKind,
  competitionName: string,
  trophyKind: TrophyKind
): string {
  switch (kind) {
    case 'title':
      return trophyKind === 'world_cup'
        ? '¡Campeones del mundo!'
        : `¡Campeones de ${competitionName}!`;
    case 'promotion':
      return `¡Ascenso a ${competitionName}!`;
    case 'season_gala':
      return 'Gala de fin de temporada';
  }
}
