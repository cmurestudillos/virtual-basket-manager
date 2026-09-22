/**
 * El formato común en el que cada extractor deja lo que ha sacado de su web.
 *
 * Cada liga real tiene su fuente y su forma de leerla (acb.com, la FEB, las
 * de los demás países), pero todas acaban aquí: datos crudos, sin inventar
 * nada, tal y como vienen de la fuente. Convertir estadísticas en atributos,
 * poner sueldos o rellenar huecos es trabajo del montaje
 * (`build-real-dataset.ts`), no del extractor. Así una fuente nueva sólo tiene
 * que saber leer su web.
 *
 * Se guarda en `.real-data-cache/sources/<liga>-<año>.json`.
 */

export type SourcePosition = 'PG' | 'SG' | 'SF' | 'PF' | 'C';

/** Totales de la temporada regular de un jugador en esa liga. */
export interface SourceStats {
  games: number;
  /** Partidos saliendo de titular; `null` si la fuente no lo da. */
  starts: number | null;
  seconds: number;
  points: number;
  twoPointMade: number;
  twoPointAttempted: number;
  threePointMade: number;
  threePointAttempted: number;
  freeThrowMade: number;
  freeThrowAttempted: number;
  offensiveRebounds: number;
  defensiveRebounds: number;
  assists: number;
  steals: number;
  turnovers: number;
  blocks: number;
  /** Tapones recibidos; `null` si la fuente no lo da. */
  blocksReceived: number | null;
  /** Mates; `null` si la fuente no lo da. */
  dunks: number | null;
  fouls: number;
  foulsDrawn: number | null;
  /** Valoración de la fuente (PIR/VAL). */
  rating: number | null;
}

export interface SourcePlayer {
  /** Identificador estable del jugador en su fuente. */
  sourceId: string;
  firstName: string;
  lastName: string;
  /** Apodo o nombre de uso si la fuente lo da («Chacho»); `null` si no. */
  nickname: string | null;
  /** `AAAA-MM-DD`; `null` si la fuente no lo da. */
  birthDate: string | null;
  /** Edad declarada, para cuando no hay fecha de nacimiento. */
  age: number | null;
  /** Código de tres letras FIBA/COI (`ESP`, `USA`, `GER`); `null` si no se reconoce. */
  nationality: string | null;
  /** Nacionalidad tal y como la escribe la fuente, para revisar las no reconocidas. */
  nationalityRaw: string | null;
  /** Posición traducida; `null` si la fuente no la da o no se reconoce. */
  position: SourcePosition | null;
  positionRaw: string | null;
  heightCm: number | null;
  weightKg: number | null;
  shirtNumber: number | null;
  /** Cupo de la ficha tal y como lo da la fuente (EUR, EXT, JFL, COT, «SI/NO»…). */
  licence: string | null;
  /** Estadísticas de la liga regular; `null` si no jugó en esta liga ese año. */
  stats: SourceStats | null;
}

/**
 * El primer entrenador de un equipo: el que empezó la temporada, que es el que
 * está en el banquillo el día que arranca la partida.
 */
export interface SourceCoach {
  /** Identificador del entrenador en su fuente. */
  sourceId: string;
  /** Nombre de uso («Pepe», «Nacho»), que es como se le conoce. */
  firstName: string;
  lastName: string;
  /** `AAAA-MM-DD`; `null` si la fuente no lo da. */
  birthDate: string | null;
  /** Edad declarada, para cuando no hay fecha de nacimiento. */
  age: number | null;
  /** Código de tres letras FIBA/COI; `null` si no se reconoce o no se puede deducir. */
  nationality: string | null;
  /** Nacionalidad (o lugar de nacimiento, si es de donde se deduce) tal cual la fuente. */
  nationalityRaw: string | null;
}

export interface SourceTeam {
  sourceId: string;
  name: string;
  /** Abreviatura oficial (VBC, RMB); `null` si la fuente no la da. */
  shortName: string | null;
  city: string | null;
  pavilionName: string | null;
  pavilionCapacity: number | null;
  /** Puesto final de la liga regular; `null` si no se sabe. */
  finalPosition: number | null;
  players: SourcePlayer[];
  /** Primer entrenador; `null` si la fuente no lo da y ausente en extracciones de antes. */
  coach?: SourceCoach | null;
}

/**
 * Una liga real de la que sólo se meten en el juego algunos equipos, en una
 * liga de otra categoría: el ascendido de la segunda división que ocupa la
 * plaza que le falta a la primera. La liga entera se extrae igual, porque los
 * atributos salen del percentil de cada jugador **en su liga**; con un solo
 * equipo no habría con quién compararle.
 */
export interface SourceGuest {
  /** Liga del juego en la que juegan esos equipos (`italia-1`); tiene que ser real. */
  into: string;
  /** `sourceId` de los equipos que se meten; el resto sólo sirve de escala. */
  teamIds: string[];
  /**
   * Con qué liga ficticia se traduce el percentil a atributos: la del nivel
   * de esta liga, no la de destino, para que el equipo llegue con su nivel.
   * `stepsDown` baja esa escala otro tanto por cada paso, extrapolando la
   * distancia a la categoría de encima (0,5 es medio escalón): para ligas más
   * bajas que cualquier ficticia.
   */
  scale: { league: string; stepsDown?: number };
}

export interface SourceLeague {
  /**
   * Identificador de la liga en el juego: `liga-nacional`, `liga-plata`… En
   * una liga invitada (`guest`) es sólo un nombre propio (`italia-a2`): no
   * existe en el juego.
   */
  competitionId: string;
  /** Nombre real: «Liga Endesa», «Primera FEB». */
  name: string;
  shortName: string;
  country: string;
  /** Año en que empieza la temporada (2025 para la 2025-26). */
  seasonStartYear: number;
  /** De dónde sale: URL base de la fuente. */
  source: string;
  extractedAt: string;
  teams: SourceTeam[];
  /** Avisos del extractor para revisar a mano (nacionalidades no reconocidas…). */
  warnings: string[];
  /** Si sólo algunos de sus equipos entran en el juego, en otra liga. */
  guest?: SourceGuest;
  /**
   * En una liga que sí sustituye a la suya, los equipos que no juegan en ella
   * sino en la de encima: los ascendidos que completan una primera división
   * con menos equipos que la del juego (ÉLITE 2 → Pro A). Se valoran con su
   * liga entera y la escala de su liga, como un invitado, pero sin extraer la
   * liga dos veces.
   */
  promoted?: SourcePromotion;
  /**
   * `sourceId` de los equipos que no entran en el juego: la liga real tiene
   * más que la del juego (la ProA 2025-26, 18 para 16 plazas). Se valoran con
   * los demás, porque el percentil es el de la liga entera, pero no se meten.
   */
  excluded?: string[];
}

export interface SourcePromotion {
  /** Liga del juego en la que juegan esos equipos (`francia-1`); tiene que ser real. */
  into: string;
  /** `sourceId` de los equipos que suben, en el orden en que entran (el último, el último). */
  teamIds: string[];
}
