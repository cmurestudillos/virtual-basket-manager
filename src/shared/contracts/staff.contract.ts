import { z } from 'zod';
import type { StaffRole } from '@shared/domain/staff';

export const staffRequestSchema = z.object({
  teamId: z.string().min(1),
  staffId: z.string().min(1)
});

export type StaffRequest = z.infer<typeof staffRequestSchema>;

export interface StaffMember {
  id: string;
  name: string;
  role: StaffRole;
  roleLabel: string;
  roleHint: string;
  level: number;
  levelLabel: string;
  /** Ficha anual, en céntimos. */
  wageCents: number;
  /** Lo que aporta, ya traducido: «Lesiones un 21 % más cortas». */
  effect: string;
}

export interface TeamStaff {
  teamId: string;
  teamName: string;
  /** Los contratados, como mucho uno por puesto. */
  members: StaffMember[];
  /** Técnicos libres, ordenados por puesto y nivel. */
  candidates: StaffMember[];
  /** Puestos sin cubrir ahora mismo. */
  vacancies: { role: StaffRole; roleLabel: string; roleHint: string }[];
  seasonWagesCents: number;
  monthlyWagesCents: number;
  isManaged: boolean;
}

export interface StaffApi {
  get: (teamId: string) => Promise<TeamStaff>;
  /** Contratar a un libre. Si el puesto estaba ocupado, el anterior queda libre. */
  hire: (request: StaffRequest) => Promise<TeamStaff>;
  fire: (request: StaffRequest) => Promise<TeamStaff>;
}
