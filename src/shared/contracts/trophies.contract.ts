/**
 * Trofeos, pantallas de campeón y gala de fin de temporada (2026-09-29).
 *
 * El palmarés sigue saliendo de los campeones de cada temporada (ver
 * `history.contract.ts`); esto es lo que se añadió encima: la pantalla que se
 * enseña al ganar, los premios de cada liga y la vitrina del mánager.
 */
import type { Position } from '../domain/positions';
import type { SeasonAwardType } from '../domain/season-awards';
import type { CelebrationKind, TrophyKind } from '../domain/trophies';
import type { PromotionEntry, TrophyEntry } from './history.contract';

/** Una pantalla de campeón que queda por enseñar. */
export interface PendingCelebration {
  id: string;
  kind: CelebrationKind;
  trophyKind: TrophyKind;
  seasonId: string;
  competitionId: string;
  /** Lo ganado; en el ascenso, la división a la que se sube. */
  competitionName: string;
  teamId: string;
  teamName: string;
  /** El país de la selección, si la que gana es una selección: su escudo es la bandera. */
  nationOf: string | null;
  /** «2025-26». */
  years: string;
}

/** Un premio de una temporada, con los nombres congelados el día que se entregó. */
export interface SeasonAwardEntry {
  type: SeasonAwardType;
  playerId: string | null;
  playerName: string | null;
  coachId: string | null;
  coachName: string | null;
  /** Si el premiado es el propio usuario (entrenador del año). */
  coachIsManager: boolean;
  nationality: string | null;
  teamId: string;
  teamName: string;
  value: number;
  /** 0 en los premios sueltos; 0..4 en el quinteto ideal, de base a pívot. */
  slot: number;
  position: Position | null;
  /** Si es del club que dirigía el usuario ese curso. */
  isManaged: boolean;
}

/** Los premios de una liga en una temporada: lo que enseña la gala. */
export interface SeasonGala {
  seasonId: string;
  competitionId: string;
  competitionName: string;
  seasonNumber: number;
  /** «2025-26». */
  years: string;
  awards: SeasonAwardEntry[];
}

/** La vitrina del mánager: lo que ha ganado él, en clubes y en selecciones. */
export interface ManagerCabinet {
  trophies: TrophyEntry[];
  /** Los títulos, sin contar ascensos. */
  totalTrophies: number;
  promotions: PromotionEntry[];
}

export interface TrophiesApi {
  /** Las pantallas pendientes, en el orden en que hay que enseñarlas. */
  listPending: () => Promise<PendingCelebration[]>;
  /** Enseñada: no vuelve a salir. */
  markSeen: (celebrationId: string) => Promise<void>;
  /** Los premios de una temporada de liga; `null` si no se entregaron. */
  getGala: (seasonId: string) => Promise<SeasonGala | null>;
  getManagerCabinet: () => Promise<ManagerCabinet>;
}
