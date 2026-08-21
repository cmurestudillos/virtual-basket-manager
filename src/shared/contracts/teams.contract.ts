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

export interface TeamsApi {
  list: () => Promise<TeamSummary[]>;
  get: (id: string) => Promise<TeamSummary | null>;
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
