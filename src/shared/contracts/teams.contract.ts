import type { BoardObjective } from '@shared/domain/board';
import type { CompetitionKind } from '@shared/domain/competition-kind';
import type { MatchScouting } from '@shared/contracts/match.contract';
import type { TrophyEntry } from '@shared/contracts/history.contract';
import type { PlayerSummary } from '@shared/contracts/players.contract';
import type { StandingEntry } from '@shared/contracts/season.contract';
import type { PlayerSeasonStats } from '@shared/contracts/stats.contract';

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
  /**
   * Caja del club. `null` en los clubes que no dirige el usuario: las cuentas
   * de un club ajeno no se ven desde fuera.
   */
  budgetCents: number | null;
  /** Jugadores en plantilla. */
  rosterSize: number;
  /** Su entrenador: el de la IA o el usuario. `null` sólo si el banquillo está vacío. */
  coach: TeamCoachRef | null;
}

/** El entrenador de un club, lo justo para nombrarlo y situarlo. */
export interface TeamCoachRef {
  id: string;
  name: string;
  nationality: string;
  /** 1-100; la pantalla la pinta en estrellas. */
  reputation: number;
  /** Si es el usuario. */
  isManager: boolean;
}

// --- Ficha de un club --------------------------------------------------------

/** Un partido del club visto desde su ficha, con su competición y su color. */
export interface TeamProfileGame {
  gameId: string;
  round: number;
  scheduledOn: number;
  homeTeamId: string;
  homeTeamName: string;
  awayTeamId: string;
  awayTeamName: string;
  homeScore: number | null;
  awayScore: number | null;
  overtimes: number;
  played: boolean;
  /** Si juega el club del usuario. */
  involvesManaged: boolean;
  seriesId: string | null;
  competitionId: string;
  competitionName: string;
  /** Qué color lleva: liga, copa, continental, playoffs. */
  kind: CompetitionKind;
}

/** Un resultado de la racha: ganado o perdido y el marcador visto desde el club. */
export interface TeamProfileForm {
  gameId: string;
  won: boolean;
  /** Primero los del club, después los del rival. */
  score: [number, number];
  rivalTeamId: string;
  rivalTeamName: string;
  home: boolean;
}

/** Un jugador de la plantilla tal y como lo ve el usuario: con la niebla de su ojeador. */
export interface TeamProfilePlayer extends PlayerSummary {
  contractYearsLeft: number;
}

/** El mejor del club en una estadística. */
export interface TeamProfileLeader {
  category: 'points' | 'rebounds' | 'assists' | 'efficiency';
  label: string;
  playerId: string;
  playerName: string;
  nationality: string;
  value: number;
  games: number;
}

/** El informe del analista: la pizarra y el quinteto que suele salir. */
export interface TeamProfileTactics {
  tactics: MatchScouting;
  /** El cinco de la rotación, con la media que ve el ojeador. */
  usualFive: {
    playerId: string;
    playerName: string;
    nationality: string;
    position: PlayerSummary['position'];
    overall: number;
    uncertainty: number;
  }[];
}

/**
 * La ficha de un club, la de cualquiera: lo que se ve desde fuera.
 *
 * Nunca lleva la caja, las nóminas ni la moral de un club ajeno; la media, los
 * atributos y el potencial pasan por el ojeador, y la pizarra sólo llega con un
 * analista competente. El club del usuario se ve entero.
 */
export interface TeamProfile {
  teamId: string;
  name: string;
  shortName: string;
  city: string;
  country: string;
  pavilionName: string;
  pavilionCapacity: number;
  /** 1-100; la pantalla la pinta en estrellas. */
  reputation: number;
  competitionId: string;
  competitionName: string;
  /** 1 es la máxima categoría del país. */
  tier: number;
  isManaged: boolean;
  /** Su entrenador: el de la IA o el usuario. */
  coach: TeamCoachRef | null;
  /** Media del equipo según el ojeador; `null` si no hay con qué ojearla. */
  overall: number | null;
  /** Margen de lo que se ve: 0 en el club propio. */
  uncertainty: number;
  /** Lo que se le pide por reputación y categoría. */
  objective: { id: BoardObjective; label: string };
  /** Su fila en la clasificación de su liga; `null` si su liga no se juega. */
  standing: StandingEntry | null;
  leagueTeams: number;
  /** Medias por partido del club en su liga este curso; `null` si no ha jugado. */
  season: {
    games: number;
    points: number;
    pointsAgainst: number;
    rebounds: number;
    assists: number;
    efficiency: number;
  } | null;
  /** Los últimos cinco resultados, del más antiguo al más reciente. */
  form: TeamProfileForm[];
  /** Todos sus partidos de este curso, por fecha. */
  games: TeamProfileGame[];
  /**
   * Contra el club del usuario: los partidos de este curso y el balance de
   * siempre. `null` en el club propio o sin club dirigido.
   */
  headToHead: {
    games: TeamProfileGame[];
    played: number;
    managedWins: number;
    teamWins: number;
  } | null;
  trophies: TrophyEntry[];
  totalTrophies: number;
  leaders: TeamProfileLeader[];
  squad: TeamProfilePlayer[];
  /** Medias de temporada de la plantilla en su liga. */
  playerStats: PlayerSeasonStats[];
  /**
   * Pizarra y quinteto: los del club propio siempre; los de otro, sólo con un
   * analista competente. `null` sin informe.
   */
  report: TeamProfileTactics | null;
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
  /** La ficha de un club, vista desde el del usuario; `null` si no existe. Rechaza selecciones. */
  getProfile: (teamId: string) => Promise<TeamProfile | null>;
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
