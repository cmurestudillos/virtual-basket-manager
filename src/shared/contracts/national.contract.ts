import { z } from 'zod';
import type { Position } from '@shared/domain/positions';
import type { FixtureEntry, StandingEntry } from './season.contract';

/**
 * Selecciones: la clasificación, el Mundial y la del usuario si dirige una.
 */

/** Una selección del mundo, ordenada por fuerza. */
export interface NationEntry {
  code: string;
  teamId: string;
  name: string;
  /** 1 = la más fuerte. */
  rank: number;
  reputation: number;
}

export interface NationalGroupView {
  name: string;
  standings: StandingEntry[];
  fixtures: FixtureEntry[];
}

/** La clasificación o el Mundial de un curso. */
export interface NationalCompetitionView {
  competitionId: string;
  name: string;
  seasonNumber: number;
  stage: 'regular' | 'playoffs' | 'finished';
  hostName: string | null;
  groups: NationalGroupView[];
  /** Cuartos, semifinales y final del Mundial; vacío en la clasificación. */
  knockout: { round: number; name: string; games: FixtureEntry[] }[];
  championTeamName: string | null;
}

/** La selección del usuario y lo que le pide la federación. */
export interface MyNationalTeam {
  teamId: string;
  code: string;
  name: string;
  rank: number;
  objectiveLabel: string;
  /** Hasta dónde ha llegado este curso, si ya se sabe. */
  outcomeLabel: string | null;
  /** Veredicto de la federación, al acabar el Mundial. */
  verdictLabel: string | null;
  nextGame: FixtureEntry | null;
}

export interface NationalWindowInfo {
  label: string;
  callupDate: number;
  firstGameDate: number;
}

export interface NationalOverview {
  seasonNumber: number;
  myTeam: MyNationalTeam | null;
  nextWindow: NationalWindowInfo | null;
  qualifiers: NationalCompetitionView | null;
  worldCup: NationalCompetitionView | null;
  champions: { seasonNumber: number; startYear: number; teamName: string }[];
  nations: NationEntry[];
}

/** Un jugador que se puede convocar. */
export interface CallupCandidate {
  playerId: string;
  name: string;
  position: Position;
  age: number;
  overall: number;
  condition: number;
  injuryDaysLeft: number;
  clubName: string | null;
  /** Su club lo suelta en esta ventana. */
  released: boolean;
  selected: boolean;
}

export interface NationalCallupView {
  teamId: string;
  teamName: string;
  window: string;
  windowLabel: string;
  seasonNumber: number;
  /** Si todavía se puede cambiar la lista, y si no, por qué. */
  editable: boolean;
  reason: string | null;
  squadSize: number;
  minSquad: number;
  candidates: CallupCandidate[];
}

export const MIN_CALLUP = 8;

export const saveCallupRequestSchema = z.object({
  playerIds: z.array(z.string().min(1)).min(MIN_CALLUP).max(12)
});
export type SaveCallupRequest = z.infer<typeof saveCallupRequestSchema>;

/** El «no» de una convocatoria lleva siempre su motivo. */
export interface CallupResult {
  ok: boolean;
  reason: string | null;
  view: NationalCallupView | null;
}

export interface NationalApi {
  getOverview: () => Promise<NationalOverview>;
  /** La lista de la ventana que toca; `null` si el usuario no dirige selección. */
  getCallup: () => Promise<NationalCallupView | null>;
  saveCallup: (request: SaveCallupRequest) => Promise<CallupResult>;
}
