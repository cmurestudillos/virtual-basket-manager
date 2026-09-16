export interface TeamSummary {
  id: string;
  name: string;
  shortName: string;
  city: string;
  country: string;
  competitionId: string;
  competitionName: string;
  crest: string | null;
  pavilionName: string;
  pavilionCapacity: number;
  reputation: number;
  budgetCents: number;
  /** Jugadores en plantilla. */
  rosterSize: number;
}

/** Una liga del mundo, para elegir equipo sin recorrer trescientos clubes. */
export interface CatalogLeague {
  competitionId: string;
  name: string;
  country: string;
  countryName: string;
  /** 1 es la máxima categoría del país. */
  tier: number;
  teams: number;
  /**
   * La liga de casa del juego: la primera del dataset, que es donde está la
   * Copa y sobre la que se calibró todo. Es con la que se abre el catálogo,
   * porque ordenado por reputación lo encabezarían los clubes americanos.
   */
  isHome: boolean;
}

/**
 * Un país que se puede jugar, con lo que cuesta jugarlo.
 *
 * La unidad es el país y no la liga: sus divisiones van atadas por los
 * ascensos. El coste se da en partidos y en segundos orientativos por
 * temporada, para que quien elige catorce países sepa a qué espera se apunta.
 */
export interface CatalogCountry {
  code: string;
  name: string;
  continent: string;
  leagues: { competitionId: string; name: string; tier: number; teams: number }[];
  hasCup: boolean;
  /** Partidos de liga y copa por temporada. */
  games: number;
}

/** Las competiciones continentales de un continente, que se juegan si entra alguno de sus países. */
export interface CatalogContinent {
  code: string;
  competitions: number;
  games: number;
}

/** Una selección que se puede dirigir desde el primer día. */
export interface CatalogNation {
  code: string;
  name: string;
  /** 1 = la más fuerte del mundo. */
  rank: number;
  players: number;
}

export interface CatalogScope {
  countries: CatalogCountry[];
  continents: CatalogContinent[];
  nations: CatalogNation[];
  /** Partidos de selecciones por temporada, que se juegan siempre. */
  nationalGames: number;
}

export interface TeamsApi {
  list: () => Promise<TeamSummary[]>;
  get: (id: string) => Promise<TeamSummary | null>;
  /** Las ligas del mundo, para filtrar el catálogo. */
  listLeagues: () => Promise<CatalogLeague[]>;
  /** Equipos del catálogo, leídos del dataset antes de que exista partida. */
  listCatalog: () => Promise<CatalogTeam[]>;
  /** Los países que se pueden jugar, con su coste, para elegirlos al crear la partida. */
  listScope: () => Promise<CatalogScope>;
}

/**
 * Equipo tal y como se ve en el menú de nueva partida, antes de que exista
 * ningún fichero de partida: sale del dataset empaquetado, no de SQLite.
 */
export interface CatalogTeam {
  id: string;
  name: string;
  city: string;
  country: string;
  competitionId: string;
  competitionName: string;
  reputation: number;
}
