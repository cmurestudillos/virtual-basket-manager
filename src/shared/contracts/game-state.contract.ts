export interface ManagedTeamState {
  teamId: string;
  teamName: string;
  managerName: string;
  /** Código de nacionalidad del entrenador, para su bandera. */
  managerNationality: string;
  /** Fecha dentro del juego, en milisegundos. */
  currentDate: number;
  seasonNumber: number;
}

export interface GameStateApi {
  get: () => Promise<ManagedTeamState | null>;
  /** Cambia la nacionalidad del entrenador de la partida cargada. */
  setManagerNationality: (code: string) => Promise<ManagedTeamState | null>;
}
