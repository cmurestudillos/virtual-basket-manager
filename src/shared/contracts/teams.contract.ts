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

export interface TeamsApi {
  list: () => Promise<TeamSummary[]>;
  get: (id: string) => Promise<TeamSummary | null>;
  /** Las ligas del mundo, para filtrar el catálogo. */
  listLeagues: () => Promise<CatalogLeague[]>;
  /** Equipos del catálogo, leídos del dataset antes de que exista partida. */
  listCatalog: () => Promise<CatalogTeam[]>;
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
