import type { PlayerAttributes } from '@shared/domain/attributes';
import type { Position } from '@shared/domain/positions';

export interface PlayerSummary {
  id: string;
  teamId: string | null;
  firstName: string;
  lastName: string;
  nationality: string;
  age: number;
  position: Position;
  secondaryPosition: Position | null;
  heightCm: number;
  weightKg: number;
  wingspanCm: number;
  photo: string | null;
  attributes: PlayerAttributes;
  /** Media ponderada para su posición. Derivada: no está en la base de datos. */
  overall: number;
  potential: number;
  condition: number;
  morale: number;
  /** Días de baja que le quedan; 0 = disponible. */
  injuryDaysLeft: number;
  /** Qué tiene, si tiene algo. */
  injuryName: string | null;
  wageCents: number;
  valueCents: number;
}

export interface PlayersApi {
  listByTeam: (teamId: string) => Promise<PlayerSummary[]>;
  get: (id: string) => Promise<PlayerSummary | null>;
}
