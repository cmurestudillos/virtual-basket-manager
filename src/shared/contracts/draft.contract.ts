import type { Position } from '@shared/domain/positions';

/**
 * El draft de la liga de formato NBA.
 *
 * Se abre al acabar su temporada: la lotería ya está sorteada, la IA elige
 * hasta que le toca al usuario y el usuario escoge. Si no termina, las
 * elecciones que falten se hacen solas al empezar la temporada siguiente.
 */

export interface DraftProspectView {
  playerId: string;
  name: string;
  nationality: string;
  position: Position;
  age: number;
  heightCm: number;
  /** Lo que ve tu ojeador: con margen de error, como en el mercado. */
  overall: number;
  potential: number;
  uncertainty: number;
}

export interface DraftPickView {
  pick: number;
  round: number;
  teamId: string;
  teamName: string;
  isUser: boolean;
  lotteryWinner: boolean;
  playerId: string | null;
  playerName: string | null;
  nationality: string | null;
  position: Position | null;
  passed: boolean;
}

export interface DraftView {
  competitionId: string;
  competitionName: string;
  seasonNumber: number;
  /** `waiting` hasta que acaba la temporada de la liga; `open` con elecciones pendientes. */
  status: 'waiting' | 'open' | 'done';
  onTheClock: DraftPickView | null;
  userOnTheClock: boolean;
  /** El club del usuario juega esta liga. */
  userInLeague: boolean;
  /** Con la plantilla llena no se puede elegir: hay que liberar sitio o renunciar. */
  rosterFull: boolean;
  /**
   * Lo que cuesta la elección que tiene el usuario en el reloj: la ficha del
   * novato y cómo deja la nómina frente al tope y al impuesto de lujo.
   */
  userPickCost: {
    rookieWageCents: number;
    payrollCents: number;
    payrollAfterCents: number;
    taxLineCents: number;
    projectedTaxCents: number;
  } | null;
  picks: DraftPickView[];
  prospects: DraftProspectView[];
}

export interface DraftApi {
  /** El draft de la liga NBA que se juega; `null` si no se juega ninguna. */
  get: () => Promise<DraftView | null>;
  /** La IA elige hasta que le toque al usuario o se acabe el draft. */
  simulateToUser: () => Promise<DraftView | null>;
  /** El usuario elige a un prospecto con la elección que tiene en el reloj. */
  pick: (playerId: string) => Promise<DraftView | null>;
  /** El usuario renuncia a la elección que tiene en el reloj. */
  pass: () => Promise<DraftView | null>;
  /** Termina el draft entero; las elecciones del usuario también las hace la IA. */
  simulateAll: () => Promise<DraftView | null>;
}
