import { randomUUID } from 'node:crypto';
import {
  ATTRIBUTE_KEYS,
  overallForPosition,
  type PlayerAttributes
} from '@shared/domain/attributes';
import { marketValueCents, wageDemandCents } from '@shared/domain/market';
import { randomNameFor } from '@shared/domain/names';
import { POSITIONS, type Position } from '@shared/domain/positions';
import type { Rng } from '@shared/engine/basketball/rng';
import type { NewPlayerRow } from '../../database/schema/save';

/** Alturas medias por puesto; las mismas que usa el generador del dataset. */
const HEIGHT_BY_POSITION: Record<Position, number> = {
  PG: 186,
  SG: 194,
  SF: 200,
  PF: 205,
  C: 211
};

/**
 * Agentes libres con los que arranca la partida.
 *
 * Sin ellos el mercado del primer verano estaría vacío: sólo se podría fichar
 * pagando traspasos, y un club modesto no tendría nada que hacer. Son gente
 * correcta y algo mayor —el que está libre suele estarlo por algo— para que
 * sean una solución de urgencia y no un chollo.
 */
export function buildFreeAgents(input: {
  count: number;
  rng: Rng;
  seasonStartYear: number;
  /**
   * De dónde son. En un mundo con catorce países, veinte agentes libres todos
   * del mismo sitio dejarían el cupo de jugadores de formación sin nada que
   * decidir: la mitad son de casa y la otra mitad de fuera.
   */
  nationalities: readonly string[];
}): NewPlayerRow[] {
  const rows: NewPlayerRow[] = [];

  for (let index = 0; index < input.count; index += 1) {
    const position = POSITIONS[input.rng.int(0, POSITIONS.length - 1)] as Position;
    const level = input.rng.int(42, 66);
    const age = input.rng.int(23, 35);
    const nationality = input.nationalities[
      input.rng.int(0, input.nationalities.length - 1)
    ] as string;
    const { firstName, lastName } = randomNameFor(nationality, input.rng);

    const attributes = {} as PlayerAttributes;
    for (const key of ATTRIBUTE_KEYS) {
      attributes[key] = clamp(level + input.rng.int(-8, 8), 20, 85);
    }

    const overall = overallForPosition(attributes, position);
    const potential = clamp(overall + Math.max(0, 26 - age), overall, 92);
    const valueCents = marketValueCents({ overall, potential, age });
    const heightCm = (HEIGHT_BY_POSITION[position] as number) + input.rng.int(-5, 5);

    rows.push({
      id: randomUUID(),
      teamId: null,
      firstName,
      lastName,
      nationality,
      birthDate: new Date(
        Date.UTC(input.seasonStartYear - age, input.rng.int(0, 11), input.rng.int(1, 28))
      ),
      position,
      secondaryPosition: input.rng.chance(0.4)
        ? (POSITIONS[input.rng.int(0, POSITIONS.length - 1)] as Position)
        : null,
      heightCm,
      weightKg: Math.round((heightCm - 100) * 0.92),
      wingspanCm: heightCm + input.rng.int(0, 9),
      photo: null,
      close: attributes.close,
      midRange: attributes.midRange,
      threePoint: attributes.threePoint,
      freeThrow: attributes.freeThrow,
      finishing: attributes.finishing,
      passing: attributes.passing,
      handling: attributes.handling,
      driving: attributes.driving,
      perimeterDefense: attributes.perimeterDefense,
      interiorDefense: attributes.interiorDefense,
      steal: attributes.steal,
      block: attributes.block,
      offensiveRebound: attributes.offensiveRebound,
      defensiveRebound: attributes.defensiveRebound,
      speed: attributes.speed,
      strength: attributes.strength,
      jumping: attributes.jumping,
      stamina: attributes.stamina,
      basketballIq: attributes.basketballIQ,
      consistency: attributes.consistency,
      aggression: attributes.aggression,
      potential,
      condition: 100,
      morale: 70,
      injuryDaysLeft: 0,
      injuryName: null,
      trainingFocus: null,
      isYouth: false,
      wageCents: wageDemandCents({ valueCents, currentWageCents: 0 }),
      // Sin equipo no hay contrato en vigor: firma el que lo quiera.
      contractUntil: null,
      valueCents
    });
  }

  return rows;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
