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
  /** Forma física: se ve la de cualquiera, como en IBM. */
  condition: number;
  /**
   * Moral, 0-100. `null` en los jugadores que no son del usuario: el ánimo de
   * un vestuario ajeno no se ve desde fuera. Los suyos —su club y los
   * convocados de su selección— la llevan siempre.
   */
  morale: number | null;
  /** Días de baja que le quedan; 0 = disponible. */
  injuryDaysLeft: number;
  /** Qué tiene, si tiene algo. */
  injuryName: string | null;
  wageCents: number;
  valueCents: number;
  /**
   * Margen de error de lo que estás viendo, en puntos de atributo. 0 en los
   * tuyos, que los conoces; en los de fuera, lo que diga tu ojeador.
   */
  uncertainty: number;
}

export interface PlayersApi {
  listByTeam: (teamId: string) => Promise<PlayerSummary[]>;
  get: (id: string) => Promise<PlayerSummary | null>;
}
