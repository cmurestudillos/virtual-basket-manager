import { z } from 'zod';
import type { Position } from '@shared/domain/positions';

export const promotePlayerRequestSchema = z.object({
  teamId: z.string().min(1),
  playerId: z.string().min(1)
});

export const upgradeYouthRequestSchema = z.object({
  teamId: z.string().min(1)
});

export type PromotePlayerRequest = z.infer<typeof promotePlayerRequestSchema>;
export type UpgradeYouthRequest = z.infer<typeof upgradeYouthRequestSchema>;

export interface YouthPlayer {
  playerId: string;
  playerName: string;
  age: number;
  position: Position;
  secondaryPosition: Position | null;
  /** Lo que vale hoy: siempre poco. */
  overall: number;
  /** Y lo que puede llegar a valer, que es de lo que va la cantera. */
  potential: number;
  heightCm: number;
}

export interface YouthAcademy {
  teamId: string;
  teamName: string;
  /** Instalaciones, 1-5. */
  level: number;
  levelLabel: string;
  /** Coste de subir un nivel; `null` si ya está al máximo. */
  upgradeCostCents: number | null;
  /** Lo que cuesta mantenerla al año. */
  upkeepCents: number;
  players: YouthPlayer[];
  /** Jugadores del primer equipo y tope: promocionar exige hueco. */
  rosterSize: number;
  maxRoster: number;
  canPromote: boolean;
  isManaged: boolean;
}

export interface YouthApi {
  get: (teamId: string) => Promise<YouthAcademy>;
  promote: (request: PromotePlayerRequest) => Promise<YouthAcademy>;
  upgrade: (request: UpgradeYouthRequest) => Promise<YouthAcademy>;
}
