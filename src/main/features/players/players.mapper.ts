import { overallForPosition, type PlayerAttributes } from '@shared/domain/attributes';
import type { Position } from '@shared/domain/positions';
import type { PlayerSummary } from '@shared/contracts/players.contract';
import type { PlayerRow } from '../../database/schema/save';

/**
 * Traduce una fila de `players` a lo que consume la interfaz.
 *
 * Aquí es donde se calculan la edad y la media: las dos son derivadas y ninguna
 * se guarda. Una media persistida se desincroniza en cuanto el jugador entrena,
 * y una edad persistida caduca sola al pasar el tiempo del juego.
 */
export function toPlayerSummary(row: PlayerRow, today: Date): PlayerSummary {
  const attributes: PlayerAttributes = {
    close: row.close,
    midRange: row.midRange,
    threePoint: row.threePoint,
    freeThrow: row.freeThrow,
    finishing: row.finishing,
    passing: row.passing,
    handling: row.handling,
    driving: row.driving,
    perimeterDefense: row.perimeterDefense,
    interiorDefense: row.interiorDefense,
    steal: row.steal,
    block: row.block,
    offensiveRebound: row.offensiveRebound,
    defensiveRebound: row.defensiveRebound,
    speed: row.speed,
    strength: row.strength,
    jumping: row.jumping,
    stamina: row.stamina,
    basketballIQ: row.basketballIq,
    consistency: row.consistency,
    aggression: row.aggression
  };

  const position = row.position as Position;

  return {
    id: row.id,
    teamId: row.teamId,
    firstName: row.firstName,
    lastName: row.lastName,
    nationality: row.nationality,
    age: ageAt(row.birthDate, today),
    position,
    secondaryPosition: (row.secondaryPosition as Position | null) ?? null,
    heightCm: row.heightCm,
    weightKg: row.weightKg,
    wingspanCm: row.wingspanCm,
    photo: row.photo,
    attributes,
    overall: overallForPosition(attributes, position),
    potential: row.potential,
    condition: row.condition,
    morale: row.morale,
    gamesInjured: row.gamesInjured,
    wageCents: row.wageCents,
    valueCents: row.valueCents
  };
}

/** Edad cumplida a la fecha del juego, no a la del reloj de la máquina. */
export function ageAt(birthDate: Date, today: Date): number {
  let age = today.getUTCFullYear() - birthDate.getUTCFullYear();
  const monthDiff = today.getUTCMonth() - birthDate.getUTCMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getUTCDate() < birthDate.getUTCDate())) {
    age -= 1;
  }
  return age;
}
