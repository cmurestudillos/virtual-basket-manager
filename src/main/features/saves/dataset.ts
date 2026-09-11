import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { PlayerAttributes } from '@shared/domain/attributes';
import type { Position } from '@shared/domain/positions';

/**
 * Lectura del dataset empaquetado (`resources/seed-data/dataset.json`), que es
 * de donde sale todo lo que existe al empezar una partida nueva.
 *
 * Se lee sin validar con Zod a propósito: no es entrada de usuario sino un
 * fichero que genera este mismo repositorio (`pnpm seed:generate`), y validar
 * cuatro mil fichas en el arranque de cada partida sólo añadiría latencia. Si
 * el fichero está mal, el generador es el sitio donde arreglarlo.
 */

export interface DatasetCompetition {
  id: string;
  name: string;
  shortName: string;
  country: string;
  /** `EUR`, `AME` u `OCE`. */
  continent: string;
  rulesetId: string;
  tier: number;
  format: string;
  playoffTeams: number;
  playoffSeriesLength: number;
}

export interface DatasetTeam {
  id: string;
  name: string;
  shortName: string;
  city: string;
  country: string;
  competitionId: string;
  pavilionName: string;
  pavilionCapacity: number;
  reputation: number;
  budgetCents: number;
}

export interface DatasetPlayer {
  id: string;
  teamId: string;
  firstName: string;
  lastName: string;
  nationality: string;
  birthDate: string;
  position: Position;
  secondaryPosition: Position | null;
  heightCm: number;
  weightKg: number;
  wingspanCm: number;
  attributes: PlayerAttributes;
  potential: number;
  wageCents: number;
  contractUntil: string;
  valueCents: number;
}

export interface Dataset {
  version: number;
  seasonStartYear: number;
  competitions: DatasetCompetition[];
  teams: DatasetTeam[];
  players: DatasetPlayer[];
}

let cached: Dataset | null = null;

/** Lee el dataset una vez y lo cachea: es el mismo para toda la sesión. */
export function loadDataset(seedDirectory: string): Dataset {
  if (cached) {
    return cached;
  }

  const raw = readFileSync(join(seedDirectory, 'dataset.json'), 'utf8');
  cached = JSON.parse(raw) as Dataset;
  return cached;
}
