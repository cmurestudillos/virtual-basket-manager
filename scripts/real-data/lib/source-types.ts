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
}

export interface SourceLeague {
  /** Identificador de la liga en el juego: `liga-nacional`, `liga-plata`… */
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
}
