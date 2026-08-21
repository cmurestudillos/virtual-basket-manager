export interface SeasonSummary {
  id: string;
  competitionId: string;
  competitionName: string;
  seasonNumber: number;
  startYear: number;
  currentRound: number;
  totalRounds: number;
  stage: 'regular' | 'playoffs' | 'finished';
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
}
