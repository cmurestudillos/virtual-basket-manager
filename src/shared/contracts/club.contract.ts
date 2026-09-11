import { z } from 'zod';
import type { BoardObjective, SeasonVerdict } from '@shared/domain/board';
import { MAX_TICKET_PRICE_CENTS, MIN_TICKET_PRICE_CENTS } from '@shared/domain/attendance';
import {
  MAX_EXPANSION_SEATS,
  MIN_EXPANSION_SEATS,
  type FinanceEntryType
} from '@shared/domain/finance';

export const setTicketPriceRequestSchema = z.object({
  teamId: z.string().min(1),
  priceCents: z.number().int().min(MIN_TICKET_PRICE_CENTS).max(MAX_TICKET_PRICE_CENTS)
});

export const expandArenaRequestSchema = z.object({
  teamId: z.string().min(1),
  seats: z.number().int().min(MIN_EXPANSION_SEATS).max(MAX_EXPANSION_SEATS)
});

export type SetTicketPriceRequest = z.infer<typeof setTicketPriceRequestSchema>;
export type ExpandArenaRequest = z.infer<typeof expandArenaRequestSchema>;

export interface FinanceEntryView {
  id: string;
  happenedOn: number;
  type: FinanceEntryType;
  typeLabel: string;
  description: string;
  /** Positivo ingreso, negativo gasto. Céntimos. */
  amountCents: number;
}

export interface FinanceTotal {
  type: FinanceEntryType;
  label: string;
  amountCents: number;
}

export interface ClubFinances {
  teamId: string;
  teamName: string;
  /** Caja del club ahora mismo. */
  balanceCents: number;
  /** Nómina anual de la plantilla y lo que se paga cada mes. */
  seasonWagesCents: number;
  monthlyWagesCents: number;
  monthlyMaintenanceCents: number;

  // --- Pabellón y afición ---
  pavilionName: string;
  capacity: number;
  ticketPriceCents: number;
  seasonTicketPriceCents: number;
  seasonTicketHolders: number;
  fanSupport: number;
  fanSupportLabel: string;
  /** Asistencia que cabe esperar en el próximo partido en casa. */
  expectedAttendance: number;
  /** Y lo que dejaría en taquilla. */
  expectedGateCents: number;

  // --- Temporada en curso ---
  seasonIncomeCents: number;
  seasonExpenseCents: number;
  totals: FinanceTotal[];
  entries: FinanceEntryView[];

  // --- Obras ---
  expansionCostPerSeatCents: number;
  minExpansionSeats: number;
  maxExpansionSeats: number;
  maxCapacity: number;

  isManaged: boolean;
}

export interface BoardView {
  teamId: string;
  teamName: string;
  seasonNumber: number;
  objective: BoardObjective;
  objectiveLabel: string;
  /** Puesto con el que se da por cumplido el objetivo. */
  targetPosition: number;
  /** Puesto actual del equipo; `null` si la liga no ha empezado. */
  position: number | null;
  confidence: number;
  confidenceLabel: string;
  dismissed: boolean;
  /** Cómo va el objetivo con lo jugado hasta ahora. */
  verdict: SeasonVerdict;
}

export interface ClubApi {
  getFinances: (teamId: string) => Promise<ClubFinances>;
  setTicketPrice: (request: SetTicketPriceRequest) => Promise<ClubFinances>;
  expandArena: (request: ExpandArenaRequest) => Promise<ClubFinances>;
  getBoard: () => Promise<BoardView>;
}
