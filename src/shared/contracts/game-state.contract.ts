export interface ManagedTeamState {
  teamId: string;
  teamName: string;
  managerName: string;
  /** Fecha dentro del juego, en milisegundos. */
  currentDate: number;
  seasonNumber: number;
}

export interface GameStateApi {
  get: () => Promise<ManagedTeamState | null>;
}
