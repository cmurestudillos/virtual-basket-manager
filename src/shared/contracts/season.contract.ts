import type { StandingZone } from '@shared/domain/promotion';

export interface SeasonSummary {
  id: string;
  competitionId: string;
  competitionName: string;
  seasonNumber: number;
  startYear: number;
  currentRound: number;
  totalRounds: number;
  stage: 'regular' | 'playoffs' | 'finished';
  /** Categoría: 1 es la primera división, 2 la segunda. */
  tier: number;
  /** Equipos que juegan los playoffs; 0 si la liga los corona sin eliminatoria. */
  playoffTeams: number;
  championTeamId: string | null;
  championTeamName: string | null;
}

export interface StandingEntry {
  position: number;
  teamId: string;
  teamName: string;
  played: number;
  won: number;
  lost: number;
  pointsFor: number;
  pointsAgainst: number;
  pointsDifference: number;
  streak: number;
  /** Si es el equipo que dirige el usuario, para resaltarlo en la tabla. */
  isManaged: boolean;
  /** Qué se juega ese puesto: playoff, ascenso, descenso o nada. */
  zone: StandingZone;
}

/** Una división de las que se juegan en la partida. */
export interface LeagueEntry {
  competitionId: string;
  name: string;
  tier: number;
  /** La del equipo del usuario. */
  isManaged: boolean;
  /** Igual que `isManaged`; se mantiene aparte por si un día hay filiales. */
  hasManagedTeam: boolean;
  championTeamId: string | null;
  championTeamName: string | null;
}

export interface FixtureEntry {
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
  /** Si juega el equipo del usuario. */
  involvesManaged: boolean;
  /** Eliminatoria a la que pertenece; `null` en liga regular. */
  seriesId: string | null;
  /** Número de partido dentro de la eliminatoria (1..7). */
  seriesGame: number | null;
}

/** Una eliminatoria del cuadro, con lo jugado hasta ahora. */
export interface PlayoffSeries {
  seriesId: string;
  round: number;
  roundName: string;
  bestOf: number;
  /** El mejor clasificado de la liga regular: abre y cierra en casa. */
  higherSeedTeamId: string;
  higherSeedTeamName: string;
  higherSeed: number;
  lowerSeedTeamId: string;
  lowerSeedTeamName: string;
  lowerSeed: number;
  higherSeedWins: number;
  lowerSeedWins: number;
  winnerTeamId: string | null;
  involvesManaged: boolean;
  /** Partidos de la serie; los que no se llegaron a jugar no están. */
  games: FixtureEntry[];
}

/** Una eliminatoria de Copa: partido único en sede neutral. */
export interface CupTie {
  gameId: string;
  round: number;
  scheduledOn: number;
  homeTeamId: string;
  homeTeamName: string;
  awayTeamId: string;
  awayTeamName: string;
  homeScore: number | null;
  awayScore: number | null;
  played: boolean;
  involvesManaged: boolean;
}

export interface CupBracket {
  competitionName: string;
  seasonNumber: number;
  rounds: { round: number; name: string; ties: CupTie[] }[];
  championTeamId: string | null;
  championTeamName: string | null;
}

/** Una competición continental de las que se juegan en la partida. */
export interface ContinentalSummary {
  competitionId: string;
  name: string;
  /** 1 es la mejor del continente. */
  tier: number;
  /** Si la juega el club del usuario. */
  involvesManaged: boolean;
  championTeamId: string | null;
  championTeamName: string | null;
}

/**
 * Una competición continental por dentro: la fase de liga y el cuadro.
 *
 * Son las dos mitades del torneo y se enseñan juntas porque se leen juntas: la
 * tabla dice quién va a entrar en el cuadro y el cuadro dice qué pasó después.
 */
export interface ContinentalView extends ContinentalSummary {
  seasonNumber: number;
  stage: 'regular' | 'playoffs' | 'finished';
  /** Clasificación de la fase de liga; los ocho primeros pasan. */
  group: StandingEntry[];
  /** Cuartos y Final Four. Vacío mientras dure la fase de liga. */
  knockout: PlayoffBracket;
}

export interface PlayoffBracket {
  rounds: { round: number; name: string; bestOf: number; series: PlayoffSeries[] }[];
  championTeamId: string | null;
  championTeamName: string | null;
}

/**
 * Resultado de pedirle al juego que avance.
 *
 * `userGame` es el caso importante: el calendario se para en seco cuando le
 * toca jugar al equipo del usuario, porque ese partido lo juega él cuarto a
 * cuarto y no lo puede resolver la máquina por su cuenta.
 */
export type AdvanceResult =
  | { status: 'userGame'; gameId: string; date: number }
  | { status: 'advanced'; date: number; playedGameIds: string[] }
  | { status: 'seasonOver'; date: number }
  /** El consejo te ha destituido: el reloj no avanza más en esta partida. */
  | { status: 'dismissed'; date: number };

export interface SeasonApi {
  getCurrent: () => Promise<SeasonSummary>;
  /** Clasificación de una división; sin argumento, la del equipo del usuario. */
  getStandings: (competitionId?: string) => Promise<StandingEntry[]>;
  /** Las divisiones que se juegan, para asomarse a la de al lado. */
  listLeagues: () => Promise<LeagueEntry[]>;
  listFixtures: (round?: number) => Promise<FixtureEntry[]>;
  listTeamFixtures: (teamId: string) => Promise<FixtureEntry[]>;
  getNextGame: () => Promise<FixtureEntry | null>;
  advanceDay: () => Promise<AdvanceResult>;
  advanceToNextGame: () => Promise<AdvanceResult>;
  /** Cuadro de playoffs; `null` mientras la liga regular no haya acabado. */
  getPlayoffs: () => Promise<PlayoffBracket | null>;
  /** Cuadro de Copa; `null` mientras no se cierre la primera vuelta. */
  getCup: () => Promise<CupBracket | null>;
  /** Las competiciones continentales que se juegan este curso. */
  listContinental: () => Promise<ContinentalSummary[]>;
  /** Una de ellas por dentro; sin argumento, la que juega el club del usuario. */
  getContinental: (competitionId?: string) => Promise<ContinentalView | null>;
  /** Cierra la temporada terminada y arranca la siguiente. */
  startNextSeason: () => Promise<SeasonSummary>;
}
