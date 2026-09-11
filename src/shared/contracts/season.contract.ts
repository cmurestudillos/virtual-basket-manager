export interface SeasonSummary {
  id: string;
  competitionId: string;
  competitionName: string;
  seasonNumber: number;
  startYear: number;
  currentRound: number;
  totalRounds: number;
  stage: 'regular' | 'playoffs' | 'finished';
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
  | { status: 'seasonOver'; date: number };

export interface SeasonApi {
  getCurrent: () => Promise<SeasonSummary>;
  getStandings: () => Promise<StandingEntry[]>;
  listFixtures: (round?: number) => Promise<FixtureEntry[]>;
  listTeamFixtures: (teamId: string) => Promise<FixtureEntry[]>;
  getNextGame: () => Promise<FixtureEntry | null>;
  advanceDay: () => Promise<AdvanceResult>;
  advanceToNextGame: () => Promise<AdvanceResult>;
  /** Cuadro de playoffs; `null` mientras la liga regular no haya acabado. */
  getPlayoffs: () => Promise<PlayoffBracket | null>;
  /** Cierra la temporada terminada y arranca la siguiente. */
  startNextSeason: () => Promise<SeasonSummary>;
}
