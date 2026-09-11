import { z } from 'zod';
import type { Position } from '@shared/domain/positions';
import {
  MAX_CONTRACT_YEARS,
  MIN_CONTRACT_YEARS,
  MIN_WAGE_CENTS,
  type TransferWindow
} from '@shared/domain/market';

export const marketSearchRequestSchema = z.object({
  /** Filtra por puesto; vacío = todos. */
  position: z.enum(['PG', 'SG', 'SF', 'PF', 'C']).nullable().default(null),
  /** Sólo agentes libres. */
  freeAgentsOnly: z.boolean().default(false),
  /** Tope de edad; `null` = sin tope. */
  maxAge: z.number().int().min(16).max(45).nullable().default(null),
  /** Tope de traspaso que estás dispuesto a pagar. */
  maxFeeCents: z.number().int().min(0).nullable().default(null),
  limit: z.number().int().min(1).max(100).default(40)
});

export type MarketSearchRequest = z.input<typeof marketSearchRequestSchema>;

export const offerRequestSchema = z.object({
  playerId: z.string().min(1),
  /** Traspaso ofrecido; 0 en un agente libre. */
  feeCents: z.number().int().min(0),
  wageCents: z.number().int().min(MIN_WAGE_CENTS),
  years: z.number().int().min(MIN_CONTRACT_YEARS).max(MAX_CONTRACT_YEARS)
});

export type OfferRequest = z.infer<typeof offerRequestSchema>;

export const playerIdRequestSchema = z.object({ playerId: z.string().min(1) });

/** Ceder a uno de los tuyos: el club que se lo lleva lo busca el juego. */
export const loanOutRequestSchema = z.object({ playerId: z.string().min(1) });
/** Pedir cedido a uno de otro club. */
export const loanInRequestSchema = z.object({ playerId: z.string().min(1) });

export type LoanRequest = z.infer<typeof loanOutRequestSchema>;

export const renewRequestSchema = z.object({
  playerId: z.string().min(1),
  wageCents: z.number().int().min(MIN_WAGE_CENTS),
  years: z.number().int().min(MIN_CONTRACT_YEARS).max(MAX_CONTRACT_YEARS)
});

export type RenewRequest = z.infer<typeof renewRequestSchema>;

/** Un jugador tal y como se ve desde fuera del club que lo tiene. */
export interface MarketPlayer {
  playerId: string;
  playerName: string;
  teamId: string | null;
  teamName: string | null;
  position: Position;
  age: number;
  /** Media estimada: lleva el margen de error del ojeador. */
  overall: number;
  potential: number;
  uncertainty: number;
  /** Lo que pide su club por él; 0 si es agente libre. */
  askingPriceCents: number;
  /** Lo que pediría de ficha. */
  wageDemandCents: number;
  currentWageCents: number;
  contractYearsLeft: number;
  valueCents: number;
  isFreeAgent: boolean;
  /** Del país del club: cuenta para el cupo de jugadores de formación. */
  isHomegrown: boolean;
  /** Si ya está cedido en otro club, no se le puede pedir prestado. */
  isOnLoan: boolean;
}

export interface MarketStatus {
  window: TransferWindow;
  windowLabel: string;
  isOpen: boolean;
  /** Caja del club, para saber hasta dónde se puede llegar. */
  balanceCents: number;
  rosterSize: number;
  maxRoster: number;
  /** Nómina anual actual de la plantilla. */
  seasonWagesCents: number;
  /** Tope de nómina que consiente el consejo. */
  wageCeilingCents: number;
  /** Jugadores de formación inscritos y los que exige el reglamento. */
  homegrownInSquad: number;
  minHomegrown: number;
}

export interface MarketOfferResult {
  accepted: boolean;
  reason: string;
  /** Lo que aceptarían, si la oferta se ha quedado cerca. */
  counterOfferCents?: number;
  /** Cómo queda el mercado después de intentarlo. */
  status: MarketStatus;
}

/** Una cesión en marcha, de ida o de vuelta. */
export interface LoanEntry {
  playerId: string;
  playerName: string;
  position: Position;
  overall: number;
  /** `out` es uno tuyo cedido fuera; `in`, uno que juega aquí prestado. */
  direction: 'out' | 'in';
  /** El otro club: a dónde se fue, o de dónde vino. */
  otherTeamName: string;
  until: number | null;
}

/** Un jugador del club con su contrato, para renovar o rescindir. */
export interface ContractEntry {
  playerId: string;
  playerName: string;
  position: Position;
  age: number;
  overall: number;
  wageCents: number;
  contractUntil: number | null;
  contractYearsLeft: number;
  /** Del país del club: cuenta para el cupo. */
  isHomegrown: boolean;
  /** Está aquí cedido: ni se vende ni se rescinde. */
  isOnLoan: boolean;
  /** Lo que pediría para renovar. */
  renewalWageCents: number;
  /** Lo que costaría echarlo hoy. */
  releaseCostCents: number;
  isYouth: boolean;
}

export interface MarketApi {
  getStatus: () => Promise<MarketStatus>;
  search: (request: MarketSearchRequest) => Promise<MarketPlayer[]>;
  /** Oferta por un jugador de otro club, o firma de un agente libre. */
  offer: (request: OfferRequest) => Promise<MarketOfferResult>;
  listContracts: () => Promise<ContractEntry[]>;
  renew: (request: RenewRequest) => Promise<ContractEntry[]>;
  release: (request: { playerId: string }) => Promise<ContractEntry[]>;
  /** Cesiones en marcha, de ida y de vuelta. */
  listLoans: () => Promise<LoanEntry[]>;
  /** Cede a uno de los tuyos al club que mejor le venga. */
  loanOut: (request: LoanRequest) => Promise<MarketOfferResult>;
  /** Pide cedido a uno de otro club. */
  loanIn: (request: LoanRequest) => Promise<MarketOfferResult>;
}
